import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const patchSchema = z.object({
  byokKey:  z.string().min(10).max(300).nullable().optional(),
  name:     z.string().min(1).max(100).optional(),
})

export default async function settingsRoute(app: FastifyInstance) {
  app.get('/api/user/settings', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where:  { id: req.dbUserId },
      select: {
        id: true, name: true, email: true,
        plan: true, creditsRemaining: true,
        byokKey: true, byokProvider: true,
      },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })

    return reply.send({
      settings: {
        ...user,
        // Never send the raw key — send masked or null
        byokKey: user.byokKey
          ? `sk-ant-...${user.byokKey.slice(-6)}`
          : null,
        byokConfigured: !!user.byokKey,
      },
    })
  })

  app.patch('/api/user/settings', async (req, reply) => {
    const body = patchSchema.parse(req.body)

    const data: Record<string, unknown> = {}
    if (body.name !== undefined)    data.name = body.name
    if (body.byokKey !== undefined) {
      data.byokKey      = body.byokKey   // null clears it
      data.byokProvider = body.byokKey ? 'ANTHROPIC' : null
    }

    const user = await prisma.user.update({
      where:  { id: req.dbUserId },
      data,
      select: {
        id: true, name: true, email: true,
        plan: true, creditsRemaining: true, byokKey: true,
      },
    })

    return reply.send({
      settings: {
        ...user,
        byokKey: user.byokKey ? `sk-ant-...${user.byokKey.slice(-6)}` : null,
        byokConfigured: !!user.byokKey,
      },
    })
  })
}
