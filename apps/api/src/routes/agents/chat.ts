import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'

const bodySchema = z.object({
  message:  z.string().min(1).max(4000),
  history:  z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
})

const MARKETING_ROLES = new Set(['CONTENT_WRITER', 'MARKETING_STRATEGIST', 'SALES_PROSPECTOR'])
const SOCIAL_PLATFORMS = ['TWITTER', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'THREADS', 'PINTEREST'] as const

const DRAFT_SOCIAL_POST_TOOL = {
  name:        'draftSocialPost',
  description: 'Produce a social media post draft for the user to review and schedule. Use this whenever the user asks you to draft, write, or compose a post for any social platform — instead of just writing the post in chat, return it via this tool so the user gets a one-click schedule button.',
  input_schema: {
    type: 'object',
    properties: {
      content:     { type: 'string', description: 'The post body, ready to publish. Respect platform character limits (Twitter/Threads ≤ 280).' },
      platform:    { type: 'string', enum: SOCIAL_PLATFORMS, description: 'Primary platform this draft is tuned for.' },
      suggestedAt: { type: 'string', description: 'Optional ISO-8601 timestamp for suggested publish time (e.g. tomorrow 9am).' },
    },
    required: ['content', 'platform'],
  },
} as const

interface DraftPost {
  content:      string
  platform:     typeof SOCIAL_PLATFORMS[number]
  suggestedAt?: string
}

export default async function agentChatRoute(app: FastifyInstance) {
  app.post('/api/agents/:id/chat', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = bodySchema.parse(req.body)

    const agent = await prisma.agent.findFirst({
      where:   { id, userId: req.dbUserId, isActive: true },
      include: { memories: { orderBy: { updatedAt: 'desc' }, take: 10, select: { key: true, value: true } } },
    })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    const user = await prisma.user.findUnique({
      where:  { id: req.dbUserId },
      select: { byokKey: true },
    })

    const client = getAnthropicClient(user?.byokKey ?? undefined)

    const memBlock = agent.memories.length
      ? `\n\nWhat you know about the person you work for:\n${agent.memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      : ''

    const isMarketing = MARKETING_ROLES.has(agent.role)

    const toolHint = isMarketing
      ? `\n\nIMPORTANT: If the user asks you to draft, write, compose, or "do" a post for any social platform (X/Twitter, LinkedIn, Instagram, Facebook, YouTube, TikTok, Threads, Pinterest), call the draftSocialPost tool. Do NOT write the post in plain chat text — use the tool so the user gets a one-click schedule button. A short conversational reply alongside the tool call is fine.`
      : ''

    const system = `You are ${agent.name}, a ${agent.role.toLowerCase().replace(/_/g, ' ')} AI agent.
Personality: ${agent.personality ?? 'professional and efficient'}.${agent.contextBrief ? `\n\nContext: ${agent.contextBrief}` : ''}${memBlock}${toolHint}
You are in a direct conversation. Be concise, helpful, and stay in character.`

    const messages = [
      ...body.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: body.message },
    ]

    const createParams: any = {
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    }
    if (isMarketing) {
      createParams.tools = [DRAFT_SOCIAL_POST_TOOL]
    }

    const response = await client.messages.create(createParams)

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')

    // Look for a draftSocialPost tool call — if present, return its input as draftPost
    let draftPost: DraftPost | null = null
    if (isMarketing) {
      const toolBlock = response.content.find((b) => b.type === 'tool_use' && (b as any).name === 'draftSocialPost')
      if (toolBlock && toolBlock.type === 'tool_use') {
        const input = (toolBlock as any).input as Partial<DraftPost>
        if (input?.content && input?.platform && (SOCIAL_PLATFORMS as readonly string[]).includes(input.platform)) {
          draftPost = {
            content:     input.content,
            platform:    input.platform as DraftPost['platform'],
            suggestedAt: input.suggestedAt,
          }
        }
      }
    }

    // If the model only called the tool with no text, give the user a short framing line
    const replyText = text.trim().length > 0
      ? text
      : draftPost
      ? `Here's a draft for ${draftPost.platform} — review and schedule when ready.`
      : ''

    // Create a completed task record so the user can rate this chat response
    const chatTask = await prisma.task.create({
      data: {
        agentId:    agent.id,
        userId:     req.dbUserId,
        title:      body.message.slice(0, 60),
        rawCommand: body.message,
        status:     'COMPLETE',
        complexity: 'SIMPLE',
        completedAt: new Date(),
        result:     { type: 'text', title: body.message.slice(0, 60), content: replyText, draftPost: draftPost as any },
      },
    }).catch(() => null)

    return reply.send({ reply: replyText, taskId: chatTask?.id ?? null, draftPost })
  })
}
