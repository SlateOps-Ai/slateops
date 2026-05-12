import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'

interface Suggestion {
  agentId:   string
  agentName: string
  command:   string
  rationale: string
}

export default async function suggestionsRoute(app: FastifyInstance) {
  app.get('/api/agents/suggestions', async (req, reply) => {
    const userId = req.dbUserId

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { byokKey: true },
    })

    const agents = await prisma.agent.findMany({
      where:   { userId, isActive: true },
      include: {
        memories: { orderBy: { updatedAt: 'desc' }, take: 10 },
      },
      take: 3,
    })

    if (!agents.length) return reply.send({ suggestions: [] })

    // Fetch recent tasks per agent (last 5)
    const agentTaskMap = await Promise.all(
      agents.map((a) =>
        prisma.task.findMany({
          where:   { agentId: a.id, status: 'COMPLETE' },
          orderBy: { completedAt: 'desc' },
          take:    5,
          select:  { title: true, rawCommand: true },
        }).then((tasks) => ({ agentId: a.id, tasks }))
      )
    )
    const tasksByAgent = Object.fromEntries(
      agentTaskMap.map((e) => [e.agentId, e.tasks])
    )

    const client = getAnthropicClient(user?.byokKey ?? undefined)
    const suggestions: Suggestion[] = []

    for (const agent of agents) {
      const memories = agent.memories
        .map((m) => `${m.key.replace(/_/g, ' ')}: ${m.value}`)
        .join('\n')

      const recentTasks = tasksByAgent[agent.id] ?? []
      const taskList    = recentTasks.map((t) => `- ${t.title}`).join('\n')

      try {
        const res = await client.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: `You suggest 2 specific, actionable tasks for an AI agent based on what it knows about the user.
Each suggestion must be a command a user would type, personalized using the agent's memories.
Return ONLY JSON: [{"command":"...", "rationale":"one short clause why this is timely"}]
Commands should be concrete (≤12 words). No generic suggestions.`,
          messages: [{
            role:    'user',
            content: [
              `Agent: ${agent.name} (${agent.role})`,
              memories ? `What I know about this user:\n${memories}` : '',
              taskList ? `Recent tasks:\n${taskList}` : 'No completed tasks yet.',
            ].filter(Boolean).join('\n\n'),
          }],
        })

        const text = res.content.filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text).join('')

        const parsed: Array<{ command: string; rationale: string }> = JSON.parse(text)
        for (const s of parsed.slice(0, 2)) {
          suggestions.push({
            agentId:   agent.id,
            agentName: agent.name,
            command:   s.command,
            rationale: s.rationale,
          })
        }
      } catch { /* skip this agent if generation fails */ }
    }

    return reply.send({ suggestions })
  })
}
