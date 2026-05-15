import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  },
})

// Compute the next Date a cron expression fires after now.
// Supports the 5-field subset used by the schedule UI:
// "minute hour dom month dow"  e.g. "0 9 * * 1"  = every Monday at 09:00
function computeNext(expr: string): Date {
  const [minF, hourF, , , dowF] = expr.trim().split(/\s+/)
  const now  = new Date()
  const next = new Date(now)
  next.setSeconds(0, 0)
  next.setMinutes(minF === '*' ? now.getMinutes() : parseInt(minF))
  next.setHours(hourF === '*' ? now.getHours() : parseInt(hourF))

  // Advance past now
  if (next <= now) next.setDate(next.getDate() + 1)

  // If a specific day-of-week is given, advance until we hit it
  if (dowF !== '*') {
    const target = parseInt(dowF) // 0=Sun … 6=Sat
    while (next.getDay() !== target) next.setDate(next.getDate() + 1)
  }

  return next
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(422).send({ error: 'Validation failed', issues: err.errors })
  }
  reply.code(err.statusCode ?? 500).send({ error: err.message ?? 'Internal server error' })
})

async function start() {
  if (!process.env.WEB_URL) {
    console.error('[FATAL] WEB_URL environment variable is not set. Approval email links will point to localhost and break in production. Set WEB_URL and restart.')
    process.exit(1)
  }

  // ── Core plugins ────────────────────────────────────────────────
  const allowedOrigins = (process.env.WEB_URL ?? 'http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean)

  await app.register(cors, {
    origin:      allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  })

  await app.register(cookie, {
    secret: process.env.ENCRYPTION_KEY ?? 'fallback-secret-change-me',
  })

  // ── Rate limiting (must be before routes so it sees authenticated user id) ──
  // Global default: 120 req/min per user (in-memory; upgrade to Redis later for
  // multi-instance). Per-user keying happens via the auth plugin populating req.dbUserId.
  await app.register(rateLimit, {
    global:        true,
    max:           120,
    timeWindow:    '1 minute',
    keyGenerator:  (req: any) => req.dbUserId ?? req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error:      'Too Many Requests',
      message:    `Rate limit exceeded. Try again in ${Math.ceil((ctx as any).ttl / 1000)}s.`,
    }),
    skipOnError:   true,   // if the store fails, fail open rather than blocking everyone
  })

  // ── Auth (must be before routes) ────────────────────────────────
  const { default: authPlugin }   = await import('./plugins/auth.js')
  const { default: socketPlugin } = await import('./plugins/socket.js')

  await app.register(authPlugin as any)
  await app.register(socketPlugin as any)

  // ── Routes ──────────────────────────────────────────────────────
  const { default: agentsRoute }          = await import('./routes/agents/create.js')
  const { default: suggestionsRoute }     = await import('./routes/agents/suggestions.js')
  const { default: memoryRoute }          = await import('./routes/agents/memory.js')
  const { default: agentChatRoute }       = await import('./routes/agents/chat.js')
  const { default: agentKnowledgeRoute }  = await import('./routes/agents/knowledge.js')
  const { default: agentSessionsRoute }   = await import('./routes/agents/sessions.js')
  const { default: agentHealthRoute }     = await import('./routes/agents/health.js')
  const { default: publicChatRoute }      = await import('./routes/public/chat.js')
  const { default: createTaskRoute }      = await import('./routes/tasks/create.js')
  const { default: approveTaskRoute }     = await import('./routes/tasks/approve.js')
  const { default: libraryRoute }         = await import('./routes/tasks/library.js')
  const { default: taskFeedbackRoute }    = await import('./routes/tasks/feedback.js')
  const { default: integrationsRoute }    = await import('./routes/integrations/connect.js')
  const { default: settingsRoute }        = await import('./routes/user/settings.js')
  const { default: analyticsSummaryRoute }   = await import('./routes/analytics/summary.js')
  const { default: analyticsExecutiveRoute } = await import('./routes/analytics/executive.js')
  const { default: workflowsRoute }       = await import('./routes/workflows/workflows.js')
  const { default: mcpCatalogRoute }      = await import('./routes/mcp/catalog.js')
  const { default: triggerRulesRoute }        = await import('./routes/triggers/rules.js')
  const { default: gamificationProfileRoute } = await import('./routes/gamification/profile.js')
  const { default: inboundWebhookRoutes }     = await import('./routes/webhooks/inbound.js')
  const { default: clerkWebhookRoute }        = await import('./routes/clerk/webhook.js')
  const { default: billingRoute }             = await import('./routes/billing/checkout.js')
  const { default: stripeWebhookRoute }       = await import('./routes/billing/webhook.js')
  const { default: teamsRoute }               = await import('./routes/teams/teams.js')
  const { default: contentPostsRoute }        = await import('./routes/content/posts.js')
  const { default: playbooksRoute }           = await import('./routes/playbooks/playbooks.js')
  const { default: roiRoute }                 = await import('./routes/roi/roi.js')
  const { default: marketplaceInstallRoute }  = await import('./routes/marketplace/install.js')
  const { default: briefingsRoute }           = await import('./routes/briefings/briefings.js')
  const { default: stakeholderApprovalRoute } = await import('./routes/approvals/stakeholder.js')
  const { default: collaborationFeedRoute }   = await import('./routes/collaboration/feed.js')
  const { default: evolutionRoute }           = await import('./routes/evolution/index.js')
  const { default: brainRoute }               = await import('./routes/brain/index.js')
  const { default: autonomousRoute }          = await import('./routes/autonomous/index.js')
  const { default: ceoLayerRoute }            = await import('./routes/ceo-layer/index.js')
  const { default: onboardingComposeRoute }   = await import('./routes/onboarding/compose.js')
  const { default: onboardingInstallRoute }   = await import('./routes/onboarding/install.js')

  // Webhook registered without fp() so its content-type parser override stays scoped
  await app.register(clerkWebhookRoute as any)

  await app.register(fp(agentsRoute as any))
  await app.register(fp(suggestionsRoute as any))
  await app.register(fp(memoryRoute as any))
  await app.register(fp(agentChatRoute as any))
  await app.register(fp(agentKnowledgeRoute as any))
  await app.register(fp(agentSessionsRoute as any))
  await app.register(fp(agentHealthRoute as any))
  await app.register(fp(publicChatRoute as any))
  await app.register(fp(createTaskRoute as any))
  await app.register(fp(approveTaskRoute as any))
  await app.register(fp(libraryRoute as any))
  await app.register(fp(taskFeedbackRoute as any))
  await app.register(fp(integrationsRoute as any))
  await app.register(fp(settingsRoute as any))
  await app.register(fp(analyticsSummaryRoute as any))
  await app.register(fp(analyticsExecutiveRoute as any))
  await app.register(fp(workflowsRoute as any))
  await app.register(fp(mcpCatalogRoute as any))
  await app.register(fp(triggerRulesRoute as any))
  await app.register(fp(gamificationProfileRoute as any))
  await app.register(fp(billingRoute as any))
  await app.register(fp(teamsRoute as any))
  await app.register(fp(contentPostsRoute as any))
  await app.register(fp(playbooksRoute as any))
  await app.register(fp(roiRoute as any))
  await app.register(fp(marketplaceInstallRoute as any))
  await app.register(fp(briefingsRoute as any))
  await app.register(fp(stakeholderApprovalRoute as any))
  await app.register(fp(collaborationFeedRoute as any))
  await app.register(fp(evolutionRoute as any))
  await app.register(fp(brainRoute as any))
  await app.register(fp(autonomousRoute as any))
  await app.register(fp(ceoLayerRoute as any))
  await app.register(fp(onboardingComposeRoute as any))
  await app.register(fp(onboardingInstallRoute as any))
  // Webhooks registered without fp() — no auth plugin needed, external services POST here
  await app.register(inboundWebhookRoutes as any)
  await app.register(stripeWebhookRoute as any)

  // ── Health ──────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // ── Background jobs ──────────────────────────────────────────────
  const { prisma }    = await import('./lib/prisma.js')
  const { emitEvent } = await import('./services/events.service.js')

  // Clean up any workflow runs left in a running state from a previous crash
  await prisma.workflowRun.updateMany({
    where:  { status: { in: ['TEST_RUNNING', 'RUNNING', 'WAITING_GATE'] } },
    data:   { status: 'FAILED', completedAt: new Date() },
  }).catch(() => {})

  setInterval(async () => {
    try {
      const expired = await prisma.approvalRequest.findMany({
        where:   { status: 'PENDING', expiresAt: { lt: new Date() } },
        include: { task: { include: { agent: true } } },
      })

      for (const req of expired) {
        await prisma.approvalRequest.update({
          where: { id: req.id },
          data:  { status: 'EXPIRED' },
        })
        await prisma.task.update({
          where: { id: req.taskId },
          data:  { status: 'FAILED' },
        })
        await emitEvent(req.agentId, {
          type:    'TASK_BLOCKED',
          taskId:  req.taskId,
          agentId: req.agentId,
          payload: {
            thoughtBubble: 'Approval timed out',
            error: {
              message:    'Approval request expired',
              userFacing: 'This task timed out waiting for your approval.',
              retryable:  true,
            },
          },
        })
      }
    } catch (err) {
      console.error('Approval expiry job error:', err)
    }
  }, 2 * 60 * 1000)

  // ── Scheduled runs job (every minute) ──────────────────────────
  setInterval(async () => {
    try {
    const now = new Date()
    const due = await prisma.scheduledRun.findMany({
      where:   { isActive: true, nextRunAt: { lte: now } },
      include: { savedCommand: true, user: true },
    })

    for (const schedule of due) {
      try {
        const { saved } = { saved: schedule.savedCommand }

        // Resolve target agent for this user
        const agent = await prisma.agent.findFirst({
          where: { id: saved.agentId, userId: schedule.userId, isActive: true },
        })
        if (!agent) continue

        const user = schedule.user
        if (user.creditsRemaining <= 0 && !user.byokKey) continue

        const task = await prisma.task.create({
          data: {
            agentId:    agent.id,
            userId:     schedule.userId,
            title:      saved.title,
            rawCommand: saved.rawCommand,
            status:     'PENDING',
            complexity: 'MEDIUM',
          },
        })

        await emitEvent(agent.id, {
          type:    'TASK_ASSIGNED',
          taskId:  task.id,
          agentId: agent.id,
          payload: { thoughtBubble: 'On it!' },
        })

        await Promise.all([
          prisma.task.update({
            where: { id: task.id },
            data:  { status: 'IN_PROGRESS', startedAt: now, langGraphThread: task.id },
          }),
          prisma.agent.update({ where: { id: agent.id }, data: { status: 'WORKING' } }),
          prisma.scheduledRun.update({
            where: { id: schedule.id },
            data:  { lastRunAt: now, nextRunAt: computeNext(schedule.cronExpr) },
          }),
        ])

        const { makeExecutor } = await import('./lib/composio.js')
        const { startAgentTask } = await import('./agents/graph.js')

        startAgentTask({
          taskId:     task.id,
          agentId:    agent.id,
          agent,
          rawCommand: saved.rawCommand,
          taskTitle:  saved.title,
          byokKey:    user.byokKey ?? undefined,
          executeTool: makeExecutor(schedule.userId),
        }).catch(async (err) => {
          console.error('Scheduled task error:', err)
          await prisma.task.update({ where: { id: task.id }, data: { status: 'FAILED' } })
        }).finally(async () => {
          await prisma.agent.update({ where: { id: agent.id }, data: { status: 'IDLE' } })
        })
      } catch (err) {
        console.error('Schedule runner error for', schedule.id, err)
      }
    }
    } catch (err) {
      console.error('Scheduled runs job error:', err)
    }
  }, 60 * 1000)

  // ── Scheduled social posts publisher (every 60s) ────────────────
  setInterval(async () => {
    try {
      const { publishDuePosts } = await import('./services/social.service.js')
      await publishDuePosts()
    } catch (err) {
      console.error('Social post publisher error:', err)
    }
  }, 60 * 1000)

  // ── Daily Brief (08:00 UTC, checked every minute) ───────────────
  setInterval(async () => {
    try {
      const now = new Date()
      if (now.getUTCHours() === 8 && now.getUTCMinutes() === 0) {
        const { sendDailyBrief } = await import('./services/email.service.js')
        const users = await prisma.user.findMany({
          where:  { agents: { some: { isActive: true } } },
          select: { id: true, name: true, email: true, settings: true },
        })
        for (const user of users) {
          try {
            const raw = (user.settings as any) ?? {}
            if (!raw.dailyBriefEnabled) continue
            const lastSentAt: string | undefined = raw.lastDailyBriefAt
            if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < 22 * 60 * 60 * 1000) continue
            const since24h   = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const [doneTasks, pendingTasks, agents] = await Promise.all([
              prisma.task.count({ where: { userId: user.id, status: 'COMPLETE', completedAt: { gte: since24h } } }),
              prisma.task.count({ where: { userId: user.id, status: 'NEEDS_APPROVAL' } }),
              prisma.agent.findMany({ where: { userId: user.id, isActive: true }, select: { name: true } }),
            ])
            const webUrl = process.env.WEB_URL!
            await sendDailyBrief({
              userName: user.name, userEmail: user.email,
              tasksCompleted: doneTasks, pendingApprovals: pendingTasks,
              agentNames: agents.map((a) => a.name),
              briefUrl: `${webUrl}/daily-brief`, officeUrl: `${webUrl}/office`,
            })
            await prisma.user.update({
              where: { id: user.id },
              data:  { settings: { ...raw, lastDailyBriefAt: new Date().toISOString() } },
            })
          } catch (err) { console.error(`Daily brief failed for ${user.email}:`, err) }
        }
      }
    } catch (err) { console.error('Daily brief job error:', err) }
  }, 60 * 1000)

  // ── Weekly Office Brief (Sunday 20:00, checked hourly) ──────────
  setInterval(async () => {
    try {
      const now = new Date()
      if (now.getDay() === 0 && now.getHours() === 20) {
        const { generateAndSendBriefs } = await import('./agents/brief.js')
        generateAndSendBriefs().catch(console.error)
      }
    } catch (err) {
      console.error('Weekly brief job error:', err)
    }
  }, 60 * 60 * 1000)

  // ── Monthly quota reset (hourly check, fires once per month per user) ───
  // Each plan has a credit allotment per billing cycle. We treat the cycle
  // as a calendar month for simplicity — Stripe still drives actual billing.
  const PLAN_MONTHLY_CREDITS: Record<string, number> = {
    FREE:       25,
    PRO:        5_000,
    ENTERPRISE: 50_000,
  }
  setInterval(async () => {
    try {
      const now      = new Date()
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1)
      // Users whose last reset is null OR older than 1 month
      const due = await prisma.user.findMany({
        where:  { OR: [{ lastQuotaResetAt: null }, { lastQuotaResetAt: { lt: monthAgo } }] },
        select: { id: true, plan: true, email: true },
      })
      for (const u of due) {
        const allotment = PLAN_MONTHLY_CREDITS[u.plan] ?? PLAN_MONTHLY_CREDITS.FREE
        await prisma.user.update({
          where: { id: u.id },
          data:  { creditsRemaining: allotment, lastQuotaResetAt: now },
        })
      }
      if (due.length > 0) app.log.info(`[quota-reset] reset credits for ${due.length} users`)
    } catch (err) {
      console.error('Monthly quota reset error:', err)
    }
  }, 60 * 60 * 1000)

  // ── Spend anomaly check (hourly) — log a warning if any user's spend today is 5x their 7-day avg ──
  setInterval(async () => {
    try {
      const { checkSpendAnomalies } = await import('./lib/llm-usage.js')
      const anomalies = await checkSpendAnomalies()
      for (const a of anomalies) {
        app.log.warn(`[spend-anomaly] user=${a.userId} today=$${a.todayUsd.toFixed(3)} avg=$${a.avgUsd.toFixed(3)} ratio=${(a.todayUsd / a.avgUsd).toFixed(1)}x`)
      }
    } catch (err) {
      console.error('Spend anomaly check error:', err)
    }
  }, 60 * 60 * 1000)

  // ── Start ────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '4000')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`SlateOps API listening on :${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
