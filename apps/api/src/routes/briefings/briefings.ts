import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { sendDailyBrief } from '../../services/email.service.js'

// Generates proactive briefings by analysing recent task events and patterns
async function generateBriefings(userId: string): Promise<any[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [agents, recentTasks, failedTasks] = await Promise.all([
    prisma.agent.findMany({ where: { userId, isActive: true } }),
    prisma.task.findMany({
      where:   { userId, status: 'COMPLETE', completedAt: { gte: since } },
      orderBy: { completedAt: 'desc' },
      take:    20,
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.task.findMany({
      where:   { userId, status: 'FAILED', createdAt: { gte: since } },
      take:    5,
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ])

  const briefings: any[] = []

  // Insight: most productive agent
  if (recentTasks.length > 0) {
    const counts: Record<string, { count: number; name: string; avatar: string; agentId: string }> = {}
    for (const t of recentTasks) {
      if (!counts[t.agentId]) counts[t.agentId] = { count: 0, name: t.agent.name, avatar: t.agent.avatarUrl, agentId: t.agentId }
      counts[t.agentId].count++
    }
    const top = Object.values(counts).sort((a, b) => b.count - a.count)[0]
    if (top && top.count >= 3) {
      briefings.push({
        id:          `insight-top-${top.agentId}`,
        agentId:     top.agentId,
        agentName:   top.name,
        agentAvatar: top.avatar,
        type:        'insight',
        headline:    `${top.name} completed ${top.count} tasks this week`,
        body:        `${top.name} is your highest-performing agent with ${top.count} tasks completed in the last 7 days. Consider assigning more work to maximise their efficiency.`,
        createdAt:   new Date().toISOString(),
        read:        false,
      })
    }
  }

  // Alert: failed tasks
  if (failedTasks.length > 0) {
    const agent = failedTasks[0].agent
    briefings.push({
      id:          `alert-failed-${Date.now()}`,
      agentId:     agent.id,
      agentName:   agent.name,
      agentAvatar: agent.avatarUrl,
      type:        'alert',
      headline:    `${failedTasks.length} task${failedTasks.length > 1 ? 's' : ''} failed recently`,
      body:        `${agent.name} failed ${failedTasks.length} task${failedTasks.length > 1 ? 's' : ''} in the past 7 days. Review the task history to identify patterns and improve your instructions.`,
      createdAt:   new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read:        false,
    })
  }

  // Opportunity: idle agents
  const idleAgents = agents.filter((a) => a.status === 'IDLE')
  if (idleAgents.length > 0 && recentTasks.length < 5) {
    const agent = idleAgents[0]
    briefings.push({
      id:          `opportunity-idle-${agent.id}`,
      agentId:     agent.id,
      agentName:   agent.name,
      agentAvatar: agent.avatarUrl,
      type:        'opportunity',
      headline:    `${agent.name} is available — low task volume detected`,
      body:        `${agent.name} has been idle and your team has completed fewer than 5 tasks this week. Consider delegating recurring work like market research, content drafts, or weekly reports.`,
      createdAt:   new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read:        false,
    })
  }

  return briefings
}

export default async function briefingsRoute(app: FastifyInstance) {
  app.get('/api/briefings', async (req, reply) => {
    const userId = req.dbUserId
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw    = (user?.settings as any) ?? {}
    const stored: any[] = raw.briefings ?? []

    // Merge stored (manual dismissals / reads) with freshly generated
    const fresh = await generateBriefings(userId)
    const storedIds = new Set(stored.map((b: any) => b.id))
    const merged = [
      ...stored.filter((b: any) => !b.deleted),
      ...fresh.filter((b: any) => !storedIds.has(b.id)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return reply.send({ briefings: merged.slice(0, 20) })
  })

  app.post('/api/briefings/:id/read', async (req, reply) => {
    const userId     = req.dbUserId
    const { id }     = req.params as { id: string }
    const user       = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw        = (user?.settings as any) ?? {}
    const briefings: any[] = raw.briefings ?? []
    const existing   = briefings.find((b: any) => b.id === id)
    const updated    = existing
      ? briefings.map((b: any) => b.id === id ? { ...b, read: true } : b)
      : [...briefings, { id, read: true }]
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, briefings: updated } } })
    return reply.send({ ok: true })
  })

  app.post('/api/briefings/read-all', async (req, reply) => {
    const userId = req.dbUserId
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw    = (user?.settings as any) ?? {}
    const fresh  = await generateBriefings(userId)
    const updated = fresh.map((b) => ({ ...b, read: true }))
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, briefings: updated } } })
    return reply.send({ ok: true })
  })

  // Internal: send daily brief for a single user (called by scheduler or manually)
  app.post('/api/briefings/daily', async (req, reply) => {
    const userId = req.dbUserId
    const user   = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, settings: true },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })

    const raw = (user.settings as any) ?? {}
    const lastSentAt: string | undefined = raw.lastDailyBriefAt
    if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < 22 * 60 * 60 * 1000) {
      return reply.send({ ok: true, skipped: true, reason: 'Already sent within 22h' })
    }

    const since24h   = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [doneTasks, pendingTasks, agents] = await Promise.all([
      prisma.task.count({ where: { userId, status: 'COMPLETE', completedAt: { gte: since24h } } }),
      prisma.task.count({ where: { userId, status: 'NEEDS_APPROVAL' } }),
      prisma.agent.findMany({ where: { userId, isActive: true }, select: { name: true } }),
    ])

    const webUrl = process.env.WEB_URL ?? 'https://slateops.tech'
    await sendDailyBrief({
      userName:         user.name,
      userEmail:        user.email,
      tasksCompleted:   doneTasks,
      pendingApprovals: pendingTasks,
      agentNames:       agents.map((a) => a.name),
      briefUrl:         `${webUrl}/daily-brief`,
      officeUrl:        `${webUrl}/office`,
    })

    await prisma.user.update({
      where: { id: userId },
      data:  { settings: { ...raw, lastDailyBriefAt: new Date().toISOString() } },
    })

    return reply.send({ ok: true, sent: true })
  })

  app.delete('/api/briefings/:id', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw    = (user?.settings as any) ?? {}
    const briefings: any[] = raw.briefings ?? []
    const updated = briefings.filter((b: any) => b.id !== id)
    updated.push({ id, deleted: true }) // tombstone so it doesn't reappear
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, briefings: updated } } })
    return reply.send({ ok: true })
  })
}
