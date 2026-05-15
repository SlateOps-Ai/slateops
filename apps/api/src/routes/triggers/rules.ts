import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const CreateRuleSchema = z.object({
  agentId:        z.string().uuid(),
  provider:       z.enum(['WHATSAPP', 'EMAIL', 'SLACK', 'GITHUB', 'GENERIC']),
  label:          z.string().min(1).max(80),
  promptTemplate: z.string().min(1),
  filterField:    z.enum(['from', 'subject', 'body', 'channel', 'event']).optional(),
  filterOp:       z.enum(['any', 'contains', 'equals', 'startsWith', 'endsWith']).optional(),
  filterValue:    z.string().optional(),
})

const UpdateRuleSchema = z.object({
  label:          z.string().min(1).max(80).optional(),
  promptTemplate: z.string().min(1).optional(),
  filterField:    z.enum(['from', 'subject', 'body', 'channel', 'event']).nullable().optional(),
  filterOp:       z.enum(['any', 'contains', 'equals', 'startsWith', 'endsWith']).nullable().optional(),
  filterValue:    z.string().nullable().optional(),
  isActive:       z.boolean().optional(),
})

export default async function triggerRulesRoute(app: FastifyInstance) {

  // GET /api/triggers — list all rules for the user
  app.get('/api/triggers', async (req, reply) => {
    const userId = req.dbUserId
    const rules  = await prisma.triggerRule.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        agent:  { select: { id: true, name: true, avatarUrl: true, role: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    return reply.send({ rules })
  })

  // POST /api/triggers — create a new rule
  app.post('/api/triggers', async (req, reply) => {
    const userId = req.dbUserId
    const body   = CreateRuleSchema.parse(req.body)

    // Verify agent belongs to user
    const agent = await prisma.agent.findFirst({ where: { id: body.agentId, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const rule = await prisma.triggerRule.create({
      data: {
        userId,
        agentId:        body.agentId,
        provider:       body.provider,
        label:          body.label,
        promptTemplate: body.promptTemplate,
        filterField:    body.filterField ?? null,
        filterOp:       body.filterOp    ?? null,
        filterValue:    body.filterValue ?? null,
      },
      include: { agent: { select: { id: true, name: true, avatarUrl: true, role: true } } },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'CREATE_TRIGGER', rule.id))
      .catch(() => {})

    return reply.code(201).send({ rule })
  })

  // PATCH /api/triggers/:id — update label, template, filter, or active state
  app.patch('/api/triggers/:id', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }
    const body   = UpdateRuleSchema.parse(req.body)

    const rule = await prisma.triggerRule.findFirst({ where: { id, userId } })
    if (!rule) return reply.code(404).send({ error: 'Rule not found' })

    const updated = await prisma.triggerRule.update({
      where: { id },
      data: {
        ...(body.label          !== undefined && { label: body.label }),
        ...(body.promptTemplate !== undefined && { promptTemplate: body.promptTemplate }),
        ...(body.filterField    !== undefined && { filterField: body.filterField }),
        ...(body.filterOp       !== undefined && { filterOp: body.filterOp }),
        ...(body.filterValue    !== undefined && { filterValue: body.filterValue }),
        ...(body.isActive       !== undefined && { isActive: body.isActive }),
      },
      include: { agent: { select: { id: true, name: true, avatarUrl: true, role: true } } },
    })

    return reply.send({ rule: updated })
  })

  // DELETE /api/triggers/:id — remove a rule
  app.delete('/api/triggers/:id', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const rule = await prisma.triggerRule.findFirst({ where: { id, userId } })
    if (!rule) return reply.code(404).send({ error: 'Rule not found' })

    await prisma.triggerRule.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // GET /api/triggers/:id/events — event log for a specific rule (last 50)
  app.get('/api/triggers/:id/events', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const rule = await prisma.triggerRule.findFirst({ where: { id, userId } })
    if (!rule) return reply.code(404).send({ error: 'Rule not found' })

    const events = await prisma.inboundEvent.findMany({
      where:   { ruleId: id },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  {
        id:         true,
        taskId:     true,
        provider:   true,
        senderInfo: true,
        summary:    true,
        matched:    true,
        createdAt:  true,
      },
    })

    return reply.send({ events })
  })
}
