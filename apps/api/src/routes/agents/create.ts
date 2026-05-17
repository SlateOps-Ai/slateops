import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const scopeConfigSchema = z.object({
  permitted:      z.array(z.string()).default([]),
  forbidden:      z.array(z.string()).default([]),
  refusalMessage: z.string().max(500).default(''),
})

const createSchema = z.object({
  name:         z.string().min(1).max(50),
  role:         z.enum(['EXEC_ASSISTANT', 'RESEARCH_ANALYST', 'CONTENT_WRITER', 'SALES_PROSPECTOR', 'OPS_COORDINATOR', 'FINANCIAL_ANALYST', 'HR_MANAGER', 'CUSTOMER_SUPPORT', 'DATA_ANALYST', 'MARKETING_STRATEGIST']),
  avatarStyle:  z.enum(['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']),
  presentation: z.enum(['FEMININE', 'MASCULINE', 'NEUTRAL']),
  personality:  z.string().max(200).optional(),
  avatarUrl:    z.string().url().optional(),
  contextBrief: z.string().max(1000).optional(),
  pattern:      z.enum(['COPILOT', 'TRIAGE', 'TRANSACTION', 'MONITOR', 'DECISION_SUPPORT', 'AUTONOMOUS']).default('AUTONOMOUS'),
  scopeConfig:  scopeConfigSchema.optional(),
  isPublic:     z.boolean().default(false),
})

const avatarSchema = z.object({
  style:        z.enum(['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']),
  presentation: z.enum(['FEMININE', 'MASCULINE', 'NEUTRAL']),
  seed:         z.string().optional(),
})

// Background palette per avatar style
const STYLE_BG: Record<string, string> = {
  PROFESSIONAL: 'b6e3f4',
  CREATIVE:     'ffd5dc',
  CASUAL:       'd1d4f9',
  EXECUTIVE:    'c0aede',
}

