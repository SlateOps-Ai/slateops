import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { clerkPlugin, getAuth, clerkClient } from '@clerk/fastify'
import { prisma } from '../lib/prisma.js'

async function fetchClerkProfile(clerkId: string): Promise<{ email: string; name: string }> {
  try {
    const u = await clerkClient.users.getUser(clerkId)
    const primaryEmail = u.emailAddresses.find((e: any) => e.id === u.primaryEmailAddressId)?.emailAddress
                       ?? u.emailAddresses[0]?.emailAddress
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
                 || u.username
                 || 'User'
    return {
      email: primaryEmail ?? `${clerkId}@clerk`,
      name,
    }
  } catch {
    return { email: `${clerkId}@clerk`, name: 'User' }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    userId:   string
    dbUserId: string
  }
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

    // Look up the canonical email + name from Clerk on first sight (or when
    // we still have the fake `<clerkId>@clerk` placeholder from a previous
    // build that didn't sync). Future requests skip the Clerk call because
    // the local row is already populated; the Clerk webhook keeps it fresh.
    const existing = await prisma.user.findUnique({
      where:  { clerkId: userId },
      select: { id: true, email: true },
    })

    let user: { id: string }
    if (!existing) {
      const profile = await fetchClerkProfile(userId)
      user = await prisma.user.create({
        data: { clerkId: userId, email: profile.email, name: profile.name },
        select: { id: true },
      })
    } else if (existing.email.endsWith('@clerk')) {
      const profile = await fetchClerkProfile(userId)
      user = await prisma.user.update({
        where:  { id: existing.id },
        data:   { email: profile.email, name: profile.name },
        select: { id: true },
      })
    } else {
      user = existing
    }

    req.dbUserId = user.id

    await prisma.office.upsert({
      where:  { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
  })
})
