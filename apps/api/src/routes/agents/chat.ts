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

    const system = `You are ${agent.name}, a ${agent.role.toLowerCase().replace(/_/g, ' ')} AI agent.
Personality: ${agent.personality ?? 'professional and efficient'}.${agent.contextBrief ? `\n\nContext: ${agent.contextBrief}` : ''}${memBlock}
You are in a direct conversation. Be concise, helpful, and stay in character.`

    const messages = [
      ...body.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: body.message },
    ]

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')

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
        result:     { type: 'text', title: body.message.slice(0, 60), content: text },
      },
    }).catch(() => null)

    return reply.send({ reply: text, taskId: chatTask?.id ?? null })
  })
}
