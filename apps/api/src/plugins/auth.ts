import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { clerkPlugin, getAuth } from '@clerk/fastify'
import { prisma } from '../lib/prisma.js'

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
    if (req.url === '/health' || req.url === '/api/clerk/webhook') return

    const { userId } = getAuth(req)
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    req.userId = userId

    const user = await prisma.user.upsert({
      where:  { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email:   `${userId}@clerk`,
        name:    'User',
      },
    })

    req.dbUserId = user.id

    await prisma.office.upsert({
      where:  { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
  })
})
