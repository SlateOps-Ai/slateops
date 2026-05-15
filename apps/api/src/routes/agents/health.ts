import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function agentHealthRoute(app: FastifyInstance) {

  app.get('/api/agents/:id/health', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const agent = await prisma.agent.findFirst({ where: { id, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const now   = new Date()
    const day7  = new Date(now.getTime() - 7  * 86400_000)
    const day30 = new Date(now.getTime() - 30 * 86400_000)
    const day14 = new Date(now.getTime() - 14 * 86400_000)

    // ── All tasks (last 30d) for trend data ─────────────────────────
    const tasks30 = await prisma.task.findMany({
      where:  { agentId: id, userId, createdAt: { gte: day30 } },
      select: {
        id:          true,
        status:      true,
        costUsd:     true,
        tokensUsed:  true,
        confidence:  true,
        startedAt:   true,
        completedAt: true,
        createdAt:   true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const tasks7 = tasks30.filter((t) => new Date(t.createdAt) >= day7)

    // ── Lifetime totals ─────────────────────────────────────────────
    const lifetimeAgg = await prisma.task.aggregate({
      where:  { agentId: id, userId },
      _count: { id: true },
      _sum:   { costUsd: true, tokensUsed: true },
    })

    // ── Window helpers ──────────────────────────────────────────────
    function windowStats(tasks: typeof tasks30) {
      const complete = tasks.filter((t) => t.status === 'COMPLETE')
      const failed   = tasks.filter((t) => t.status === 'FAILED')

      const durations = complete
        .filter((t) => t.startedAt && t.completedAt)
        .map((t) => new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime())
        .sort((a, b) => a - b)

      const avgCostUsd   = complete.length ? complete.reduce((s, t) => s + t.costUsd, 0) / complete.length : 0
      const avgDurationMs = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0
      const p50DurationMs = percentile(durations, 50)
      const p95DurationMs = percentile(durations, 95)

      return {
        tasks:        tasks.length,
        complete:     complete.length,
        failed:       failed.length,
        successRate:  tasks.length ? Math.round((complete.length / tasks.length) * 100) : null,
        avgCostUsd:   +avgCostUsd.toFixed(5),
        avgDurationMs: Math.round(avgDurationMs),
        p50DurationMs,
        p95DurationMs,
      }
    }

    // ── Confidence distribution (lifetime) ─────────────────────────
    const confGroups = await prisma.task.groupBy({
      by:    ['confidence'],
      where: { agentId: id, userId, confidence: { not: null } },
      _count: { id: true },
    })
    const confidence: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 }
    for (const g of confGroups) {
      if (g.confidence) confidence[g.confidence] = g._count.id
    }

    // ── 14-day daily volume ─────────────────────────────────────────
    const tasks14 = await prisma.task.findMany({
      where:  { agentId: id, userId, createdAt: { gte: day14 } },
      select: { status: true, costUsd: true, createdAt: true },
    })

    const volumeMap: Record<string, { complete: number; failed: number; cost: number }> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000)
      volumeMap[dateKey(d)] = { complete: 0, failed: 0, cost: 0 }
    }
    for (const t of tasks14) {
      const k = dateKey(new Date(t.createdAt))
      if (volumeMap[k]) {
        if (t.status === 'COMPLETE') { volumeMap[k].complete++; volumeMap[k].cost += t.costUsd }
        else if (t.status === 'FAILED') volumeMap[k].failed++
      }
    }
    const dailyVolume = Object.entries(volumeMap).map(([date, v]) => ({
      date,
      complete: v.complete,
      failed:   v.failed,
      cost:     +v.cost.toFixed(5),
    }))

    // ── Top tool calls ──────────────────────────────────────────────
    const toolGroups = await prisma.toolCall.groupBy({
      by:    ['toolName'],
      where: { task: { agentId: id, userId } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    })
    const topTools = toolGroups.map((g) => ({ name: g.toolName, count: g._count.id }))

    // ── Memory count ────────────────────────────────────────────────
    const memoryCount = await prisma.agentMemory.count({ where: { agentId: id } })

    // ── User rating ─────────────────────────────────────────────────
    const ratings = await prisma.task.groupBy({
      by:    ['userRating'],
      where: { agentId: id, userId, userRating: { not: null } },
      _count: { id: true },
    })
    const ratingMap: Record<string, number> = {}
    for (const r of ratings) { if (r.userRating) ratingMap[r.userRating] = r._count.id }

    return reply.send({
      health: {
        lifetime: {
          tasks:     lifetimeAgg._count.id,
          costUsd:   +(lifetimeAgg._sum.costUsd ?? 0).toFixed(4),
          tokens:    lifetimeAgg._sum.tokensUsed ?? 0,
          memoryCount,
        },
        window7d:  windowStats(tasks7),
        window30d: windowStats(tasks30),
        confidence,
        dailyVolume,
        topTools,
        ratings: {
          positive: ratingMap['POSITIVE'] ?? 0,
          negative: ratingMap['NEGATIVE'] ?? 0,
        },
      },
    })
  })
}
