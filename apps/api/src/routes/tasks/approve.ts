import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { resumeAgentTask } from '../../agents/graph.js'
import { emitEvent } from '../../services/events.service.js'

const bodySchema = z.object({
  status: z.enum(['APPROVED', 'EDITED', 'CANCELLED']),
  edit:   z.unknown().optional(),
})

export default async function approveTaskRoute(app: FastifyInstance) {
  app.post('/api/tasks/:id/approve', async (req, reply) => {
    const { id }  = req.params as { id: string }
    const body    = bodySchema.parse(req.body)
    const userId  = req.dbUserId

    const task = await prisma.task.findFirst({
      where:   { id, userId },
      include: { agent: true },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.status !== 'NEEDS_APPROVAL') {
      return reply.code(400).send({ error: 'Task is not awaiting approval' })
    }

    // Update approval request
    await prisma.approvalRequest.updateMany({
      where: { taskId: id, status: 'PENDING' },
      data:  { status: body.status, respondedAt: new Date() },
    })

    if (body.status === 'CANCELLED') {
      await prisma.task.update({
        where: { id },
        data:  { status: 'CANCELLED' },
      })
      await prisma.agent.update({
        where: { id: task.agentId },
        data:  { status: 'IDLE' },
      })
      return reply.send({ ok: true })
    }

    // Emit approval granted event
    await emitEvent(task.agentId, {
      type:    'APPROVAL_GRANTED',
      taskId:  id,
      agentId: task.agentId,
      payload: { thoughtBubble: 'Continuing…' },
    })

    await prisma.task.update({
      where: { id },
      data:  { status: 'IN_PROGRESS' },
    })

    const { makeExecutor } = await import('../../lib/composio.js')
    const executeTool = makeExecutor(userId)

    // Resume graph async
    resumeAgentTask({
      taskId:           id,
      approvalDecision: body.status,
      approvalEdit:     body.edit,
      executeTool,
    }).catch(console.error)

    return reply.send({ ok: true })
  })
}
