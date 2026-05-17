import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

const DESK_POSITIONS = [
  { x: 272, y: 388 }, { x: 412, y: 388 }, { x: 342, y: 525 },
  { x: 855, y: 388 }, { x: 995, y: 388 }, { x: 925, y: 525 },
]

const STYLE_BG: Record<string, string> = {
  PROFESSIONAL: 'b6e3f4', CREATIVE: 'ffd5dc', CASUAL: 'd1d4f9', EXECUTIVE: 'c0aede',
}

function dicebearUrl(seed: string, style = 'PROFESSIONAL'): string {
  const bg = STYLE_BG[style] ?? 'b6e3f4'
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}&radius=50`
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
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

function systemPrompt(role: string, name: string, businessContext: string): string {
  return `You are ${name}, a ${ROLE_DESCRIPTIONS[role] ?? role}.
Business context: ${businessContext}
Always be thorough, accurate, and professional.
When using tools, explain what you are doing in simple terms.
Never fabricate data — if you cannot find information, say so.`
}

export default async function onboardingInstallRoute(app: FastifyInstance) {
  app.post('/api/onboarding/install', async (req, reply) => {
    const userId = req.dbUserId

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { settings: true },
    })
    const intake = (user?.settings as any)?.onboardingIntake
    if (!intake?.composedAgents?.length) {
      return reply.code(400).send({ error: 'No onboarding intake found. Complete the takeover first.' })
    }

    const office = await prisma.office.findUnique({ where: { userId } })
    if (!office) return reply.code(404).send({ error: 'Office not found' })

    const existingCount = await prisma.agent.count({ where: { userId } })
    const slotsLeft     = Math.max(0, 6 - existingCount)
    const toInstall     = intake.composedAgents.slice(0, slotsLeft) as Array<{ role: string; name: string; firstTask: string }>

    const businessContext = intake.businessDescription ?? ''

    const created = []
    for (let i = 0; i < toInstall.length; i++) {
      const spec = toInstall[i]
      const deskPosition = DESK_POSITIONS[(existingCount + i) % DESK_POSITIONS.length]
      const agent = await prisma.agent.create({
        data: {
          officeId:           office.id,
          userId,
          name:               spec.name,
          role:               spec.role as any,
          systemPrompt:       systemPrompt(spec.role, spec.name, businessContext),
          avatarUrl:          dicebearUrl(`${spec.name}-${spec.role}`),
          avatarStyle:        'PROFESSIONAL',
          avatarPresentation: 'NEUTRAL',
          deskPosition,
          status:             'IDLE',
          isActive:           true,
          isPublic:           false,
        },
      })
      // Seed each agent's first-task suggestion as a memory entry — chunk 5 will use this to pre-fill the chat.
      const { encrypt: encMem } = await import('../../lib/crypto.js')
      await prisma.agentMemory.create({
        data: {
          agentId:    agent.id,
          key:        'first_task_suggestion',
          value:      encMem(spec.firstTask),
          memoryType: 'LONG_TERM',
          source:     'MANUAL',
        },
      }).catch(() => {})
      created.push(agent)
    }

    await prisma.user.update({
      where: { id: userId },
      data:  { onboardingDone: true },
    }).catch(() => {})

    // Return all of the user's agents (fresh fetch) so the client can replace the store.
    const allAgents = await prisma.agent.findMany({
      where:   { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    return reply.code(201).send({ created: created.length, agents: allAgents })
  })
}
