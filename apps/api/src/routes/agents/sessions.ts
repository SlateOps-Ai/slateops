import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

export default async function sessionsRoute(app: FastifyInstance) {

  // GET /api/agents/:id/sessions — recent task history with summary stats
  app.get('/api/agents/:id/sessions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const tasks = await prisma.task.findMany({
      where:   { agentId: id, userId },
      orderBy: { createdAt: 'desc' },
      take:    30,
      select: {
        id:          true,
        title:       true,
        rawCommand:  true,
        status:      true,
        complexity:  true,
        confidence:  true,
        userRating:  true,
        tokensUsed:  true,
        costUsd:     true,
        createdAt:   true,
        startedAt:   true,
        completedAt: true,
        _count: {
          select: {
            steps:     true,
            toolCalls: true,
          },
        },
      },
    })

    // Attach memory counts per task (how many memories this task generated)
    const taskIds = tasks.map((t) => t.id)
    const memCounts = await prisma.agentMemory.groupBy({
      by:    ['taskId'],
      where: { taskId: { in: taskIds } },
      _count: { id: true },
    })
    const memMap = Object.fromEntries(memCounts.map((m) => [m.taskId, m._count.id]))

    const sessions = tasks.map((t) => ({
      ...t,
      stepCount:  t._count.steps,
      toolCount:  t._count.toolCalls,
      memCount:   memMap[t.id] ?? 0,
      durationMs: t.startedAt && t.completedAt
        ? new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()
        : null,
    }))

    return reply.send({ sessions })
  })

  // GET /api/agents/:id/sessions/:taskId — full drill-down for one task
  app.get('/api/agents/:id/sessions/:taskId', async (req, reply) => {
    const { id, taskId } = req.params as { id: string; taskId: string }
    const userId         = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const task = await prisma.task.findFirst({
      where: { id: taskId, agentId: id, userId },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: {
            toolCalls: {
              orderBy: { createdAt: 'asc' },
              select: {
                id:         true,
                toolName:   true,
                input:      true,
                output:     true,
                status:     true,
                durationMs: true,
                createdAt:  true,
              },
            },
          },
        },
        events: {
          orderBy: { sequenceNumber: 'asc' },
          take:    50,
          select: {
            id:             true,
            eventType:      true,
            payload:        true,
            timestamp:      true,
            sequenceNumber: true,
          },
        },
      },
    })

    if (!task) return reply.code(404).send({ error: 'Task not found' })

    // Memories written during this task
    const memories = await prisma.agentMemory.findMany({
      where:   { agentId: id, taskId },
      orderBy: { createdAt: 'asc' },
      select: {
        id:         true,
        key:        true,
        value:      true,
        source:     true,
        confidence: true,
        createdAt:  true,
      },
    })

    return reply.send({ task, memories })
  })
}
