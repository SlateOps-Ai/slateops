import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '../../lib/prisma.js'

// Wrapped in fp() and registered in a nested scope so the buffer parser
// is local to this route only and can't leak into other JSON endpoints.
const stripeWebhookRoute = fp(async function stripeWebhookRoute(app: FastifyInstance) {
  await app.register(async (instance) => {
    instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_, body, done) => {
      done(null, body)
    })

    instance.post('/api/billing/webhook', async (req, reply) => {
      const sig     = req.headers['stripe-signature'] as string | undefined
      const secret  = process.env.STRIPE_WEBHOOK_SECRET
      const rawBody = req.body as Buffer

      if (!secret || !sig) {
        return reply.code(400).send({ error: 'Webhook not configured' })
      }

      let event: { type: string; data: { object: Record<string, unknown> } }

      try {
        const { default: Stripe } = await import('stripe')
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' })
        event = stripe.webhooks.constructEvent(rawBody, sig, secret) as any
      } catch (err: any) {
        return reply.code(400).send({ error: `Webhook signature failed: ${err.message}` })
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any
        const paymentId = session.metadata?.paymentId
        if (!paymentId) return reply.code(400).send({ error: 'Missing paymentId metadata' })

        // Defence-in-depth: re-derive userId + credit count from the StripePayment
        // row we created at checkout time. Never trust metadata for amounts.
        const payment = await prisma.stripePayment.findUnique({
          where:  { id: paymentId },
          select: { id: true, userId: true, credits: true, status: true },
        })
        if (!payment) return reply.code(404).send({ error: 'Payment record not found' })
        if (payment.status === 'COMPLETE') return reply.send({ received: true, idempotent: true })
        if (payment.status !== 'PENDING')  return reply.code(409).send({ error: 'Payment not pending' })

        await Promise.all([
          prisma.stripePayment.update({
            where: { id: payment.id },
            data:  {
              status:         'COMPLETE',
              stripePaymentId: session.payment_intent ?? null,
              completedAt:    new Date(),
            },
          }),
          prisma.creditEntry.create({
            data: {
              userId:      payment.userId,
              amount:      payment.credits,
              reason:      'PURCHASE',
              description: `Purchased ${payment.credits} credits`,
            },
          }),
          prisma.user.update({
            where: { id: payment.userId },
            data:  { creditsRemaining: { increment: payment.credits } },
          }),
        ])
      }

      if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
        const session = event.data.object as any
        const paymentId = session.metadata?.paymentId
        if (paymentId) {
          await prisma.stripePayment.updateMany({
            where: { id: paymentId, status: 'PENDING' },
            data:  { status: 'FAILED' },
          })
        }
      }

      return reply.send({ received: true })
    })
  })
})

export default stripeWebhookRoute
