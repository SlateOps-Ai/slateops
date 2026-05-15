import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

export default async function collaborationFeedRoute(app: FastifyInstance) {
  app.get('/api/collaboration/feed', async (req, reply) => {
    const userId = req.dbUserId

    const runs = await prisma.workflowRun.findMany({
      where:   { userId },
      orderBy: { startedAt: 'desc' },
      take:    15,
      include: { workflow: { select: { name: true, steps: true } } },
    })

    // Resolve agent info for each step
    const agentIds = new Set<string>()
    for (const run of runs) {
      const steps = run.workflow.steps as any[]
      for (const s of steps) agentIds.add(s.agentId)
    }

    const agents = await prisma.agent.findMany({
      where:  { id: { in: Array.from(agentIds) }, userId },
      select: { id: true, name: true, avatarUrl: true, role: true },
    })
    const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

    const result = runs.map((run) => {
      const steps       = run.workflow.steps as any[]
      const stepOutputs = run.stepOutputs as any[]

      return {
        id:           run.id,
        workflowName: run.workflow.name,
        status:       run.status,
        startedAt:    run.startedAt.toISOString(),
        completedAt:  run.completedAt?.toISOString() ?? null,
        steps: steps.map((step, i) => {
          const out    = stepOutputs.find((o: any) => o.label === step.label || o.stepIndex === i)
          const agent  = agentMap[step.agentId]
          return {
            index:       i,
            label:       step.label,
            agentId:     step.agentId,
            agentName:   agent?.name ?? 'Unknown',
            agentAvatar: agent?.avatarUrl ?? '',
            agentRole:   agent?.role ?? '',
            status:      out?.status ?? (run.status === 'RUNNING' && i === stepOutputs.length ? 'IN_PROGRESS' : i < stepOutputs.length ? 'COMPLETE' : 'PENDING'),
            taskId:      out?.taskId ?? null,
          }
        }),
      }
    })

    return reply.send({ runs: result })
  })
}
