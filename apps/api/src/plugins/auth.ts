import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken } from '@clerk/backend'
import { prisma } from '../lib/prisma.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId:   string
    dbUserId: string
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('userId',   '')
  app.decorateRequest('dbUserId', '')

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check and Clerk webhook (verified by svix signature)
    if (req.url === '/health' || req.url === '/api/clerk/webhook') return

    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing authorization header' })
    }

    const token = header.slice(7)

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      })
      req.userId = payload.sub

      // Upsert user in DB on first request
      const user = await prisma.user.upsert({
        where:  { clerkId: payload.sub },
        update: {},
        create: {
          clerkId: payload.sub,
          email:   (payload as any).email_addresses?.[0]?.email_address ?? `${payload.sub}@clerk`,
          name:    (payload as any).first_name ?? 'User',
        },
      })

      req.dbUserId = user.id

      // Ensure office exists
      await prisma.office.upsert({
        where:  { userId: user.id },
        update: {},
        create: { userId: user.id },
      })
    } catch {
      return reply.code(401).send({ error: 'Invalid token' })
    }
  })
})
