import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const upsertSchema = z.object({
  key:   z.string().min(1).max(100),
  value: z.string().min(1).max(2000),
})

export default async function memoryRoute(app: FastifyInstance) {

  // GET /api/agents/:id/memory — list all memories for an agent
  app.get('/api/agents/:id/memory', async (req, reply) => {
    const { id }   = req.params as { id: string }
    const userId   = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const memories = await prisma.agentMemory.findMany({
      where:   { agentId: id },
      orderBy: { updatedAt: 'desc' },
    })

    return reply.send({ memories })
  })

  // PUT /api/agents/:id/memory — upsert a single memory entry
  app.put('/api/agents/:id/memory', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId
    const body   = upsertSchema.parse(req.body)

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const memory = await prisma.agentMemory.upsert({
      where:  { agentId_key: { agentId: id, key: body.key } },
      create: { agentId: id, key: body.key, value: body.value },
      update: { value: body.value },
    })

    return reply.send({ memory })
  })

  // DELETE /api/agents/:id/memory/:key — remove a memory entry
  app.delete('/api/agents/:id/memory/:key', async (req, reply) => {
    const { id, key } = req.params as { id: string; key: string }
    const userId      = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    await prisma.agentMemory.deleteMany({ where: { agentId: id, key } })

    return reply.send({ ok: true })
  })
}
