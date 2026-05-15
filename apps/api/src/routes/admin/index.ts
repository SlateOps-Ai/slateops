import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { checkSpendAnomalies } from '../../lib/llm-usage.js'

// ── Helper: parse window query param (default 7 days) ─────────────────────────

function rangeStart(req: any): Date {
  const days = Math.max(1, Math.min(90, parseInt((req.query as any)?.days ?? '7', 10) || 7))
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

// ── Auth guard: only User.isAdmin = true can access /api/admin ────────────────

async function requireAdmin(req: any, reply: any): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where:  { id: req.dbUserId },
    select: { isAdmin: true },
  })
  if (!user?.isAdmin) {
    reply.code(403).send({ error: 'Admin access required' })
    return false
  }
  return true
}

export default async function adminRoute(app: FastifyInstance) {

  // GET /api/admin/usage/top-users — top spenders in window, with totals
  app.get('/api/admin/usage/top-users', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return
    const since = rangeStart(req)

    const rows = await prisma.llmCallLog.groupBy({
      by:    ['userId'],
      where: { createdAt: { gte: since } },
      _sum:  { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
      orderBy: { _sum: { estimatedCostUsd: 'desc' } },
      take:    25,
    })

    const userIds = rows.map((r) => r.userId)
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, email: true, name: true, plan: true, creditsRemaining: true },
    })
    const byId = new Map(users.map((u) => [u.id, u]))

    return reply.send({
      windowDays: Math.round((Date.now() - since.getTime()) / 86400000),
      users: rows.map((r) => ({
        userId:           r.userId,
        email:            byId.get(r.userId)?.email ?? '(unknown)',
        name:             byId.get(r.userId)?.name  ?? '(unknown)',
        plan:             byId.get(r.userId)?.plan  ?? 'FREE',
        creditsRemaining: byId.get(r.userId)?.creditsRemaining ?? 0,
        callCount:        r._count._all,
        inputTokens:      r._sum.inputTokens  ?? 0,
        outputTokens:     r._sum.outputTokens ?? 0,
        spendUsd:         r._sum.estimatedCostUsd ?? 0,
      })),
    })
  })

  // GET /api/admin/usage/by-model — cost breakdown per model in window
  app.get('/api/admin/usage/by-model', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return
    const since = rangeStart(req)

    const rows = await prisma.llmCallLog.groupBy({
      by:    ['model'],
      where: { createdAt: { gte: since } },
      _sum:  { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
      orderBy: { _sum: { estimatedCostUsd: 'desc' } },
    })

    return reply.send({
      models: rows.map((r) => ({
        model:        r.model,
        callCount:    r._count._all,
        inputTokens:  r._sum.inputTokens  ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        spendUsd:     r._sum.estimatedCostUsd ?? 0,
      })),
    })
  })

  // GET /api/admin/usage/byok-split — how much spend is on platform vs BYOK
  app.get('/api/admin/usage/byok-split', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return
    const since = rangeStart(req)

    const rows = await prisma.llmCallLog.groupBy({
      by:    ['byok'],
      where: { createdAt: { gte: since } },
      _sum:  { estimatedCostUsd: true },
      _count: { _all: true },
    })

    const byok = rows.find((r) => r.byok === true)
    const platform = rows.find((r) => r.byok === false)

    return reply.send({
      platform: {
        callCount: platform?._count._all ?? 0,
        spendUsd:  platform?._sum.estimatedCostUsd ?? 0,
      },
      byok: {
        callCount: byok?._count._all ?? 0,
        spendUsd:  byok?._sum.estimatedCostUsd ?? 0,
      },
    })
  })

  // GET /api/admin/usage/timeline — daily total spend (all users) in window
  app.get('/api/admin/usage/timeline', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return
    const since = rangeStart(req)

    // Postgres-only: date_trunc. Falls back to per-row aggregation in JS for portability.
    const rows = await prisma.$queryRaw<Array<{ day: Date; spend: number; calls: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             COALESCE(SUM("estimatedCostUsd"), 0)::float AS spend,
             COUNT(*) AS calls
      FROM "LlmCallLog"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `

    return reply.send({
      days: rows.map((r) => ({
        date:     r.day.toISOString().slice(0, 10),
        spendUsd: Number(r.spend),
        calls:    Number(r.calls),
      })),
    })
  })

  // GET /api/admin/usage/anomalies — current spend anomalies (>5x 7-day avg today)
  app.get('/api/admin/usage/anomalies', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return

    const anomalies = await checkSpendAnomalies()
    const userIds = anomalies.map((a) => a.userId)
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, email: true, name: true, plan: true },
    })
    const byId = new Map(users.map((u) => [u.id, u]))

    return reply.send({
      anomalies: anomalies.map((a) => ({
        userId:    a.userId,
        email:     byId.get(a.userId)?.email ?? '(unknown)',
        name:      byId.get(a.userId)?.name  ?? '(unknown)',
        plan:      byId.get(a.userId)?.plan  ?? 'FREE',
        todayUsd:  a.todayUsd,
        avgUsd:    a.avgUsd,
        multiple:  Math.round((a.todayUsd / a.avgUsd) * 10) / 10,
      })),
    })
  })

  // GET /api/admin/usage/summary — single-call dashboard summary
  app.get('/api/admin/usage/summary', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return
    const since = rangeStart(req)

    const [overall, errCount, activeUsers] = await Promise.all([
      prisma.llmCallLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum:  { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
        _avg:  { latencyMs: true },
      }),
      prisma.llmCallLog.count({ where: { createdAt: { gte: since }, status: 'ERROR' } }),
      prisma.llmCallLog.groupBy({
        by:    ['userId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ])

    return reply.send({
      totalCalls:    overall._count._all,
      errorCalls:    errCount,
      activeUsers:   activeUsers.length,
      inputTokens:   overall._sum.inputTokens  ?? 0,
      outputTokens:  overall._sum.outputTokens ?? 0,
      totalSpendUsd: overall._sum.estimatedCostUsd ?? 0,
      avgLatencyMs:  Math.round(overall._avg.latencyMs ?? 0),
    })
  })
}
