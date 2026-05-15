import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'
import { PATTERN_PREAMBLES } from '../../lib/domain-guard.js'

const bodySchema = z.object({
  agentId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
})

// Lightweight in-memory rate limiter: max 30 messages per IP per hour
const ipCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now  = Date.now()
  const slot = ipCounts.get(ip)
  if (!slot || now > slot.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
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
    const ip = req.ip ?? 'unknown'
    if (!checkRateLimit(ip)) {
      return reply.code(429).send({ error: 'Rate limit exceeded. Try again later.' })
    }

    const body  = bodySchema.parse(req.body)
    const agent = await prisma.agent.findFirst({
      where:   { id: body.agentId, isPublic: true, isActive: true },
      include: {
        memories:  { orderBy: { updatedAt: 'desc' }, take: 5, select: { key: true, value: true } },
        knowledge: { orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, content: true } },
      },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found or not public' })

    const preamble = PATTERN_PREAMBLES[(agent as any).pattern ?? 'AUTONOMOUS']
    const memBlock = agent.memories.length
      ? `\n\nKnown context:\n${agent.memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      : ''
    const kbBlock = (agent as any).knowledge?.length
      ? `\n\nKnowledge:\n${(agent as any).knowledge.map((k: any) => `[${k.title}]\n${k.content.slice(0, 800)}`).join('\n\n')}`
      : ''

    const system = `${preamble}

You are ${agent.name}, a ${agent.role.toLowerCase().replace(/_/g, ' ')}.
Personality: ${agent.personality ?? 'professional and helpful'}.${agent.contextBrief ? `\n\nContext: ${agent.contextBrief}` : ''}${memBlock}${kbBlock}
You are embedded on a website. Be concise, friendly, and stay in character. Keep responses under 200 words unless detail is essential.`

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
