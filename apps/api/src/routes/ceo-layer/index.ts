import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

export default async function ceoLayerRoute(app: FastifyInstance) {
  app.get('/api/ceo-layer/summary', async (req, reply) => {
    const userId = req.dbUserId

    const [pendingTasks, recentTasks, agents] = await Promise.all([
      prisma.task.findMany({
        where:   { userId, status: 'NEEDS_APPROVAL' },
        include: {
          agent: { select: { name: true, avatarUrl: true, role: true } },
          approvalRequests: {
            where:   { status: 'PENDING' },
            orderBy: { requestedAt: 'desc' },
            take:    1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where:   { userId, status: { in: ['COMPLETE', 'FAILED', 'CANCELLED'] } },
        include: { agent: { select: { name: true, avatarUrl: true } } },
        orderBy: { completedAt: 'desc' },
        take:    30,
      }),
      prisma.agent.findMany({
        where:  { userId, isActive: true },
        select: { id: true, name: true, status: true, role: true },
      }),
    ])

    const pendingApprovals = pendingTasks.map((t) => {
      const ar = t.approvalRequests[0]
      return {
        id:          t.id,
        title:       t.title,
        agentName:   t.agent.name,
        agentAvatar: t.agent.avatarUrl,
        agentRole:   t.agent.role,
        action:      ar?.action ?? 'Review required',
        preview:     ar?.preview ?? null,
        createdAt:   t.createdAt.toISOString(),
        expiresAt:   ar?.expiresAt.toISOString() ?? null,
      }
    })

    const recentActivity = recentTasks.map((t) => ({
      id:          t.id,
      title:       t.title,
      status:      t.status,
      agentName:   t.agent.name,
      agentAvatar: t.agent.avatarUrl,
      completedAt: t.completedAt?.toISOString() ?? t.createdAt.toISOString(),
      costUsd:     t.costUsd,
    }))

    return reply.send({
      pendingCount:     pendingApprovals.length,
      pendingApprovals,
      recentActivity,
      agentSummary:     agents,
    })
  })
}
