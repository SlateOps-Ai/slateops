import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { getAnthropicClient } from '../../lib/claude.js'

interface Suggestion {
  agentId:   string
  agentName: string
  command:   string
  rationale: string
}

async function buildAgentSuggestions(
  agentId: string,
  userId:  string,
  count:   number,
  byokKey: string | null,
): Promise<Array<{ command: string; rationale: string }>> {
  const agent = await prisma.agent.findFirst({
    where:   { id: agentId, userId, isActive: true },
    include: { memories: { orderBy: { updatedAt: 'desc' }, take: 20 } },
  })
  if (!agent) return []

  const recentTasks = await prisma.task.findMany({
    where:   { agentId, status: 'COMPLETE' },
    orderBy: { completedAt: 'desc' },
    take:    10,
    select:  { title: true, rawCommand: true },
  })

  const memories  = agent.memories.map((m) => `${m.key.replace(/_/g, ' ')}: ${m.value}`).join('\n')
  const taskList  = recentTasks.map((t) => `- ${t.rawCommand ?? t.title}`).join('\n')
  const client    = getAnthropicClient(byokKey ?? undefined)

  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `You suggest specific, actionable tasks for an AI agent based on its role and what it knows about the user.
Each suggestion must be a ready-to-send command the user would type — personalized using the agent's role, memories, and task history.
Vary the suggestions: mix quick requests, deeper analyses, and creative tasks relevant to the agent's speciality.
Return ONLY a JSON array of exactly ${count} objects: [{"command":"...","rationale":"brief clause why this is useful"}]
Commands must be ≤15 words. No generic filler.`,
    messages: [{
      role:    'user',
      content: [
        `Agent: ${agent.name} (${agent.role.replace(/_/g, ' ').toLowerCase()})`,
        memories  ? `Context about this user:\n${memories}` : '',
        taskList  ? `Recent tasks handled:\n${taskList}`   : 'No completed tasks yet — suggest good starting points.',
      ].filter(Boolean).join('\n\n'),
    }],
  })

  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return JSON.parse(stripped)
}

export default async function suggestionsRoute(app: FastifyInstance) {

  // GET /api/agents/:id/suggestions — 5 prompts for a single agent (used in chat drawer)
  app.get('/api/agents/:id/suggestions', async (req, reply) => {
    const { id }  = req.params as { id: string }
    const userId  = req.dbUserId
    const { count = '5' } = req.query as { count?: string }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { byokKey: true } })

    try {
      const suggestions = await buildAgentSuggestions(id, userId, Math.min(Number(count), 8), user?.byokKey ?? null)
      return reply.send({ suggestions: suggestions.map((s) => ({ ...s, agentId: id })) })
    } catch {
      return reply.send({ suggestions: [] })
    }
  })

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
