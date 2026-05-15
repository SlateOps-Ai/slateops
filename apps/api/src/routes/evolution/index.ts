import fp from 'fastify-plugin'
import { prisma } from '../../lib/prisma.js'

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 6000]
const TITLES = ['Junior', 'Developing', 'Competent', 'Proficient', 'Senior', 'Lead', 'Principal', 'Expert', 'Master', 'Legend']

const SKILL_UNLOCKS: Record<number, string[]> = {
  2: ['Deep Research Mode', 'Multi-step Planning'],
  3: ['Autonomous Follow-up', 'Context Memory Boost'],
  4: ['Parallel Tool Execution', 'Smart Summarisation'],
  5: ['Proactive Alerts', 'Cross-agent Delegation'],
  6: ['Strategy Synthesis', 'Pattern Recognition'],
  7: ['Predictive Suggestions', 'Advanced Analytics'],
  8: ['Autonomous Decision Making', 'Domain Mastery'],
  9: ['Office-wide Intelligence', 'Executive Insight'],
  10: ['Legendary Status', 'Unlimited Autonomy'],
}

function getLevel(xp: number) {
  let level = 1
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break }
  }
  return Math.min(level, 10)
}

export default fp(async (app) => {
  // GET all evolutions for user's agents
  app.get('/api/evolution', async (req: any, reply) => {
    const userId = req.userId
    const evolutions = await prisma.agentEvolution.findMany({
      where: { userId },
      include: { agent: { select: { name: true, role: true, avatarUrl: true, status: true } } },
    })
    return reply.send({ evolutions })
  })

  // GET single agent evolution
  app.get('/api/evolution/:agentId', async (req: any, reply) => {
    const { agentId } = req.params as { agentId: string }
    const userId = req.userId

    let evo = await prisma.agentEvolution.findUnique({ where: { agentId } })
    if (!evo) {
      evo = await prisma.agentEvolution.create({
        data: { agentId, userId, level: 1, xp: 0, title: 'Junior', skills: [], tasksComplete: 0 },
      })
    }

    const nextThreshold = LEVEL_THRESHOLDS[evo.level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
    const prevThreshold = LEVEL_THRESHOLDS[evo.level - 1] ?? 0
    const progressPct = Math.round(((evo.xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100)

    return reply.send({ evolution: { ...evo, progressPct, nextThreshold } })
  })

  // POST award XP to an agent
  app.post('/api/evolution/:agentId/award', async (req: any, reply) => {
    const { agentId } = req.params as { agentId: string }
    const userId = req.userId
    const { xp = 10, reason = 'task_complete' } = req.body as { xp?: number; reason?: string }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } })
    if (!agent) return reply.code(404).send({ error: 'Agent not found' })

    let evo = await prisma.agentEvolution.findUnique({ where: { agentId } })
    if (!evo) {
      evo = await prisma.agentEvolution.create({
        data: { agentId, userId, level: 1, xp: 0, title: 'Junior', skills: [], tasksComplete: 0 },
      })
    }

    const newXp = evo.xp + xp
    const newLevel = getLevel(newXp)
    const leveledUp = newLevel > evo.level
    const newSkills = leveledUp
      ? [...(evo.skills as string[]), ...(SKILL_UNLOCKS[newLevel] ?? [])]
      : evo.skills

    const updated = await prisma.agentEvolution.update({
      where: { agentId },
      data: {
        xp: newXp,
        level: newLevel,
        title: TITLES[newLevel - 1] ?? 'Legend',
        skills: newSkills,
        tasksComplete: { increment: reason === 'task_complete' ? 1 : 0 },
        ...(leveledUp ? { lastLevelUpAt: new Date() } : {}),
      },
    })

    return reply.send({ evolution: updated, leveledUp, newSkills: leveledUp ? SKILL_UNLOCKS[newLevel] : [] })
  })
})
