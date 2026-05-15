import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

export default async function stripeWebhookRoute(app: FastifyInstance) {
  // Raw body needed for Stripe signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_, body, done) => {
    done(null, body)
  })

  app.post('/api/billing/webhook', async (req, reply) => {
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
      const { userId, credits, paymentId } = session.metadata ?? {}

      if (!userId || !credits || !paymentId) {
        return reply.code(400).send({ error: 'Missing metadata' })
      }

      const creditCount = parseInt(credits, 10)

      await Promise.all([
        prisma.stripePayment.update({
          where: { id: paymentId },
          data:  {
            status:         'COMPLETE',
            stripePaymentId: session.payment_intent ?? null,
            completedAt:    new Date(),
          },
        }),
        prisma.creditEntry.create({
          data: {
            userId,
            amount:      creditCount,
            reason:      'PURCHASE',
            description: `Purchased ${creditCount} credits`,
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data:  { creditsRemaining: { increment: creditCount } },
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
}
