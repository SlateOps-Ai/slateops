import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'

const bodySchema = z.object({
  businessDescription: z.string().min(3).max(2000),
  topPainPoint:        z.string().min(3).max(2000),
})

type AgentRole =
  | 'EXEC_ASSISTANT' | 'RESEARCH_ANALYST' | 'CONTENT_WRITER' | 'SALES_PROSPECTOR'
  | 'OPS_COORDINATOR' | 'FINANCIAL_ANALYST' | 'HR_MANAGER' | 'CUSTOMER_SUPPORT'
  | 'DATA_ANALYST' | 'MARKETING_STRATEGIST'

const VALID_ROLES: AgentRole[] = [
  'EXEC_ASSISTANT', 'RESEARCH_ANALYST', 'CONTENT_WRITER', 'SALES_PROSPECTOR',
  'OPS_COORDINATOR', 'FINANCIAL_ANALYST', 'HR_MANAGER', 'CUSTOMER_SUPPORT',
  'DATA_ANALYST', 'MARKETING_STRATEGIST',
]

interface ComposedAgent { role: AgentRole; name: string; firstTask: string }

// ── Keyword fallback (only used if the LLM call fails) ────────────────────────

const ROLE_TRIGGERS: Record<AgentRole, RegExp> = {
  CONTENT_WRITER:        /\b(content|writing|blog|newsletter|post|copy|draft)\b/i,
  MARKETING_STRATEGIST:  /\b(market(ing)?|brand|campaign|growth|positioning)\b/i,
  SALES_PROSPECTOR:      /\b(sales|lead|prospect|outreach|cold|pipeline|deal)\b/i,
  RESEARCH_ANALYST:      /\b(research|competitor|intel|analysis|insight|brief)\b/i,
  FINANCIAL_ANALYST:     /\b(finance|account|budget|p&?l|revenue|forecast|cash)\b/i,
  OPS_COORDINATOR:       /\b(operation|ops|project|coordination|logistics)\b/i,
  DATA_ANALYST:          /\b(data|metric|kpi|dashboard|report|trend)\b/i,
  CUSTOMER_SUPPORT:      /\b(support|customer|ticket|service|help|crm|notification)\b/i,
  HR_MANAGER:            /\b(hiring|hr|recruit|onboard\s+\w*|people\s+ops|talent)\b/i,
  EXEC_ASSISTANT:        /\b(email|inbox|schedul|calendar|meeting|assistant|reminder)\b/i,
}

const FALLBACK_TEAM: AgentRole[] = ['EXEC_ASSISTANT', 'RESEARCH_ANALYST', 'CONTENT_WRITER']

const ROLE_DEFAULTS: Record<AgentRole, { name: string; firstTask: string }> = {
  EXEC_ASSISTANT:       { name: 'Avery',  firstTask: 'Summarise my inbox and flag anything that needs a same-day reply.' },
  RESEARCH_ANALYST:     { name: 'Sara',   firstTask: 'Prepare a one-paragraph competitor positioning summary for this business.' },
  CONTENT_WRITER:       { name: 'Musa',   firstTask: 'Draft a LinkedIn post announcing what we do and why it matters.' },
  SALES_PROSPECTOR:     { name: 'Keen',   firstTask: 'Build a list of 10 ideal-customer companies and the right person to contact at each.' },
  OPS_COORDINATOR:      { name: 'Jordan', firstTask: 'Audit my open projects and surface the three most likely to slip this week.' },
  FINANCIAL_ANALYST:    { name: 'Maya',   firstTask: 'Sketch a one-page P&L template I can fill in monthly.' },
  HR_MANAGER:           { name: 'Riley',  firstTask: 'Draft a job description template tuned to this business.' },
  CUSTOMER_SUPPORT:     { name: 'Tomi',   firstTask: 'Draft three reusable reply templates for common support requests.' },
  DATA_ANALYST:         { name: 'Devon',  firstTask: 'Propose the five KPIs this business should track weekly.' },
  MARKETING_STRATEGIST: { name: 'Lina',   firstTask: 'Outline a 30-day go-to-market plan with three measurable milestones.' },
}

