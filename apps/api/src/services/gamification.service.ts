import { prisma } from '../lib/prisma.js'

// ── XP economy ────────────────────────────────────────────────────────────────

export const XP_REASONS = {
  TASK_COMPLETE_SIMPLE:  { xp: 10,  label: 'Simple task complete' },
  TASK_COMPLETE_MEDIUM:  { xp: 25,  label: 'Task complete' },
  TASK_COMPLETE_COMPLEX: { xp: 60,  label: 'Complex task complete' },
  DAILY_FIRST_TASK:      { xp: 15,  label: 'First task of the day' },
  STREAK_BONUS:          { xp: 10,  label: 'Daily streak' },
  RATE_TASK_POSITIVE:    { xp: 5,   label: 'Gave feedback' },
  ADD_KNOWLEDGE:         { xp: 10,  label: 'Added knowledge' },
  HIRE_AGENT:            { xp: 50,  label: 'Hired an agent' },
  CONNECT_MCP:           { xp: 30,  label: 'Connected MCP server' },
  CREATE_TRIGGER:        { xp: 30,  label: 'Created trigger rule' },
  CREATE_WORKFLOW:       { xp: 40,  label: 'Built a workflow' },
  RUN_WORKFLOW:          { xp: 20,  label: 'Ran a workflow' },
} as const

export type XpReason = keyof typeof XP_REASONS

// ── Level table ───────────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1, name: 'Solo Operator',      minXp: 0     },
  { level: 2, name: 'Team Lead',          minXp: 200   },
  { level: 3, name: 'Department Head',    minXp: 600   },
  { level: 4, name: 'Operations Director', minXp: 1500 },
  { level: 5, name: 'Chief of Staff',     minXp: 3500  },
  { level: 6, name: 'Executive',          minXp: 7500  },
  { level: 7, name: 'Agency Builder',     minXp: 15000 },
]

export function computeLevel(totalXp: number) {
  let current = LEVELS[0]
  for (const l of LEVELS) {
    if (totalXp >= l.minXp) current = l
    else break
  }
  const next = LEVELS.find((l) => l.minXp > totalXp)
  return {
    level:           current.level,
    levelName:       current.name,
    currentLevelXp:  current.minXp,
    nextLevelXp:     next?.minXp ?? null,
    progressPct:     next
      ? Math.round(((totalXp - current.minXp) / (next.minXp - current.minXp)) * 100)
      : 100,
  }
}

// ── Achievement catalogue ─────────────────────────────────────────────────────

interface AchievementDef {
  key:   string
  name:  string
  emoji: string
  desc:  string
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: 'FIRST_MISSION',      name: 'First Mission',       emoji: '🎯', desc: 'Complete your first task' },
  { key: 'ON_A_ROLL',          name: 'On a Roll',           emoji: '📈', desc: 'Complete 10 tasks' },
  { key: 'CENTURION',          name: 'Centurion',           emoji: '💯', desc: 'Complete 100 tasks' },
  { key: 'COMPLEXITY_KING',    name: 'Complexity King',     emoji: '🧠', desc: 'Complete a complex task' },
  { key: 'FEEDBACK_LOOP',      name: 'Feedback Loop',       emoji: '👍', desc: 'Rate 5 tasks' },
  { key: 'KNOWLEDGE_BUILDER',  name: 'Knowledge Builder',   emoji: '📚', desc: 'Add first knowledge item' },
  { key: 'TEAM_BUILDER',       name: 'Team Builder',        emoji: '🏢', desc: 'Hire 3 agents' },
  { key: 'FULL_ROSTER',        name: 'Full Roster',         emoji: '👥', desc: 'Hire 5 agents' },
  { key: 'PLUGGED_IN',         name: 'Plugged In',          emoji: '🔌', desc: 'Connect your first MCP server' },
  { key: 'WELL_CONNECTED',     name: 'Well Connected',      emoji: '🔗', desc: 'Connect 5 MCP servers' },
  { key: 'TRIGGER_HAPPY',      name: 'Trigger Happy',       emoji: '⚡', desc: 'Create your first trigger rule' },
  { key: 'AUTOMATION_EXPERT',  name: 'Automation Expert',   emoji: '🤖', desc: 'Create 5 trigger rules' },
  { key: 'WORKFLOW_ARCHITECT', name: 'Workflow Architect',  emoji: '🗺️', desc: 'Build your first workflow' },
  { key: 'STREAK_STARTER',     name: 'Streak Starter',      emoji: '🔥', desc: 'Maintain a 3-day streak' },
  { key: 'ON_FIRE',            name: 'On Fire',             emoji: '🔥🔥', desc: 'Maintain a 7-day streak' },
  { key: 'UNSTOPPABLE',        name: 'Unstoppable',         emoji: '⚡🔥', desc: 'Maintain a 30-day streak' },
]

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENT_DEFS.map((a) => [a.key, a]))

