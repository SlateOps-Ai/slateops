import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { parseWindow, windowSince } from '../../lib/time-window.js'

export default async function roiRoute(app: FastifyInstance) {
  app.get('/api/roi/summary', async (req, reply) => {
    const userId = req.dbUserId
    const window = parseWindow((req.query as { window?: string } | undefined)?.window)
    const since  = windowSince(window)

    const [tasks, workflows, settings] = await Promise.all([
      prisma.task.findMany({
        where:  { userId, status: 'COMPLETE', completedAt: { gte: since } },
        select: { id: true, complexity: true, createdAt: true, completedAt: true },
      }),
      prisma.workflowRun.findMany({
        where:  { userId, status: 'COMPLETE', startedAt: { gte: since } },
        select: { id: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { settings: true } }),
    ])

    const hourlyRate = ((settings?.settings as any)?.hourlyRate ?? 75) as number

    // Estimate minutes saved per task by complexity
    const minuteMap: Record<string, number> = { SIMPLE: 20, MEDIUM: 45, COMPLEX: 90 }
    const totalMinutesSaved = tasks.reduce((acc, t) => acc + (minuteMap[t.complexity ?? 'SIMPLE'] ?? 25), 0)

    const allTasks = await prisma.task.count({ where: { userId, createdAt: { gte: since }, status: { not: 'CANCELLED' } } })
    const contentPieces = await prisma.task.count({
      where: {
        userId,
        status:     'COMPLETE',
        createdAt:  { gte: since },
        agent:      { role: { in: ['CONTENT_WRITER', 'MARKETING_STRATEGIST'] } },
      },
    })

    const successRate = allTasks > 0 ? Math.round((tasks.length / allTasks) * 100) : 0

    return reply.send({
      hourlyRate,
      window,
      data: {
        tasksCompleted30d: tasks.length,
        avgMinutesPerTask: tasks.length > 0 ? Math.round(totalMinutesSaved / tasks.length) : 0,
        totalMinutesSaved,
        contentPieces,
        workflowRuns: workflows.length,
        successRate,
      },
    })
  })

  app.post('/api/roi/rate', async (req, reply) => {
    const userId = req.dbUserId
    const { hourlyRate } = z.object({ hourlyRate: z.number().positive() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw  = (user?.settings as any) ?? {}
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, hourlyRate } } })
    return reply.send({ ok: true })
  })
}
