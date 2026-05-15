import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const createSchema = z.object({
  title:   z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
})

export default async function agentKnowledgeRoute(app: FastifyInstance) {
  // List all KB items for an agent
  app.get('/api/agents/:id/knowledge', async (req, reply) => {
    const { id } = req.params as { id: string }

    const agent = await prisma.agent.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const items = await prisma.agentKnowledge.findMany({
      where:   { agentId: id },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, title: true, content: true, createdAt: true },
    })
    return reply.send({ items })
  })

  // Add a KB item
  app.post('/api/agents/:id/knowledge', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = createSchema.parse(req.body)

    const agent = await prisma.agent.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const item = await prisma.agentKnowledge.create({
      data: { agentId: id, title: body.title, content: body.content },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(req.dbUserId, 'ADD_KNOWLEDGE', item.id))
      .catch(() => {})

    return reply.code(201).send({ item })
  })

  // Delete a KB item
  app.delete('/api/agents/:id/knowledge/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string }

    const agent = await prisma.agent.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    await prisma.agentKnowledge.deleteMany({
      where: { id: itemId, agentId: id },
    })
    return reply.send({ ok: true })
  })
}