// ── Achievement condition checker ─────────────────────────────────────────────

async function checkAchievements(
  userId: string,
  reason: XpReason,
  existingKeys: Set<string>,
): Promise<AchievementDef[]> {
  const candidates: string[] = []

  if (reason.startsWith('TASK_COMPLETE')) {
    const counts = await prisma.task.aggregate({
      where:  { userId, status: 'COMPLETE' },
      _count: { id: true },
    })
    const total = counts._count.id
    if (total >= 1)   candidates.push('FIRST_MISSION')
    if (total >= 10)  candidates.push('ON_A_ROLL')
    if (total >= 100) candidates.push('CENTURION')
    if (reason === 'TASK_COMPLETE_COMPLEX') candidates.push('COMPLEXITY_KING')
  }

  if (reason === 'RATE_TASK_POSITIVE') {
    const rated = await prisma.task.count({ where: { userId, userRating: 'POSITIVE' } })
    if (rated >= 5) candidates.push('FEEDBACK_LOOP')
  }

  if (reason === 'ADD_KNOWLEDGE') {
    const kCount = await prisma.agentKnowledge.count({
      where: { agent: { userId } },
    })
    if (kCount >= 1) candidates.push('KNOWLEDGE_BUILDER')
  }

  if (reason === 'HIRE_AGENT') {
    const agentCount = await prisma.agent.count({ where: { userId, isActive: true } })
    if (agentCount >= 3) candidates.push('TEAM_BUILDER')
    if (agentCount >= 5) candidates.push('FULL_ROSTER')
  }

  if (reason === 'CONNECT_MCP') {
    const mcpCount = await prisma.mcpServer.count({ where: { userId } })
    if (mcpCount >= 1) candidates.push('PLUGGED_IN')
    if (mcpCount >= 5) candidates.push('WELL_CONNECTED')
  }

  if (reason === 'CREATE_TRIGGER') {
    const tCount = await prisma.triggerRule.count({ where: { userId } })
    if (tCount >= 1) candidates.push('TRIGGER_HAPPY')
    if (tCount >= 5) candidates.push('AUTOMATION_EXPERT')
  }

  if (reason === 'CREATE_WORKFLOW') {
    const wCount = await prisma.workflow.count({ where: { userId } })
    if (wCount >= 1) candidates.push('WORKFLOW_ARCHITECT')
  }

  if (reason === 'STREAK_BONUS') {
    const profile = await prisma.userXp.findUnique({ where: { userId }, select: { streakDays: true } })
    const streak  = profile?.streakDays ?? 0
    if (streak >= 3)  candidates.push('STREAK_STARTER')
    if (streak >= 7)  candidates.push('ON_FIRE')
    if (streak >= 30) candidates.push('UNSTOPPABLE')
  }

  // Filter to only newly earned ones
  const newKeys = candidates.filter((k) => !existingKeys.has(k))
  if (!newKeys.length) return []

  // Persist
  await prisma.achievement.createMany({
    data:         newKeys.map((key) => ({ userId, key })),
    skipDuplicates: true,
  })

  return newKeys.map((k) => ACHIEVEMENT_MAP.get(k)!).filter(Boolean)
}

