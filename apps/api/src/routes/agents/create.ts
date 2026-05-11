import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { fal } from '@fal-ai/client'
import { prisma } from '../../lib/prisma.js'

const createSchema = z.object({
  name:         z.string().min(1).max(50),
  role:         z.enum(['EXEC_ASSISTANT', 'RESEARCH_ANALYST', 'CONTENT_WRITER', 'SALES_PROSPECTOR', 'OPS_COORDINATOR']),
  avatarStyle:  z.enum(['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']),
  presentation: z.enum(['FEMININE', 'MASCULINE', 'NEUTRAL']),
  personality:  z.string().max(200).optional(),
  avatarUrl:    z.string().url().optional(),
  contextBrief: z.string().max(1000).optional(),
})

const avatarSchema = z.object({
  style:        z.enum(['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']),
  presentation: z.enum(['FEMININE', 'MASCULINE', 'NEUTRAL']),
})

const STYLE_PROMPTS: Record<string, string> = {
  PROFESSIONAL: 'business professional, crisp white shirt, clean background',
  CREATIVE:     'creative professional, colorful background, modern style',
  CASUAL:       'smart casual, friendly expression, warm background',
  EXECUTIVE:    'corporate executive, formal suit, confident posture',
}

const PRESENTATION_PROMPTS: Record<string, string> = {
  FEMININE: 'woman',
  MASCULINE: 'man',
  NEUTRAL:  'person with neutral features',
}

function buildSystemPrompt(role: string, name: string, personality?: string): string {
  const roleDescriptions: Record<string, string> = {
    EXEC_ASSISTANT:  'executive assistant specialising in email management, scheduling, and professional communication',
    RESEARCH_ANALYST: 'research analyst who produces detailed, well-sourced briefings and competitive intelligence',
    CONTENT_WRITER:  'content writer who creates engaging, on-brand written content across formats',
    SALES_PROSPECTOR: 'sales development specialist who identifies and qualifies potential clients',
    OPS_COORDINATOR:  'operations coordinator who keeps projects organised and running smoothly',
  }

  return `You are ${name}, a ${roleDescriptions[role] ?? role}.
${personality ? `Personality: ${personality}` : ''}
Always be thorough, accurate, and professional.
When using tools, explain what you are doing in simple terms.
Never fabricate data — if you cannot find information, say so.`
}

// ── Desk positions for new agents ──────────────────────────────────

const AGENT_DESK_POSITIONS = [
  { x: 380, y: 270 },
  { x: 900, y: 270 },
  { x: 380, y: 540 },
]

export default async function agentsRoute(app: FastifyInstance) {

  // Generate avatar preview
  app.post('/api/agents/avatar', async (req, reply) => {
    const { style, presentation } = avatarSchema.parse(req.body)

    fal.config({ credentials: process.env.FAL_KEY })

    const prompt = `Illustrated professional portrait, ${PRESENTATION_PROMPTS[presentation]},
${STYLE_PROMPTS[style]}, flat illustration style, high quality, square crop,
consistent art style, soft lighting, no text`

    const result = await fal.run('fal-ai/flux/schnell', {
      input: {
        prompt,
        image_size:        'square',
        num_inference_steps: 4,
        num_images:        1,
      },
    })

    const url = (result as any).images?.[0]?.url
    if (!url) return reply.code(500).send({ error: 'Avatar generation failed' })

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

    // Generate avatar if not provided
    let avatarUrl = body.avatarUrl
    if (!avatarUrl) {
      fal.config({ credentials: process.env.FAL_KEY })
      const prompt = `Illustrated professional portrait, ${PRESENTATION_PROMPTS[body.presentation]},
${STYLE_PROMPTS[body.avatarStyle]}, flat illustration style, high quality, square crop`

      const result = await fal.run('fal-ai/flux/schnell', {
        input: { prompt, image_size: 'square', num_inference_steps: 4, num_images: 1 },
      })
      avatarUrl = (result as any).images?.[0]?.url ?? ''
    }

    const agent = await prisma.agent.create({
      data: {
        officeId:           office.id,
        userId,
        name:               body.name,
        role:               body.role,
        systemPrompt:       buildSystemPrompt(body.role, body.name, body.personality),
        personality:        body.personality,
        contextBrief:       body.contextBrief,
        avatarUrl:          avatarUrl ?? '',
        avatarStyle:        body.avatarStyle,
        avatarPresentation: body.presentation,
        deskPosition,
      },
    })

    // Seed first memory from contextBrief so the moat starts accumulating immediately
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

  // List agents
  app.get('/api/agents', async (req, reply) => {
    const agents = await prisma.agent.findMany({
      where:   { userId: req.dbUserId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ agents })
  })
}
