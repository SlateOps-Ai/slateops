import fp from 'fastify-plugin'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma.js'

const ai = new Anthropic()

export default fp(async (app) => {
  // GET full knowledge graph
  app.get('/api/brain', async (req: any, reply) => {
    const userId = req.userId
    const nodes = await prisma.brainNode.findMany({
      where: { userId },
      orderBy: { importance: 'desc' },
      take: 200,
    })
    return reply.send({ nodes })
  })

  // POST create a brain node (manual or auto)
  app.post('/api/brain/node', async (req: any, reply) => {
    const userId = req.userId
    const { topic, content, category = 'learning', importance = 1, linkedTaskIds = [], linkedAgentIds = [] } =
      req.body as { topic: string; content: string; category?: string; importance?: number; linkedTaskIds?: string[]; linkedAgentIds?: string[] }

    const node = await prisma.brainNode.create({
      data: { userId, topic, content, category, importance, linkedTaskIds, linkedAgentIds },
    })
    return reply.code(201).send({ node })
  })

  // POST extract and store knowledge from a completed task
  app.post('/api/brain/ingest/:taskId', async (req: any, reply) => {
    const { taskId } = req.params as { taskId: string }
    const userId = req.userId

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: { agent: { select: { name: true, id: true } } },
    })
    if (!task || task.status !== 'COMPLETE') return reply.code(404).send({ error: 'Task not found or not complete' })

    const resultText = JSON.stringify(task.result ?? '').slice(0, 3000)

    try {
      const { callAnthropic } = await import('../../lib/llm-usage.js')
      const msg = await callAnthropic(ai, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Extract 1–3 concise knowledge insights from this completed AI agent task. For each insight return JSON: {"topic":"…","content":"…","category":"decision|learning|client|process|market","importance":1-5}. Return ONLY a JSON array, no prose.\n\nTask: ${task.title}\nResult: ${resultText}`,
        }],
      }, { userId, agentId: task.agentId, endpoint: '/api/brain/extract' })
      const raw = (msg.content[0] as any).text.trim()
      const insights = JSON.parse(raw.replace(/```json|```/g, '').trim())

      const nodes = await Promise.all(
        (Array.isArray(insights) ? insights : [insights]).map((ins: any) =>
          prisma.brainNode.create({
            data: {
              userId,
              topic: ins.topic ?? task.title,
              content: ins.content ?? '',
              category: ins.category ?? 'learning',
              importance: ins.importance ?? 1,
              linkedTaskIds: [taskId],
              linkedAgentIds: [task.agentId],
            },
          })
        )
      )
      return reply.send({ nodes })
    } catch {
      return reply.send({ nodes: [] })
    }
  })

  // POST query the company brain ("Ask the Office")
  app.post('/api/brain/query', async (req: any, reply) => {
    const userId = req.userId
    const { question } = req.body as { question: string }

    const nodes = await prisma.brainNode.findMany({
      where: { userId },
      orderBy: [{ importance: 'desc' }, { accessCount: 'desc' }],
      take: 40,
    })

    if (!nodes.length) return reply.send({ answer: "Your Company Brain is empty — complete some tasks to build your knowledge base.", sources: [] })

    const context = nodes
      .map((n) => `[${n.category.toUpperCase()}] ${n.topic}: ${n.content}`)
      .join('\n')

    try {
      const { callAnthropic } = await import('../../lib/llm-usage.js')
      const msg = await callAnthropic(ai, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are the Company Brain of a business. Answer this question using only the knowledge below. Be concise and direct.\n\nKnowledge:\n${context}\n\nQuestion: ${question}`,
        }],
      }, { userId, endpoint: '/api/brain/query' })

      // Bump access count on used nodes (top 5)
      await prisma.brainNode.updateMany({
        where: { id: { in: nodes.slice(0, 5).map((n) => n.id) } },
        data: { accessCount: { increment: 1 } },
      })

      const relevantNodes = nodes.slice(0, 5).map((n) => ({ id: n.id, topic: n.topic, category: n.category }))
      return reply.send({ answer: (msg.content[0] as any).text, sources: relevantNodes })
    } catch {
      return reply.code(500).send({ error: 'Brain query failed' })
    }
  })

  // DELETE a brain node
  app.delete('/api/brain/node/:id', async (req: any, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.userId
    await prisma.brainNode.deleteMany({ where: { id, userId } })
    return reply.send({ ok: true })
  })
})
