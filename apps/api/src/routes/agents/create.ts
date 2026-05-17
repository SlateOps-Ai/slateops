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
  strictness:   z.enum(['STRICT', 'BALANCED', 'OPEN']).default('BALANCED'),
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
        strictness:         body.strictness,
        scopeConfig:        body.scopeConfig ?? undefined,
        isPublic:           body.isPublic,
      },
    })

    // Award XP — non-blocking
    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'HIRE_AGENT', agent.id))
      .catch(() => {})

    if (body.contextBrief?.trim()) {
      await prisma.agentMemory.create({
        data: {
          agentId: agent.id,
          key:     'context_brief',
          value:   body.contextBrief.trim(),
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
      strictness:   z.enum(['STRICT', 'BALANCED', 'OPEN']).optional(),
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
        ...(body.strictness   !== undefined && { strictness:   body.strictness }),
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
}
