import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

// Credit packages available for purchase
export const CREDIT_PACKAGES = [
  { id: 'starter',  credits: 10,  amountUsd: 5,   label: 'Starter',   priceId: process.env.STRIPE_PRICE_STARTER  ?? '' },
  { id: 'pro',      credits: 50,  amountUsd: 20,  label: 'Pro',       priceId: process.env.STRIPE_PRICE_PRO      ?? '' },
  { id: 'power',    credits: 150, amountUsd: 50,  label: 'Power',     priceId: process.env.STRIPE_PRICE_POWER    ?? '' },
  { id: 'agency',   credits: 500, amountUsd: 150, label: 'Agency',    priceId: process.env.STRIPE_PRICE_AGENCY   ?? '' },
]

async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const { default: Stripe } = await import('stripe')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

async function getOrCreateStripeCustomer(stripe: NonNullable<Awaited<ReturnType<typeof getStripe>>>, userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  })
  if (!user) throw new Error('User not found')
  if (user.stripeCustomerId) return user.stripeCustomerId

  const customer = await stripe.customers.create({
    email:    user.email,
    name:     user.name,
    metadata: { userId },
  })
  await prisma.user.update({
    where: { id: userId },
    data:  { stripeCustomerId: customer.id },
  })
  return customer.id
}

export default async function billingRoute(app: FastifyInstance) {

  // GET /api/billing/packages — list credit packages (always works, no Stripe needed)
  app.get('/api/billing/packages', async (_req, reply) => {
    return reply.send({
      packages: CREDIT_PACKAGES.map((p) => ({
        id:         p.id,
        credits:    p.credits,
        amountUsd:  p.amountUsd,
        label:      p.label,
        pricePerCredit: parseFloat((p.amountUsd / p.credits).toFixed(2)),
      })),
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    })
  })

  // POST /api/billing/checkout — create a Stripe Checkout Session
  app.post('/api/billing/checkout', async (req, reply) => {
    const { packageId } = req.body as { packageId: string }
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId)
    if (!pkg) return reply.code(400).send({ error: 'Invalid package' })

    const stripe = await getStripe()
    if (!stripe) return reply.code(503).send({ error: 'Billing not configured', code: 'STRIPE_NOT_CONFIGURED' })
    if (!pkg.priceId) return reply.code(503).send({ error: 'Price not configured for this package', code: 'PRICE_NOT_CONFIGURED' })

    const customerId = await getOrCreateStripeCustomer(stripe, req.dbUserId)

    const payment = await prisma.stripePayment.create({
      data: {
        userId:          req.dbUserId,
        stripeSessionId: 'pending_' + crypto.randomUUID(),
        credits:         pkg.credits,
        amountUsd:       pkg.amountUsd,
        status:          'PENDING',
      },
    })

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      mode:        'payment',
      customer:    customerId,
      line_items:  [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${webUrl}/office?billing=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${webUrl}/office?billing=cancelled`,
      metadata:    {
        userId:    req.dbUserId,
        packageId: pkg.id,
        credits:   String(pkg.credits),
        paymentId: payment.id,
      },
    })

    // Update payment record with real session ID
    await prisma.stripePayment.update({
      where: { id: payment.id },
      data:  { stripeSessionId: session.id },
    })

    return reply.send({ url: session.url, sessionId: session.id })
  })

  // POST /api/billing/subscribe — create a Stripe subscription Checkout session
  app.post('/api/billing/subscribe', async (req, reply) => {
    const { plan } = req.body as { plan: 'growth' | 'business' }

    const SUBSCRIPTION_PLANS = {
      growth:   { label: 'Growth',   priceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY   ?? '' },
      business: { label: 'Business', priceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? '' },
    }

    const selected = SUBSCRIPTION_PLANS[plan]
    if (!selected) return reply.code(400).send({ error: 'Invalid plan' })

    const stripe = await getStripe()
    if (!stripe) return reply.code(503).send({ error: 'Billing not yet configured', code: 'STRIPE_NOT_CONFIGURED' })
    if (!selected.priceId) return reply.code(503).send({ error: 'Plan price not configured', code: 'PRICE_NOT_CONFIGURED' })

    const customerId = await getOrCreateStripeCustomer(stripe, req.dbUserId)
    const webUrl     = process.env.WEB_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode:                'subscription',
      customer:            customerId,
      line_items:          [{ price: selected.priceId, quantity: 1 }],
      success_url:         `${webUrl}/office?upgrade=success&plan=${plan}`,
      cancel_url:          `${webUrl}/office?upgrade=cancelled`,
      allow_promotion_codes: true,
      metadata:            { userId: req.dbUserId, plan },
    })

    return reply.send({ url: session.url, sessionId: session.id })
  })

  // GET /api/billing/history — paginated payment history
  app.get('/api/billing/history', async (req, reply) => {
    const payments = await prisma.stripePayment.findMany({
      where:   { userId: req.dbUserId },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select: {
        id: true, credits: true, amountUsd: true,
        status: true, createdAt: true, completedAt: true,
      },
    })
    return reply.send({ payments })
  })
}
