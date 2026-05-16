import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { parseWindow, windowSince } from '../../lib/time-window.js'

export default async function analyticsSummaryRoute(app: FastifyInstance) {
  app.get('/api/analytics/summary', async (req, reply) => {
    const userId = req.dbUserId
    const window = parseWindow((req.query as { window?: string } | undefined)?.window)
    const now    = new Date()
    const since  = windowSince(window)
    // dailyVolume always shows 7 bars regardless of window for visual stability
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [allTasks, recentTasks, todayTasks, agents, topCommands, workflowRuns, xpProfile] = await Promise.all([
      prisma.task.findMany({
        where:  { userId, createdAt: { gte: since } },
        select: { id: true, status: true, costUsd: true, tokensUsed: true, agentId: true, createdAt: true, confidence: true, userRating: true },
      }),
      prisma.task.findMany({
        where:   { userId, createdAt: { gte: since7 } },
        select:  { id: true, status: true, costUsd: true, agentId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.task.count({
        where: { userId, createdAt: { gte: todayStart }, status: 'COMPLETE' },
      }),
      prisma.agent.findMany({
        where:  { userId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.savedCommand.findMany({
        where:   { userId },
        orderBy: { runCount: 'desc' },
        take:    5,
        select:  { title: true, rawCommand: true, runCount: true, lastRunAt: true },
      }),
      prisma.workflowRun.findMany({
        where:   { userId, startedAt: { gte: since } },
        select:  { status: true, startedAt: true },
      }),
      prisma.userXp.findUnique({
        where:  { userId },
        select: { totalXp: true, level: true, streakDays: true },
      }),
    ])

    const total       = allTasks.length
    const complete    = allTasks.filter((t) => t.status === 'COMPLETE').length
    const failed      = allTasks.filter((t) => t.status === 'FAILED').length
    const successRate = total > 0 ? Math.round((complete / total) * 100) : 0
    const totalCost   = allTasks.reduce((n, t) => n + (t.costUsd ?? 0), 0)
    const totalTokens = allTasks.reduce((n, t) => n + (t.tokensUsed ?? 0), 0)
    const avgCost     = complete > 0 ? totalCost / complete : 0

    // Per-agent task counts
    const agentCounts = agents.map((a) => ({
      agentId:   a.id,
      agentName: a.name,
      count:     allTasks.filter((t) => t.agentId === a.id && t.status === 'COMPLETE').length,
      costUsd:   allTasks.filter((t) => t.agentId === a.id).reduce((n, t) => n + (t.costUsd ?? 0), 0),
    })).sort((a, b) => b.count - a.count)

    // Daily task count + cost for last 7 days
    const dailyMap: Record<string, { count: number; costUsd: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      dailyMap[d.toISOString().slice(0, 10)] = { count: 0, costUsd: 0 }
    }
    for (const t of recentTasks) {
      const day = t.createdAt.toISOString().slice(0, 10)
      if (day in dailyMap) {
        dailyMap[day].count++
        dailyMap[day].costUsd += t.costUsd ?? 0
      }
    }

    // Confidence distribution
    const confidenceDist = {
      HIGH:   allTasks.filter((t) => t.confidence === 'HIGH').length,
      MEDIUM: allTasks.filter((t) => t.confidence === 'MEDIUM').length,
      LOW:    allTasks.filter((t) => t.confidence === 'LOW').length,
    }

    // Feedback counts
    const positiveRatings = allTasks.filter((t) => t.userRating === 'POSITIVE').length
    const negativeRatings = allTasks.filter((t) => t.userRating === 'NEGATIVE').length

    // Workflow stats
    const workflowComplete = workflowRuns.filter((r) => r.status === 'COMPLETE').length
    const workflowFailed   = workflowRuns.filter((r) => r.status === 'FAILED').length

    return reply.send({
      summary: {
        window,
        total30d:        total,
        complete30d:     complete,
        failed30d:       failed,
        todayComplete:   todayTasks,
        successRate,
        totalCostUsd:    parseFloat(totalCost.toFixed(4)),
        avgCostUsd:      parseFloat(avgCost.toFixed(4)),
        totalTokens,
        topAgents:       agentCounts.slice(0, 3),
        dailyVolume:     Object.entries(dailyMap).map(([date, v]) => ({
          date,
          count:   v.count,
          costUsd: parseFloat(v.costUsd.toFixed(4)),
        })),
        confidenceDist,
        positiveRatings,
        negativeRatings,
        topCommands:     topCommands.map((c) => ({
          title:     c.title,
          runCount:  c.runCount,
          lastRunAt: c.lastRunAt,
        })),
        workflows: {
          total30d:    workflowRuns.length,
          complete30d: workflowComplete,
          failed30d:   workflowFailed,
          successRate: workflowRuns.length > 0
            ? Math.round((workflowComplete / workflowRuns.length) * 100)
            : 0,
        },
        xp: xpProfile
          ? { totalXp: xpProfile.totalXp, level: xpProfile.level, streakDays: xpProfile.streakDays }
          : null,
      },
    })
  })
}
