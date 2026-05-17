import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { clerkPlugin, getAuth, clerkClient } from '@clerk/fastify'
import { prisma } from '../lib/prisma.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId:   string
    dbUserId: string
  }
}

/**
 * Fire-and-forget Clerk profile backfill. Runs in the background; never
 * blocks the request that triggered it. Idempotent — a successful update
 * removes the `@clerk` suffix from email, after which this is a no-op.
 *
 * Replaces the previous in-path `await clerkClient.users.getUser(...)` that
 * stalled every authenticated request whose DB row still had the placeholder
 * email (i.e. every existing user, on every request).
 */
function scheduleProfileBackfill(dbUserId: string, clerkId: string): void {
  setImmediate(async () => {
    try {
      const u = await clerkClient.users.getUser(clerkId)
      const primaryEmail = u.emailAddresses.find((e: any) => e.id === u.primaryEmailAddressId)?.emailAddress
                         ?? u.emailAddresses[0]?.emailAddress
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
                 || u.username
                 || 'User'
      if (!primaryEmail) return
      await prisma.user.update({
        where: { id: dbUserId },
        data:  { email: primaryEmail, name },
      })
    } catch {
      // Clerk unreachable / rate-limited / user gone — fall through. The
      // next authenticated request will re-attempt this if the email is
      // still the @clerk placeholder.
    }
  })
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(clerkPlugin as any, {
    secretKey:      process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  })

  app.decorateRequest('userId',   '')
  app.decorateRequest('dbUserId', '')

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (
      req.url === '/health' ||
      req.url === '/api/clerk/webhook' ||
      req.url.startsWith('/api/public-chat') ||
      req.url.startsWith('/webhooks/') ||
      req.url.startsWith('/api/billing/webhook')
    ) return

    const { userId } = getAuth(req)
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    req.userId = userId

    // Hot path: one upsert keyed on Clerk ID. New rows still get the
    // `<clerkId>@clerk` placeholder; the backfill below replaces it
    // asynchronously without holding up this request. The Clerk webhook
    // is the canonical source of email updates.
    const user = await prisma.user.upsert({
      where:  { clerkId: userId },
      update: {},
      create: { clerkId: userId, email: `${userId}@clerk`, name: 'User' },
      select: { id: true, email: true },
    })
    req.dbUserId = user.id

    // Office row is needed by downstream queries; cheap upsert.
    await prisma.office.upsert({
      where:  { userId: user.id },
      update: {},
      create: { userId: user.id },
    })

    // Background email/name backfill when the row still has the placeholder.
    // Non-blocking; logs nothing on failure to avoid log spam.
    if (user.email.endsWith('@clerk')) {
      scheduleProfileBackfill(user.id, userId)
    }
  })
})
