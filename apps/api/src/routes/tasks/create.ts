import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { routeCommand } from '../../agents/router.js'
import { startAgentTask } from '../../agents/graph.js'
import { emitEvent } from '../../services/events.service.js'

const bodySchema = z.object({
  rawCommand: z.string().min(3).max(2000),
  agentId:    z.string().uuid().optional(),
})

export default async function createTaskRoute(app: FastifyInstance) {
  app.post('/api/tasks', async (req, reply) => {
    const body = bodySchema.parse(req.body)
    const userId  = req.dbUserId

    // Check credits
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const effectiveCredits = user.creditsRemaining + (user.freeRunCredits ?? 0)
    const hasByok = Boolean(user.byokKey)

    if (effectiveCredits <= 0 && !hasByok) {
      return reply.code(402).send({
        error:   "You've used your 10 free credits.",
        detail:  'Add your own API key to keep going for free, or upgrade for unlimited runs and the full control suite.',
        code:    'NO_CREDITS',
        byok:    false,
        actions: [
          { label: 'Add API key — it\'s free', url: '/settings?tab=byok', primary: true  },
          { label: 'Upgrade plan',             url: '/billing',           primary: false },
        ],
      })
    }

    // Future-proof: BYOK user hitting a tier-level gate
    if (effectiveCredits <= 0 && hasByok) {
      return reply.code(402).send({
        error:   'Your current plan limit has been reached.',
        detail:  'Upgrade to Business to unlock higher task volumes, multi-team support, and the full audit trail.',
        code:    'NO_CREDITS',
        byok:    true,
        actions: [
          { label: 'Upgrade to Business', url: '/billing', primary: true },
        ],
      })
    }

    // Load agents for this user
    const agents = await prisma.agent.findMany({
      where: { userId, isActive: true },
    })

    if (!agents.length) {
      return reply.code(400).send({ error: 'No agents found. Create an agent first.' })
    }

    // Route the command
    let targetAgentId = body.agentId
    let taskTitle     = body.rawCommand.slice(0, 60)
    let complexity: 'SIMPLE' | 'MEDIUM' | 'COMPLEX' = 'MEDIUM'

    if (!targetAgentId) {
      // Fast-path: if the command explicitly mentions an agent by name, assign directly
      const cmd = body.rawCommand.toLowerCase()
      const namedAgent = agents.find((a) => cmd.includes(a.name.toLowerCase()))

      if (namedAgent) {
        targetAgentId = namedAgent.id
      } else {
        const decision = await routeCommand(body.rawCommand, agents, user.byokKey ?? undefined)

        if (decision.clarificationNeeded) {
          return reply.send({
            clarification: true,
            question: decision.clarificationQuestion,
          })
        }

        if (!decision.targetAgentId) {
          return reply.code(400).send({ error: 'No suitable agent available for this task.' })
        }

        targetAgentId = decision.targetAgentId
        taskTitle     = decision.taskTitle
        complexity    = decision.estimatedComplexity
      }
    }

    const agent = agents.find((a: { id: string }) => a.id === targetAgentId)
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    // Create task record
    const task = await prisma.task.create({
      data: {
        agentId:    agent.id,
        userId,
        title:      taskTitle,
        rawCommand: body.rawCommand,
        status:     'PENDING',
        complexity,
      },
    })

    // Emit TASK_ASSIGNED before starting graph
    await emitEvent(agent.id, {
      type:    'TASK_ASSIGNED',
      taskId:  task.id,
      agentId: agent.id,
      payload: { thoughtBubble: 'On it!' },
    })

    // Update task and agent status
    await Promise.all([
      prisma.task.update({
        where: { id: task.id },
        data:  { status: 'IN_PROGRESS', startedAt: new Date(), langGraphThread: task.id },
      }),
      prisma.agent.update({
        where: { id: agent.id },
        data:  { status: 'WORKING' },
      }),
    ])

    const { makeExecutor } = await import('../../lib/composio.js')
    const executeTool = makeExecutor(userId)

    // Run agent graph async (don't await — client gets response immediately)
    startAgentTask({
      taskId:     task.id,
      agentId:    agent.id,
      agent,
      rawCommand: body.rawCommand,
      taskTitle,
      byokKey:    user.byokKey ?? undefined,
      executeTool,
    }).catch(async (err) => {
      console.error('Task graph error:', err)
      await Promise.all([
        prisma.task.update({ where: { id: task.id }, data: { status: 'FAILED' } }),
        prisma.agent.update({ where: { id: agent.id }, data: { status: 'IDLE' } }),
      ])
      // Notify the client so the office can react (lamps, result panel)
      await emitEvent(agent.id, {
        type:    'TASK_FAILED',
        taskId:  task.id,
        agentId: agent.id,
        payload: {
          thoughtBubble: 'Something went wrong',
          error: {
            message:    err?.message ?? 'Unknown error',
            userFacing: 'The task ran into an error. Please try again.',
            retryable:  true,
          },
        },
      }).catch(() => {})
    })

    return reply.code(202).send({ task: { id: task.id, title: taskTitle, agentId: agent.id } })
  })

  // List tasks
  app.get('/api/tasks', async (req, reply) => {
    const { limit = '20', offset = '0' } = req.query as Record<string, string>

    const tasks = await prisma.task.findMany({
      where:   { userId: req.dbUserId },
      orderBy: { createdAt: 'desc' },
      take:    parseInt(limit),
      skip:    parseInt(offset),
      select: {
        id: true, title: true, status: true, complexity: true,
        agentId: true, createdAt: true, completedAt: true, costUsd: true,
      },
    })

    return reply.send({ tasks })
  })

  // Get single task
  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const task = await prisma.task.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!task) return reply.code(404).send({ error: 'Not found' })
    return reply.send({ task })
  })
}
