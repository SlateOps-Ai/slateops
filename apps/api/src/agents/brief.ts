import { prisma } from '../lib/prisma.js'
import { getAnthropicClient } from '../lib/claude.js'
import { sendWeeklyBrief, type BriefData } from '../services/email.service.js'

export async function generateAndSendBriefs(): Promise<void> {
  // Find all users who have at least one active agent
  const users = await prisma.user.findMany({
    where:  { agents: { some: { isActive: true } } },
    include: {
      agents: {
        where:  { isActive: true },
        include: { memories: { orderBy: { updatedAt: 'desc' }, take: 5 } },
      },
    },
  })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const weekOf  = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(weekAgo) + ' – ' +
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date())

  for (const user of users) {
    try {
      await generateBriefForUser(user, weekAgo, weekOf)
    } catch (err) {
      console.error(`Brief failed for user ${user.id}:`, err)
    }
  }
}

async function generateBriefForUser(
  user: Awaited<ReturnType<typeof prisma.user.findMany>>[0],
  since: Date,
  weekOf: string,
): Promise<void> {
  // Aggregate task stats per agent for the week
  const agentStats = await Promise.all(
    user.agents.map(async (agent) => {
      const [tasks, topSaved, scheduleCount] = await Promise.all([
        prisma.task.findMany({
          where:   { agentId: agent.id, status: 'COMPLETE', completedAt: { gte: since } },
          orderBy: { completedAt: 'desc' },
          take:    20,
          select:  { title: true, rawCommand: true, costUsd: true },
        }),
        prisma.savedCommand.findFirst({
          where:   { agentId: agent.id, userId: user.id },
          orderBy: { runCount: 'desc' },
          select:  { title: true, runCount: true },
        }),
        prisma.scheduledRun.count({
          where: { userId: user.id, isActive: true },
        }),
      ])

      return { agent, tasks, topSaved, scheduleCount }
    })
  )

  const totalTasks   = agentStats.reduce((s, a) => s + a.tasks.length, 0)
  const creditsUsed  = await prisma.creditEntry.aggregate({
    where:  { userId: user.id, reason: 'TASK_CONSUMPTION', createdAt: { gte: since } },
    _sum:   { amount: true },
  })
  const activeSchedules = agentStats[0]?.scheduleCount ?? 0

  // Skip brief if the user had zero activity this week
  if (totalTasks === 0) return

  // Generate one recommendation per agent using Claude Haiku
  const client = getAnthropicClient()
  const agentBriefData: BriefData['agents'] = []

  for (const { agent, tasks, topSaved } of agentStats) {
    if (tasks.length === 0) continue

    const memContext = agent.memories.length
      ? `Agent memories: ${agent.memories.map((m) => `${m.key}: ${m.value}`).join('; ')}`
      : ''

    const taskList = tasks.slice(0, 5).map((t) => t.title).join(', ')

    const rec = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system:     'You write one crisp, specific, actionable recommendation (max 20 words) for an AI agent based on its recent work. No preamble. Start with a verb.',
      messages: [{
        role:    'user',
        content: `Agent: ${agent.name} (${agent.role})\nRecent tasks: ${taskList}\n${memContext}\nWhat should this agent do more of next week?`,
      }],
    })

    const recommendation = rec.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    agentBriefData.push({
      name:           agent.name,
      avatarUrl:      agent.avatarUrl,
      tasksCompleted: tasks.length,
      topCommand:     topSaved?.title ?? null,
      recommendation,
    })
  }

  if (agentBriefData.length === 0) return

  await sendWeeklyBrief({
    userName:        user.name,
    userEmail:       user.email,
    weekOf,
    agents:          agentBriefData,
    totalTasks,
    creditsUsed:     Math.abs(creditsUsed._sum.amount ?? 0),
    activeSchedules,
  })

  console.log(`Brief sent to ${user.email} (${totalTasks} tasks, ${agentBriefData.length} agents)`)
}
