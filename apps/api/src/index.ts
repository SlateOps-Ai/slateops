import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import fp from 'fastify-plugin'

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

async function start() {
  // ── Core plugins ────────────────────────────────────────────────
  await app.register(cors, {
    origin:      process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  await app.register(cookie, {
    secret: process.env.ENCRYPTION_KEY ?? 'fallback-secret-change-me',
  })

  // ── Auth (must be before routes) ────────────────────────────────
  const { default: authPlugin }   = await import('./plugins/auth.js')
  const { default: socketPlugin } = await import('./plugins/socket.js')

  await app.register(authPlugin as any)
  await app.register(socketPlugin as any)

  // ── Routes ──────────────────────────────────────────────────────
  const { default: agentsRoute }        = await import('./routes/agents/create.js')
  const { default: memoryRoute }        = await import('./routes/agents/memory.js')
  const { default: createTaskRoute }    = await import('./routes/tasks/create.js')
  const { default: approveTaskRoute }   = await import('./routes/tasks/approve.js')
  const { default: libraryRoute }       = await import('./routes/tasks/library.js')
  const { default: integrationsRoute }  = await import('./routes/integrations/connect.js')
  const { default: clerkWebhookRoute }  = await import('./routes/clerk/webhook.js')

  // Webhook registered without fp() so its content-type parser override stays scoped
  await app.register(clerkWebhookRoute as any)

  await app.register(fp(agentsRoute as any))
  await app.register(fp(memoryRoute as any))
  await app.register(fp(createTaskRoute as any))
  await app.register(fp(approveTaskRoute as any))
  await app.register(fp(libraryRoute as any))
  await app.register(fp(integrationsRoute as any))

  // ── Health ──────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // ── Background jobs ──────────────────────────────────────────────
  const { prisma }    = await import('./lib/prisma.js')
  const { emitEvent } = await import('./services/events.service.js')

  setInterval(async () => {
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
  }, 2 * 60 * 1000)

  // ── Scheduled runs job (every minute) ──────────────────────────
  setInterval(async () => {
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
  }, 60 * 1000)

  // ── Weekly Office Brief (Sunday 20:00, checked hourly) ──────────
  setInterval(async () => {
    const now = new Date()
    if (now.getDay() === 0 && now.getHours() === 20) {
      const { generateAndSendBriefs } = await import('./agents/brief.js')
      generateAndSendBriefs().catch(console.error)
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
