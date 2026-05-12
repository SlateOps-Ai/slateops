import type { FastifyInstance } from 'fastify'
import { Webhook } from 'svix'
import { prisma } from '../../lib/prisma.js'

// This plugin does NOT use fastify-plugin so the content-type parser
// override stays scoped here and doesn't affect the rest of the app.
export default async function clerkWebhookRoute(app: FastifyInstance) {
  // Svix requires the raw body string for signature verification —
  // override the JSON parser in this scope only.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/api/clerk/webhook', async (req, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET
    if (!secret) {
      req.log.warn('CLERK_WEBHOOK_SECRET not set — webhook rejected')
      return reply.code(500).send({ error: 'Webhook not configured' })
    }

    const svixId        = req.headers['svix-id'] as string
    const svixTimestamp = req.headers['svix-timestamp'] as string
    const svixSignature = req.headers['svix-signature'] as string

    if (!svixId || !svixTimestamp || !svixSignature) {
      return reply.code(400).send({ error: 'Missing svix headers' })
    }

    const wh = new Webhook(secret)
    let event: { type: string; data: any }

    try {
      event = wh.verify(req.body as string, {
        'svix-id':        svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as { type: string; data: any }
    } catch {
      return reply.code(400).send({ error: 'Invalid signature' })
    }

    const { type, data } = event

    if (type === 'user.created' || type === 'user.updated') {
      const email = data.email_addresses?.[0]?.email_address ?? `${data.id}@clerk`
      const name  = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'User'

      await prisma.user.upsert({
        where:  { clerkId: data.id },
        update: { email, name },
        create: { clerkId: data.id, email, name },
      })

      req.log.info({ type, clerkId: data.id }, 'Clerk user synced')
    }

    if (type === 'user.deleted' && data.id) {
      // Soft-delete: deactivate all agents, keep data for audit trail
      await prisma.agent.updateMany({
        where: { user: { clerkId: data.id } },
        data:  { isActive: false },
      })
      req.log.info({ type, clerkId: data.id }, 'Clerk user deleted — agents deactivated')
    }

    return reply.send({ ok: true })
  })
}
