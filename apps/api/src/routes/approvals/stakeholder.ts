import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma.js'
import { resumeAgentTask } from '../../agents/graph.js'
import { emitEvent } from '../../services/events.service.js'

export default async function stakeholderApprovalRoute(app: FastifyInstance) {
  // Export signed audit log of all approval requests for this user
  app.get('/api/approvals/audit-log', async (req, reply) => {
    const userId = req.dbUserId
    const approvals = await prisma.approvalRequest.findMany({
      where:   { task: { userId } },
      orderBy: { requestedAt: 'desc' },
      take:    200,
      select: {
        id:          true,
        action:      true,
        previewType: true,
        status:      true,
        auditHash:   true,
        requestedAt: true,
        respondedAt: true,
        expiresAt:   true,
        task:  { select: { id: true, title: true } },
        agent: { select: { id: true, name: true, role: true } },
      },
    })

    const exportedAt = new Date().toISOString()
    const payload    = JSON.stringify({ userId, exportedAt, approvals })
    const secret     = process.env.AUDIT_SECRET ?? 'slateops-audit'
    const signature  = crypto.createHmac('sha256', secret).update(payload).digest('hex')

    return reply.send({ data: approvals, signature, algorithm: 'hmac-sha256', exportedAt })
  })

  // List tasks currently awaiting approval for this user
  app.get('/api/approvals/pending', async (req, reply) => {
    const userId = req.dbUserId
    const tasks  = await prisma.task.findMany({
      where:   { userId, status: 'NEEDS_APPROVAL' },
      include: {
        agent:           { select: { name: true, avatarUrl: true } },
        approvalRequests: {
          where:   { status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
          take:    1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = tasks.map((t) => {
      const ar = t.approvalRequests[0]
      return {
        id:          t.id,
        title:       t.title,
        agentName:   t.agent.name,
        agentAvatar: t.agent.avatarUrl,
        action:      ar?.action ?? 'Review required',
        preview:     ar?.preview ?? null,
        createdAt:   t.createdAt.toISOString(),
        expiresAt:   ar?.expiresAt.toISOString() ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
    })

    return reply.send({ tasks: result })
  })

  // Generate a shareable approval link (stores token in user settings)
  app.post('/api/approvals/share', async (req, reply) => {
    const userId  = req.dbUserId
    const { taskId } = z.object({ taskId: z.string() }).parse(req.body)

    const task = await prisma.task.findFirst({ where: { id: taskId, userId, status: 'NEEDS_APPROVAL' } })
    if (!task) return reply.code(404).send({ error: 'Task not found or not awaiting approval' })

    const token = crypto.randomBytes(24).toString('hex')
    const user  = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
    const raw   = (user?.settings as any) ?? {}
    const tokens: any[] = raw.approvalTokens ?? []
    tokens.push({ token, taskId, userId, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() })
    await prisma.user.update({ where: { id: userId }, data: { settings: { ...raw, approvalTokens: tokens } } })

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    return reply.send({ url: `${webUrl}/approve/${token}` })
  })

  // Public: get task info for approval (no auth, token-based)
  app.get('/api/public-approve/:token', {
    config: { skipAuth: true } as any,
  }, async (req, reply) => {
    const { token } = req.params as { token: string }

    // Find the token across all users' settings
    const users = await prisma.user.findMany({
      where:  { settings: { path: ['approvalTokens'], not: { equals: [] } } },
      select: { id: true, settings: true },
    })

    let found: { taskId: string; userId: string; expiresAt: string } | null = null
    for (const u of users) {
      const tokens: any[] = ((u.settings as any)?.approvalTokens ?? [])
      const match = tokens.find((t: any) => t.token === token)
      if (match) { found = { taskId: match.taskId, userId: u.id, expiresAt: match.expiresAt }; break }
    }

    if (!found) return reply.code(404).send({ error: 'Invalid or expired approval link' })
    if (new Date(found.expiresAt) < new Date()) return reply.code(410).send({ error: 'Approval link has expired' })

    const task = await prisma.task.findFirst({
      where:   { id: found.taskId, status: 'NEEDS_APPROVAL' },
      include: {
        agent:           { select: { name: true, avatarUrl: true, role: true } },
        approvalRequests: { where: { status: 'PENDING' }, take: 1 },
      },
    })
    if (!task) return reply.code(404).send({ error: 'Task no longer awaiting approval' })

    const ar = task.approvalRequests[0]
    return reply.send({
      task: {
        id:          task.id,
        title:       task.title,
        agentName:   task.agent.name,
        agentAvatar: task.agent.avatarUrl,
        agentRole:   task.agent.role,
        action:      ar?.action ?? 'Review required',
        preview:     ar?.preview ?? null,
        expiresAt:   ar?.expiresAt.toISOString(),
      },
    })
  })

  // Public: submit approval decision via token
  app.post('/api/public-approve/:token', {
    config: { skipAuth: true } as any,
  }, async (req, reply) => {
    const { token }  = req.params as { token: string }
    const { status } = z.object({ status: z.enum(['APPROVED', 'CANCELLED']) }).parse(req.body)

    const users = await prisma.user.findMany({
      where:  { settings: { path: ['approvalTokens'], not: { equals: [] } } },
      select: { id: true, settings: true },
    })

    let found: { taskId: string; userId: string; expiresAt: string } | null = null
    for (const u of users) {
      const tokens: any[] = ((u.settings as any)?.approvalTokens ?? [])
      const match = tokens.find((t: any) => t.token === token)
      if (match) { found = { taskId: match.taskId, userId: u.id, expiresAt: match.expiresAt }; break }
    }

    if (!found) return reply.code(404).send({ error: 'Invalid approval link' })
    if (new Date(found.expiresAt) < new Date()) return reply.code(410).send({ error: 'Link expired' })

    const task = await prisma.task.findFirst({
      where:   { id: found.taskId, status: 'NEEDS_APPROVAL' },
      include: { agent: true },
    })
    if (!task) return reply.code(404).send({ error: 'Task not available for approval' })

    await prisma.approvalRequest.updateMany({
      where: { taskId: found.taskId, status: 'PENDING' },
      data:  { status, respondedAt: new Date() },
    })

    if (status === 'CANCELLED') {
      await prisma.task.update({ where: { id: found.taskId }, data: { status: 'CANCELLED' } })
      await prisma.agent.update({ where: { id: task.agentId }, data: { status: 'IDLE' } })
    } else {
      await emitEvent(task.agentId, {
        type:    'APPROVAL_GRANTED',
        taskId:  found.taskId,
        agentId: task.agentId,
        payload: { thoughtBubble: 'Approval received — continuing…' },
      })
      await prisma.task.update({ where: { id: found.taskId }, data: { status: 'IN_PROGRESS' } })
      const { makeExecutor } = await import('../../lib/composio.js')
      resumeAgentTask({
        taskId:           found.taskId,
        approvalDecision: status,
        executeTool:      makeExecutor(found.userId),
      }).catch(console.error)
    }

    // Consume the token
    const user = await prisma.user.findUnique({ where: { id: found.userId }, select: { settings: true } })
    const raw  = (user?.settings as any) ?? {}
    const updatedTokens = ((raw.approvalTokens ?? []) as any[]).filter((t: any) => t.token !== token)
    await prisma.user.update({ where: { id: found.userId }, data: { settings: { ...raw, approvalTokens: updatedTokens } } })

    return reply.send({ ok: true })
  })
}