function dicebearUrl(seed: string, style: string): string {
  const bg  = STYLE_BG[style] ?? 'b6e3f4'
  const enc = encodeURIComponent(seed)
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${enc}&backgroundColor=${bg}&radius=50`
}

function buildSystemPrompt(role: string, name: string, personality?: string): string {
  const roleDescriptions: Record<string, string> = {
    EXEC_ASSISTANT:       'executive assistant specialising in email management, scheduling, and professional communication',
    RESEARCH_ANALYST:     'research analyst who produces detailed, well-sourced briefings and competitive intelligence',
    CONTENT_WRITER:       'content writer who creates engaging, on-brand written content across formats',
    SALES_PROSPECTOR:     'sales development specialist who identifies and qualifies potential clients',
    OPS_COORDINATOR:      'operations coordinator who keeps projects organised and running smoothly',
    FINANCIAL_ANALYST:    'financial analyst who handles budgets, forecasts, expense tracking, and financial reporting',
    HR_MANAGER:           'HR manager who drafts job descriptions, performance reviews, and onboarding documentation',
    CUSTOMER_SUPPORT:     'customer support specialist who crafts empathetic ticket responses, FAQs, and customer communications',
    DATA_ANALYST:         'data analyst who synthesises metrics, identifies trends, and produces actionable insight reports',
    MARKETING_STRATEGIST: 'marketing strategist who plans campaigns, develops brand messaging, and writes compelling ad copy',
  }

  return `You are ${name}, a ${roleDescriptions[role] ?? role}.
${personality ? `Personality: ${personality}` : ''}
Always be thorough, accurate, and professional.
When using tools, explain what you are doing in simple terms.
Never fabricate data — if you cannot find information, say so.`
}

// ── Desk positions for new agents ──────────────────────────────────

const AGENT_DESK_POSITIONS = [
  { x: 272, y: 388 },   // agent_0 — left pod back-left
  { x: 412, y: 388 },   // agent_1 — left pod back-right
  { x: 342, y: 525 },   // agent_2 — left pod front
  { x: 855, y: 388 },   // agent_3 — right pod back-left
  { x: 995, y: 388 },   // agent_4 — right pod back-right
  { x: 925, y: 525 },   // agent_5 — right pod front
]

export default async function agentsRoute(app: FastifyInstance) {

  // Return a deterministic DiceBear avatar URL (no external call needed)
  app.post('/api/agents/avatar', async (req, reply) => {
    const { style, seed } = avatarSchema.parse(req.body)
    const url = dicebearUrl(seed ?? `preview-${style}`, style)
    return reply.send({ url })
  })

  // Create agent
  app.post('/api/agents', async (req, reply) => {
    const body   = createSchema.parse(req.body)
    const userId = req.dbUserId

    const office = await prisma.office.findUnique({ where: { userId } })
    if (!office) return reply.code(404).send({ error: 'Office not found' })

    // Determine desk position
    const existingCount = await prisma.agent.count({ where: { userId } })
    const deskPosition  = AGENT_DESK_POSITIONS[existingCount % AGENT_DESK_POSITIONS.length]

    // Generate deterministic avatar based on agent name + role
    const avatarUrl = body.avatarUrl ?? dicebearUrl(`${body.name}-${body.role}`, body.avatarStyle)

    const agent = await prisma.agent.create({
      data: {
        officeId:           office.id,
        userId,
        name:               body.name,
        role:               body.role,
        systemPrompt:       buildSystemPrompt(body.role, body.name, body.personality),
        personality:        body.personality,
        contextBrief:       body.contextBrief,
        avatarUrl,
        avatarStyle:        body.avatarStyle,
        avatarPresentation: body.presentation,
        deskPosition,
        pattern:            body.pattern,
        scopeConfig:        body.scopeConfig ?? undefined,
        isPublic:           body.isPublic,
      },
    })

    // Award XP — non-blocking
    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'HIRE_AGENT', agent.id))
      .catch(() => {})

    if (body.contextBrief?.trim()) {
      const { encrypt } = await import('../../lib/crypto.js')
      await prisma.agentMemory.create({
        data: {
          agentId: agent.id,
          key:     'context_brief',
          value:   encrypt(body.contextBrief.trim()),
        },
      })
    }

    return reply.code(201).send({ agent })
  })

  // Update agent config (pattern, scope, isPublic, name, …)
  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const patchSchema = z.object({
      name:         z.string().min(1).max(40).optional(),
      pattern:      z.enum(['COPILOT', 'TRIAGE', 'TRANSACTION', 'MONITOR', 'DECISION_SUPPORT', 'AUTONOMOUS']).optional(),
      scopeConfig:  scopeConfigSchema.optional(),
      isPublic:     z.boolean().optional(),
      contextBrief: z.string().max(1000).nullable().optional(),
      personality:  z.string().max(200).optional(),
    })
    const body = patchSchema.parse(req.body)

    const agent = await prisma.agent.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const updated = await prisma.agent.update({
      where: { id },
      data:  {
        ...(body.name         !== undefined && { name:         body.name.trim() }),
        ...(body.pattern      !== undefined && { pattern:      body.pattern }),
        ...(body.scopeConfig  !== undefined && { scopeConfig:  body.scopeConfig }),
        ...(body.isPublic     !== undefined && { isPublic:     body.isPublic }),
        ...(body.contextBrief !== undefined && { contextBrief: body.contextBrief }),
        ...(body.personality  !== undefined && { personality:  body.personality }),
      },
    })
    return reply.send({ agent: updated })
  })

  // List agents
  app.get('/api/agents', async (req, reply) => {
    const agents = await prisma.agent.findMany({
      where:   { userId: req.dbUserId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ agents })
  })

  // ── DELETE /api/agents/:id ─────────────────────────────────────────────
  // Soft-delete: flips isActive to false and drains any work the agent had
  // scheduled. Preserves Task history (immutable audit trail; non-cascade
  // relation in the schema by design).
  //
  // Refuses if the agent is a published marketplace product — those have
  // external buyers/installs that we don't want to break silently. The
  // user must un-publish first.
  //
  // Soft-delete chosen over hard-delete because:
  //   * Task / TaskEvent / ApprovalRequest don't cascade — hard-delete
  //     would require either dropping history (bad) or migrating tasks to
  //     a tombstone agent (extra complexity).
  //   * isActive already filters every list query, so a soft-deleted agent
  //     instantly disappears from the cockpit / dock / marketplace cap.
  //   * Reversible — if the user changes their mind we can resurrect.
  app.delete('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const agent = await prisma.agent.findFirst({
      where: { id, userId, isActive: true },
      select: { id: true, name: true },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    // Block delete if this agent is a published marketplace product —
    // external buyers may have installed it and we'd silently break them.
    const publishedProduct = await prisma.agentProduct.findFirst({
      where:  { agentId: id, isPublished: true },
      select: { id: true, name: true },
    })
    if (publishedProduct) {
      return reply.code(409).send({
        error: `${agent.name} is a published marketplace product ("${publishedProduct.name}"). Unpublish it from the marketplace before deleting.`,
        code:  'AGENT_IS_PUBLISHED_PRODUCT',
      })
    }

    // Wrap every state mutation in a single transaction so a partial
    // failure can't leave the agent half-deleted (isActive=false but
    // tasks still IN_PROGRESS, etc.).
    await prisma.$transaction(async (tx) => {
      // Cancel in-flight tasks for this agent. PENDING/IN_PROGRESS/NEEDS_APPROVAL
      // all become CANCELLED so the cron loops and approval queue ignore them.
      const liveTasks = await tx.task.findMany({
        where:  { agentId: id, status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_APPROVAL'] } },
        select: { id: true },
      })
      const liveTaskIds = liveTasks.map((t) => t.id)

      if (liveTaskIds.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: liveTaskIds } },
          data:  { status: 'CANCELLED', completedAt: new Date() },
        })
        // Expire any pending approval requests on those tasks.
        await tx.approvalRequest.updateMany({
          where: { taskId: { in: liveTaskIds }, status: 'PENDING' },
          data:  { status: 'EXPIRED', respondedAt: new Date() },
        })
      }

      // Cancel scheduled social posts that were going to be sent by this
      // agent. SocialPostStatus has a CANCELLED state for exactly this.
      await tx.scheduledPost.updateMany({
        where: { agentId: id, status: { in: ['DRAFT', 'SCHEDULED'] } },
        data:  { status: 'CANCELLED', failReason: 'Agent deleted by user' },
      })

      // Disable trigger rules pointing at this agent — inbound webhooks
      // for these rules will no longer fire tasks.
      await tx.triggerRule.updateMany({
        where: { agentId: id, isActive: true },
        data:  { isActive: false },
      })

      // Deactivate scheduled cron runs whose saved command targets this
      // agent. The hourly scheduler reads isActive: true.
      const savedCmds = await tx.savedCommand.findMany({
        where:  { agentId: id },
        select: { id: true },
      })
      if (savedCmds.length > 0) {
        await tx.scheduledRun.updateMany({
          where: { savedCommandId: { in: savedCmds.map((s) => s.id) }, isActive: true },
          data:  { isActive: false },
        })
      }

      // Final flip — agent disappears from every list query.
      await tx.agent.update({
        where: { id },
        data:  { isActive: false, status: 'OFFLINE' },
      })
    })

    return reply.send({ ok: true, deletedAgentId: id })
  })
}