// ── Streak logic ──────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Core award function ───────────────────────────────────────────────────────

export interface AwardResult {
  xpAwarded:       number
  totalXp:         number
  level:           number
  levelName:       string
  nextLevelXp:     number | null
  progressPct:     number
  newAchievements: AchievementDef[]
  levelled:        boolean
}

export async function awardXp(
  userId:  string,
  reason:  XpReason,
  refId?:  string,
): Promise<AwardResult> {
  const { xp, label } = XP_REASONS[reason]
  const today         = todayKey()
  const yesterday     = yesterdayKey()

  // Get or create XP profile (upsert)
  let profile = await prisma.userXp.upsert({
    where:  { userId },
    create: { userId },
    update: {},
  })

  const prevLevel = profile.level

  // ── Streak update ─────────────────────────────────────────────────────────
  let extraXp      = 0
  let extraReasons: Array<{ reason: XpReason; xp: number; label: string }> = []

  // First task of the day bonus
  if (reason.startsWith('TASK_COMPLETE') && profile.lastActiveDate !== today) {
    extraXp += XP_REASONS.DAILY_FIRST_TASK.xp
    extraReasons.push({ reason: 'DAILY_FIRST_TASK', xp: XP_REASONS.DAILY_FIRST_TASK.xp, label: XP_REASONS.DAILY_FIRST_TASK.label })
  }

  // Streak tracking
  let newStreakDays = profile.streakDays
  if (reason.startsWith('TASK_COMPLETE')) {
    if (profile.lastActiveDate === today) {
      // Already active today — streak unchanged
    } else if (profile.lastActiveDate === yesterday) {
      // Continued streak
      newStreakDays = profile.streakDays + 1
      extraXp += XP_REASONS.STREAK_BONUS.xp
      extraReasons.push({ reason: 'STREAK_BONUS', xp: XP_REASONS.STREAK_BONUS.xp, label: XP_REASONS.STREAK_BONUS.label })
    } else if (!profile.lastActiveDate || profile.lastActiveDate < yesterday) {
      // Streak broken — reset to 1
      newStreakDays = 1
    }
  }

  const totalAwarded = xp + extraXp
  const newTotal     = profile.totalXp + totalAwarded
  const { level: newLevel, levelName, nextLevelXp, progressPct } = computeLevel(newTotal)

  // ── Persist XP profile update ─────────────────────────────────────────────
  profile = await prisma.userXp.update({
    where: { userId },
    data: {
      totalXp:       newTotal,
      level:         newLevel,
      streakDays:    newStreakDays,
      lastActiveDate: reason.startsWith('TASK_COMPLETE') ? today : profile.lastActiveDate,
    },
  })

  // ── Log XP events (main + bonuses) ───────────────────────────────────────
  const xpEventData = [
    { userId, userXpId: profile.id, xp, reason, label, refId: refId ?? null },
    ...extraReasons.map((e) => ({ userId, userXpId: profile.id, xp: e.xp, reason: e.reason, label: e.label, refId: null as string | null })),
  ]
  await prisma.xpEvent.createMany({ data: xpEventData })

  // ── Achievement checks ────────────────────────────────────────────────────
  const existingAchievements = await prisma.achievement.findMany({
    where:  { userId },
    select: { key: true },
  })
  const existingKeys = new Set(existingAchievements.map((a) => a.key))

  const newAchievements = await checkAchievements(userId, reason, existingKeys)

  // Also check streak achievements if streak changed
  if (extraReasons.some((e) => e.reason === 'STREAK_BONUS')) {
    const streakAchievements = await checkAchievements(userId, 'STREAK_BONUS', new Set([
      ...existingKeys,
      ...newAchievements.map((a) => a.key),
    ]))
    newAchievements.push(...streakAchievements)
  }

  // ── Emit socket notification ──────────────────────────────────────────────
  const result: AwardResult = {
    xpAwarded:       totalAwarded,
    totalXp:         newTotal,
    level:           newLevel,
    levelName,
    nextLevelXp,
    progressPct,
    newAchievements,
    levelled:        newLevel > prevLevel,
  }

  // Fire-and-forget socket emit
  emitGamificationUpdate(userId, result).catch(() => {})

  return result
}

