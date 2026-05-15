import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

export default async function executiveRoute(app: FastifyInstance) {
  app.get('/api/analytics/executive', async (req, reply) => {
    try {
    const userId  = req.dbUserId
    const now     = new Date()
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [allTasks, agents, schedules, approvalTasks] = await Promise.all([
      prisma.task.findMany({
        where:   { userId },
        select:  {
          id: true, title: true, status: true, agentId: true,
          createdAt: true, completedAt: true, userRating: true,
        },
        orderBy: { createdAt: 'desc' },
        take:    500,
      }),
      prisma.agent.findMany({
        where:   { userId },
        select:  { id: true, name: true, role: true, avatarUrl: true, status: true },
      }),
      prisma.scheduledRun.findMany({
        where:   { userId, isActive: true },
        select:  {
          id: true, label: true, cronExpr: true,
          savedCommand: { select: { title: true, agent: { select: { name: true } } } },
        },
      }),
      prisma.task.findMany({
        where:   { userId, status: { in: ['NEEDS_APPROVAL', 'PENDING'] } },
        select:  { id: true, title: true, agentId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    20,
      }),
    ])

    // ── Overview totals ────────────────────────────────────────────
    const countBy = (s: string) => allTasks.filter((t) => t.status === s).length
    const complete    = countBy('COMPLETE')
    const failed      = countBy('FAILED')
    const pending     = countBy('PENDING')
    const inProgress  = countBy('IN_PROGRESS')
    const needsApproval = countBy('NEEDS_APPROVAL')
    const cancelled   = countBy('CANCELLED')
    const total       = allTasks.length
    const successRate = (complete + failed) > 0
      ? Math.round((complete / (complete + failed)) * 100)
      : 0

    const ratedTasks    = allTasks.filter((t) => t.userRating != null)
    const positiveRated = ratedTasks.filter((t) => t.userRating === 'POSITIVE').length
    const negativeRated = ratedTasks.filter((t) => t.userRating === 'NEGATIVE').length
    const satisfactionRate = ratedTasks.length > 0
      ? Math.round((positiveRated / ratedTasks.length) * 100)
      : null

    // ── Per-agent breakdown ────────────────────────────────────────
    const agentRows = agents.map((a) => {
      const agentTasks = allTasks.filter((t) => t.agentId === a.id)
      const ac = (s: string) => agentTasks.filter((t) => t.status === s).length
      const ac_complete = ac('COMPLETE')
      const ac_failed   = ac('FAILED')
      const lastTask    = agentTasks[0]
      const agentSchedules = schedules.filter(
        (s) => (s.savedCommand as any)?.agent?.name === a.name
      )
      const agentRated    = agentTasks.filter((t) => t.userRating != null)
      const agentPositive = agentRated.filter((t) => t.userRating === 'POSITIVE').length
      const agentNegative = agentRated.filter((t) => t.userRating === 'NEGATIVE').length
      return {
        id:             a.id,
        name:           a.name,
        role:           a.role,
        avatarUrl:      a.avatarUrl,
        status:         a.status,
        scheduledCount: agentSchedules.length,
        lastTaskAt:     lastTask?.createdAt?.toISOString() ?? null,
        tasks: {
          total:          agentTasks.length,
          complete:       ac_complete,
          failed:         ac_failed,
          pending:        ac('PENDING'),
          inProgress:     ac('IN_PROGRESS'),
          needsApproval:  ac('NEEDS_APPROVAL'),
          successRate:    (ac_complete + ac_failed) > 0
            ? Math.round((ac_complete / (ac_complete + ac_failed)) * 100)
            : 0,
          ratedCount:       agentRated.length,
          positiveRatings:  agentPositive,
          negativeRatings:  agentNegative,
          satisfactionRate: agentRated.length > 0
            ? Math.round((agentPositive / agentRated.length) * 100)
            : null,
        },
      }
    })

    // ── Scheduled task stats ─────────────────────────────────────
    const sched_complete = 0
    const sched_failed   = 0

    // Next fire times (reuse the computeNext logic from index.ts via inline)
    function nextFire(expr: string): string {
      const [minF, hourF, , , dowF] = expr.trim().split(/\s+/)
      const next = new Date()
      next.setSeconds(0, 0)
      next.setMinutes(minF === '*' ? next.getMinutes() : parseInt(minF))
      next.setHours(hourF === '*' ? next.getHours() : parseInt(hourF))
      if (next <= now) next.setDate(next.getDate() + 1)
      if (dowF !== '*') {
        const target = parseInt(dowF)
        while (next.getDay() !== target) next.setDate(next.getDate() + 1)
      }
      return next.toISOString()
    }

    const upcoming = schedules.slice(0, 6).map((s) => ({
      id:           s.id,
      label:        s.label,
      commandTitle: (s.savedCommand as any)?.title ?? s.label,
      agentName:    (s.savedCommand as any)?.agent?.name ?? '—',
      cronExpr:     s.cronExpr,
      nextRun:      nextFire(s.cronExpr),
    }))

    // ── Pending action items ───────────────────────────────────────
    const agentNameMap = Object.fromEntries(agents.map((a) => [a.id, a.name]))
    const pendingActions = approvalTasks.map((t) => ({
      taskId:    t.id,
      title:     t.title,
      agentName: agentNameMap[t.agentId] ?? '—',
      agentId:   t.agentId,
      status:    t.status,
      createdAt: t.createdAt.toISOString(),
    }))

    // ── Recent failures ────────────────────────────────────────────
    const recentFailed = allTasks
      .filter((t) => t.status === 'FAILED')
      .slice(0, 8)
      .map((t) => ({
        taskId:    t.id,
        title:     t.title,
        agentName: agentNameMap[t.agentId] ?? '—',
        createdAt: t.createdAt.toISOString(),
      }))

    return reply.send({
      overview: { total, complete, failed, pending, inProgress, needsApproval, cancelled, successRate, ratedCount: ratedTasks.length, positiveRated, negativeRated, satisfactionRate },
      agents:   agentRows,
      scheduled: {
        totalActive: schedules.length,
        ran30d:      0,
        complete30d: sched_complete,
        failed30d:   sched_failed,
        successRate: (sched_complete + sched_failed) > 0
          ? Math.round((sched_complete / (sched_complete + sched_failed)) * 100)
          : 0,
        upcoming,
      },
      pendingActions,
      recentFailed,
    })
    } catch (err) {
      app.log.error({ err }, 'executive route error')
      return reply.code(500).send({ error: (err as Error).message ?? 'Internal error', agents: [], overview: null, scheduled: null, pendingActions: [], recentFailed: [] })
    }
  })
}
