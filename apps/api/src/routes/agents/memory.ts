import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { encrypt, decryptMemoryValue } from '../../lib/crypto.js'

const upsertSchema = z.object({
  key:   z.string().min(1).max(100),
  value: z.string().min(1).max(2000),
})

const patchSchema = z.object({
  value: z.string().min(1).max(2000),
})

export default async function memoryRoute(app: FastifyInstance) {

  // GET /api/agents/:id/memory — list all memories with provenance
  app.get('/api/agents/:id/memory', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const memories = await prisma.agentMemory.findMany({
      where:   { agentId: id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id:         true,
        key:        true,
        value:      true,
        memoryType: true,
        source:     true,
        taskId:     true,
        confidence: true,
        createdAt:  true,
        updatedAt:  true,
      },
    })

    // Enrich with task title for provenance display
    const taskIds = [...new Set(memories.map((m) => m.taskId).filter(Boolean))] as string[]
    const tasks   = taskIds.length
      ? await prisma.task.findMany({
          where:  { id: { in: taskIds } },
          select: { id: true, title: true, completedAt: true },
        })
      : []

    const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]))

    const enriched = memories.map((m) => ({
      ...m,
      value:           decryptMemoryValue(m.value) ?? '',
      taskTitle:       m.taskId ? (taskMap[m.taskId]?.title ?? null) : null,
      taskCompletedAt: m.taskId ? (taskMap[m.taskId]?.completedAt ?? null) : null,
    }))

    return reply.send({ memories: enriched })
  })

  // PUT /api/agents/:id/memory — manual upsert (source = MANUAL)
  app.put('/api/agents/:id/memory', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId
    const body   = upsertSchema.parse(req.body)

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const encryptedValue = encrypt(body.value)
    const memory = await prisma.agentMemory.upsert({
      where:  { agentId_key: { agentId: id, key: body.key } },
      create: {
        agentId:    id,
        key:        body.key,
        value:      encryptedValue,
        source:     'MANUAL',
        confidence: null,
        taskId:     null,
      },
      update: {
        value:  encryptedValue,
        source: 'MANUAL',
        taskId: null,
      },
    })

    return reply.send({ memory: { ...memory, value: body.value } })
  })

  // PATCH /api/agents/:id/memory/:memoryId — edit value only (preserves source/provenance)
  app.patch('/api/agents/:id/memory/:memoryId', async (req, reply) => {
    const { id, memoryId } = req.params as { id: string; memoryId: string }
    const userId            = req.dbUserId
    const body              = patchSchema.parse(req.body)

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const existing = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId: id },
    })
    if (!existing) return reply.code(404).send({ error: 'Memory not found' })

    const memory = await prisma.agentMemory.update({
      where: { id: memoryId },
      data:  { value: encrypt(body.value) },
    })

    return reply.send({ memory: { ...memory, value: body.value } })
  })

  // DELETE /api/agents/:id/memory/:key — remove by key (legacy URL)
  app.delete('/api/agents/:id/memory/:key', async (req, reply) => {
    const { id, key } = req.params as { id: string; key: string }
    const userId      = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    await prisma.agentMemory.deleteMany({ where: { agentId: id, key } })

    return reply.send({ ok: true })
  })

  // DELETE /api/agents/:id/memory/id/:memoryId — remove by DB id
  app.delete('/api/agents/:id/memory/id/:memoryId', async (req, reply) => {
    const { id, memoryId } = req.params as { id: string; memoryId: string }
    const userId            = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    await prisma.agentMemory.deleteMany({ where: { id: memoryId, agentId: id } })

    return reply.send({ ok: true })
  })
}