async function emitGamificationUpdate(userId: string, result: AwardResult): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { clerkId: true } })
    if (!user) return
    const { emitToUser } = await import('./events.service.js')
    emitToUser(`user:${user.clerkId}`, 'gamification:update', result)
  } catch { /* non-fatal */ }
}

// ── Agent Evolution ───────────────────────────────────────────────────────────

const AGENT_LEVELS = [
  { level: 1, title: 'Junior',    minXp: 0    },
  { level: 2, title: 'Associate', minXp: 100  },
  { level: 3, title: 'Senior',    minXp: 300  },
  { level: 4, title: 'Lead',      minXp: 750  },
  { level: 5, title: 'Expert',    minXp: 1500 },
  { level: 6, title: 'Principal', minXp: 3000 },
]

const COMPLEXITY_XP: Record<string, number> = { SIMPLE: 10, MEDIUM: 25, COMPLEX: 50 }

function computeAgentLevel(xp: number): { level: number; title: string } {
  let current = AGENT_LEVELS[0]
  for (const l of AGENT_LEVELS) {
    if (xp >= l.minXp) current = l
    else break
  }
  return current
}

export async function awardAgentXp(
  agentId: string,
  userId:  string,
  taskId:  string,
): Promise<void> {
  try {
    const task   = await prisma.task.findUnique({ where: { id: taskId }, select: { complexity: true } })
    const xpGain = COMPLEXITY_XP[task?.complexity ?? 'MEDIUM'] ?? 25

    const current  = await prisma.agentEvolution.findUnique({ where: { agentId } })
    const prevXp   = current?.xp ?? 0
    const newXp    = prevXp + xpGain
    const prevLevel = computeAgentLevel(prevXp).level
    const { level, title } = computeAgentLevel(newXp)
    const levelled = level !== prevLevel

    await prisma.agentEvolution.upsert({
      where:  { agentId },
      create: { agentId, userId, xp: newXp, level, title, tasksComplete: 1, lastLevelUpAt: levelled ? new Date() : null },
      update: {
        xp:            newXp,
        level,
        title,
        tasksComplete: { increment: 1 },
        ...(levelled ? { lastLevelUpAt: new Date() } : {}),
      },
    })

    if (levelled) {
      const agent = await prisma.agent.findUnique({
        where:  { id: agentId },
        select: { name: true, user: { select: { clerkId: true } } },
      })
      if (agent?.user?.clerkId) {
        const { emitToUser } = await import('./events.service.js')
        emitToUser(`user:${agent.user.clerkId}`, 'agent:evolution', { agentId, agentName: agent.name, level, title, xp: newXp })
      }
    }
  } catch { /* non-fatal */ }
}

// ── Profile fetch ─────────────────────────────────────────────────────────────

export async function getGamificationProfile(userId: string) {
  const [profile, achievements, recentEvents] = await Promise.all([
    prisma.userXp.findUnique({ where: { userId } }),
    prisma.achievement.findMany({ where: { userId }, orderBy: { unlockedAt: 'desc' } }),
    prisma.xpEvent.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { xp: true, reason: true, label: true, createdAt: true },
    }),
  ])

  const totalXp = profile?.totalXp ?? 0
  const { level, levelName, nextLevelXp, progressPct, currentLevelXp } = computeLevel(totalXp)

  return {
    totalXp,
    level,
    levelName,
    currentLevelXp,
    nextLevelXp,
    progressPct,
    streakDays:   profile?.streakDays ?? 0,
    achievements: achievements.map((a) => ({
      key:        a.key,
      unlockedAt: a.unlockedAt,
      ...ACHIEVEMENT_MAP.get(a.key),
    })),
    recentEvents,
    allDefs: ACHIEVEMENT_DEFS,
  }
}