function composeFallback(businessDescription: string, topPainPoint: string): ComposedAgent[] {
  const text = `${businessDescription} ${topPainPoint}`.toLowerCase()
  const matched: AgentRole[] = []
  for (const [role, pattern] of Object.entries(ROLE_TRIGGERS) as [AgentRole, RegExp][]) {
    if (pattern.test(text) && !matched.includes(role)) matched.push(role)
  }
  const team = (matched.length >= 3 ? matched : [...matched, ...FALLBACK_TEAM.filter((r) => !matched.includes(r))]).slice(0, 5)
  return team.map((role) => ({ role, ...ROLE_DEFAULTS[role] }))
}

// ── LLM composer ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are SlateOps Chief of Staff — the AI that helps a new subscriber assemble their first office of AI agents.

A subscriber will describe their business and the most time-consuming task on their plate this week. Your job: recommend 3-5 AI agents tailored to that business, each with a specific, useful first task they can run immediately.

Rules:
- Pick roles strictly from the provided enum.
- The first agent in the list should directly address the user's stated pain point.
- Names: single first-name only (3-12 chars), feel diverse and modern. Don't reuse common stock names like "John" or "Jane".
- firstTask: ONE concrete sentence tailored to the user's business (use their language). Not a generic template. It should be something the user can click Send on right away.
- No duplicate roles in the team.
- Output via the recommend_team tool only — no chatty preamble.`

async function composeWithLlm(businessDescription: string, topPainPoint: string): Promise<ComposedAgent[] | null> {
  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Business: ${businessDescription}\n\nTop pain point this week: ${topPainPoint}\n\nRecommend the team via the recommend_team tool.`,
      }],
      tools: [{
        name:        'recommend_team',
        description: 'Return the recommended team of 3-5 AI agents tailored to this subscriber.',
        input_schema: {
          type: 'object',
          properties: {
            agents: {
              type:     'array',
              minItems: 3,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  role:      { type: 'string', enum: VALID_ROLES },
                  name:      { type: 'string', description: 'First name only, 3-12 characters' },
                  firstTask: { type: 'string', description: 'One concrete first-task sentence tailored to this business' },
                },
                required: ['role', 'name', 'firstTask'],
              },
            },
          },
          required: ['agents'],
        },
      }],
      tool_choice: { type: 'tool', name: 'recommend_team' },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return null
    const input = toolUse.input as { agents?: unknown }
    if (!Array.isArray(input.agents)) return null

    const result: ComposedAgent[] = []
    const seenRoles = new Set<AgentRole>()
    for (const raw of input.agents) {
      if (!raw || typeof raw !== 'object') continue
      const a = raw as { role?: string; name?: string; firstTask?: string }
      if (!a.role || !a.name || !a.firstTask) continue
      if (!VALID_ROLES.includes(a.role as AgentRole)) continue
      if (seenRoles.has(a.role as AgentRole)) continue
      seenRoles.add(a.role as AgentRole)
      result.push({
        role:      a.role as AgentRole,
        name:      a.name.slice(0, 12),
        firstTask: a.firstTask,
      })
    }
    if (result.length < 3) return null
    return result.slice(0, 5)
  } catch {
    return null
  }
}

export default async function onboardingComposeRoute(app: FastifyInstance) {
  app.post('/api/onboarding/compose', async (req, reply) => {
    const body = bodySchema.parse(req.body)

    const llm   = await composeWithLlm(body.businessDescription, body.topPainPoint)
    const agents = llm ?? composeFallback(body.businessDescription, body.topPainPoint)

    const existing = await prisma.user.findUnique({ where: { id: req.dbUserId }, select: { settings: true } })
    const raw = (existing?.settings as any) ?? {}
    await prisma.user.update({
      where: { id: req.dbUserId },
      data:  {
        settings: {
          ...raw,
          onboardingIntake: {
            businessDescription: body.businessDescription,
            topPainPoint:        body.topPainPoint,
            composedAgents:      agents,
            composedBy:          llm ? 'LLM' : 'KEYWORD_FALLBACK',
            completedAt:         new Date().toISOString(),
          },
        },
      },
    })

    return reply.send({ agents, composedBy: llm ? 'LLM' : 'KEYWORD_FALLBACK' })
  })
}
