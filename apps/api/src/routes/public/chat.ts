import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'
import { PATTERN_PREAMBLES } from '../../lib/domain-guard.js'
import { STRICT_PURPOSE_CONTRACT } from '../../lib/strict-purpose.js'
import { publicAgentSpendSince, PUBLIC_AGENT_DAILY_USD_CAP } from '../../lib/llm-usage.js'

const bodySchema = z.object({
  agentId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
})

// Per-agent in-process burst limiter — 30 req/min/agent. This is on top of the
// 24h cost cap below; the cost cap is the source of truth for abuse, this just
// keeps a single attacker from torching $1 in a single second.
const agentBuckets = new Map<string, { count: number; resetAt: number }>()
function checkAgentBurst(agentId: string): boolean {
  const now  = Date.now()
  const slot = agentBuckets.get(agentId)
  if (!slot || now > slot.resetAt) {
    agentBuckets.set(agentId, { count: 1, resetAt: now + 60 * 1000 })
    return true
  }
  if (slot.count >= 30) return false
  slot.count++
  return true
}

export default async function publicChatRoute(app: FastifyInstance) {
  // Public endpoint — no auth middleware, but skip the dbUserId decorator
  app.post('/api/public-chat', {
    config: { skipAuth: true } as any,
  }, async (req, reply) => {
    const body = bodySchema.parse(req.body)

    if (!checkAgentBurst(body.agentId)) {
      return reply.code(429).send({ error: 'Rate limit exceeded. Try again in a minute.' })
    }

    const agent = await prisma.agent.findFirst({
      where:   { id: body.agentId, isPublic: true, isActive: true },
      // Memories + knowledge are deliberately NOT loaded for public chat — they
      // can contain owner-private info and prompt-injected visitors could
      // exfiltrate them. Only the owner-curated contextBrief is exposed.
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found or not public' })

    // Per-agent daily cost cap — if this agent has already burned through its
    // public-chat budget for the rolling 24h, refuse anonymous calls until it
    // rolls off. The owner's credit pool is the ultimate stop, but this is the
    // throttle that keeps a single agent from being weaponised.
    const spent24h = await publicAgentSpendSince(agent.id, 24 * 60 * 60 * 1000)
    if (spent24h >= PUBLIC_AGENT_DAILY_USD_CAP) {
      return reply.code(429).send({ error: 'This agent is temporarily unavailable. Please try again later.' })
    }

    const preamble = PATTERN_PREAMBLES[(agent as any).pattern ?? 'AUTONOMOUS']

    // System prompt for public chat is intentionally minimal: role + personality
    // + owner-curated contextBrief. No memories, no knowledge corpora — those
    // stay private-chat-only to avoid exfiltration via prompt injection.
    const system = `${preamble}

You are ${agent.name}, a ${agent.role.toLowerCase().replace(/_/g, ' ')}.
Personality: ${agent.personality ?? 'professional and helpful'}.${agent.contextBrief ? `\n\nContext: ${agent.contextBrief}` : ''}
You are embedded on a website. Be concise, friendly, and stay in character. Keep responses under 200 words unless detail is essential.

${STRICT_PURPOSE_CONTRACT}`

    const client = getAnthropicClient()

    // Moderation pre-flight — this endpoint is anonymous (public widget),
    // so untrusted callers can submit prompts. Reject anything flagged.
    const { moderatePrompt } = await import('../../lib/moderation.js')
    const mod = await moderatePrompt(body.message, { userId: agent.userId, endpoint: '/api/public/agents/:id/chat' })
    if (!mod.safe) {
      return reply.code(400).send({ error: 'Your message was flagged by our content policy. Please rephrase and try again.' })
    }

    const { callAnthropic } = await import('../../lib/llm-usage.js')
    const response = await callAnthropic(client, {
      model:    'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages: [
        ...body.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: body.message },
      ],
    }, { userId: agent.userId, agentId: agent.id, endpoint: '/api/public/agents/:id/chat' })

    const text = (response.content as any[])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as { text: string }).text)
      .join('')

    return reply.send({ reply: text, agentName: agent.name, avatarUrl: agent.avatarUrl })
  })

  // Public agent info — used by widget to show name/avatar before first message
  app.get('/api/public-chat/:agentId', {
    config: { skipAuth: true } as any,
  }, async (req, reply) => {
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({
      where:  { id: agentId, isPublic: true, isActive: true },
      select: { name: true, avatarUrl: true, role: true, personality: true, contextBrief: true },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })
    return reply.send({ agent })
  })
}
