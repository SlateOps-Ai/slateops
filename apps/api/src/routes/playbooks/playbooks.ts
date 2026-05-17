import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { routeCommand } from '../../agents/router.js'
import { startAgentTask } from '../../agents/graph.js'

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(300).optional().default(''),
  steps:       z.array(z.string().min(1)).min(1).max(20),
})

export default async function playbooksRoute(app: FastifyInstance) {
  // GET /api/playbooks
  app.get('/api/playbooks', async (req, reply) => {
    const userId = req.dbUserId
    const settings = await prisma.user.findUnique({
      where:  { id: userId },
      select: { settings: true },
    })
    const raw       = (settings?.settings as any) ?? {}
    const playbooks = (raw.playbooks ?? []) as any[]
    return reply.send({ playbooks })
  })

  // POST /api/playbooks
  app.post('/api/playbooks', async (req, reply) => {
    const userId = req.dbUserId
    const body   = createSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw  = (user?.settings as any) ?? {}
    const existing: any[] = raw.playbooks ?? []

    const newPlaybook = {
      id:          crypto.randomUUID(),
      name:        body.name,
      description: body.description,
      steps:       body.steps.map((cmd) => ({ id: crypto.randomUUID(), command: cmd })),
      createdAt:   new Date().toISOString(),
      runCount:    0,
    }

    const updated = [newPlaybook, ...existing]
    await prisma.user.update({
      where: { id: userId },
      data:  { settings: { ...raw, playbooks: updated } },
    })

    return reply.code(201).send({ playbook: newPlaybook })
  })

  // DELETE /api/playbooks/:id
  app.delete('/api/playbooks/:id', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw  = (user?.settings as any) ?? {}
    const updated = ((raw.playbooks ?? []) as any[]).filter((p: any) => p.id !== id)
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, playbooks: updated } } })

    return reply.send({ ok: true })
  })

  // POST /api/playbooks/:id/run — execute all steps sequentially
  app.post('/api/playbooks/:id/run', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw  = (user?.settings as any) ?? {}
    const playbooks: any[] = raw.playbooks ?? []
    const pb = playbooks.find((p: any) => p.id === id)
    if (!pb) return reply.code(404).send({ error: 'Playbook not found' })

    // Load agents
    const agents = await prisma.agent.findMany({ where: { userId, isActive: true } })
    if (!agents.length) return reply.code(400).send({ error: 'No active agents' })

    // Fire each step async without blocking — each step routes to the best agent
    const { makeExecutor } = await import('../../lib/composio.js')
    const executeTool      = makeExecutor(userId)
    const taskIds: string[] = []
    for (const step of pb.steps) {
      try {
        const routing = await routeCommand(step.command, agents)
        const agent   = agents.find((a) => a.id === routing.targetAgentId) ?? agents[0]
        const task    = await prisma.task.create({
          data: {
            userId,
            agentId:    agent.id,
            title:      step.command.slice(0, 120),
            rawCommand: step.command,
            status:     'IN_PROGRESS',
          },
        })
        taskIds.push(task.id)
        startAgentTask({
          taskId:     task.id,
          agentId:    agent.id,
          agent,
          rawCommand: step.command,
          taskTitle:  step.command.slice(0, 120),
          executeTool,
        }).catch(() => {})
      } catch { /* continue with remaining steps */ }
    }

    // Increment runCount
    const updatedPlaybooks = playbooks.map((p: any) =>
      p.id === id ? { ...p, runCount: (p.runCount ?? 0) + 1 } : p,
    )
    await prisma.user.update({
      where: { id: userId },
      data:  { settings: { ...raw, playbooks: updatedPlaybooks } },
    })

    return reply.send({ ok: true, taskIds })
  })
}
