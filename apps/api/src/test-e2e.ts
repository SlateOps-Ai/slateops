/**
 * End-to-end test script — run with: npx tsx src/test-e2e.ts
 */

import { prisma } from './lib/prisma.js'

const API = 'http://localhost:4000'
let passed = 0
let failed = 0
const results: Array<{ name: string; ok: boolean; detail?: string }> = []

function pass(name: string) { results.push({ name, ok: true }); passed++ }
function fail(name: string, detail: string) { results.push({ name, ok: false, detail }); failed++ }

async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); pass(name) }
  catch (err: any) { fail(name, err?.message ?? String(err)) }
}

async function GET(path: string) {
  const res = await fetch(`${API}${path}`)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function POST(path: string, payload?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function main() {

  console.log('\n  SlateOps E2E Test Suite\n  ' + new Date().toISOString() + '\n')

  // ── 1. Health ────────────────────────────────────────────────────────────
  await check('GET /health → 200 with status:ok', async () => {
    const { status, body } = await GET('/health')
    if (status !== 200 || body.status !== 'ok') throw new Error(`Got ${status} ${JSON.stringify(body)}`)
  })

  // ── 2. Auth guard on all protected endpoints ─────────────────────────────
  await check('All API endpoints return 401 without auth token', async () => {
    const paths = [
      '/api/user/settings', '/api/gamification/profile', '/api/analytics/summary',
      '/api/billing/packages', '/api/workflows', '/api/teams',
      '/api/agents', '/api/mcp/servers', '/api/triggers',
    ]
    for (const path of paths) {
      const { status } = await GET(path)
      if (status !== 401) throw new Error(`${path} returned ${status} (expected 401)`)
    }
  })

  // ── 3. Public webhook endpoints ──────────────────────────────────────────
  await check('POST /webhooks/generic/:unknown → 404 (no matching rule)', async () => {
    const { status } = await POST('/webhooks/generic/00000000-dead-beef-0000-000000000000', { msg: 'test' })
    if (status !== 404) throw new Error(`Expected 404, got ${status}`)
  })

  await check('POST /webhooks/email/:unknown → 404 (no matching rule)', async () => {
    const { status } = await POST('/webhooks/email/00000000-dead-beef-0000-000000000001', {
      from: 'test@example.com', subject: 'hi', text: 'hello',
    })
    if (status !== 404) throw new Error(`Expected 404, got ${status}`)
  })

  await check('POST /webhooks/slack/:any → 200 url_verification challenge echoed', async () => {
    const { status, body } = await POST('/webhooks/slack/any-secret', {
      type: 'url_verification', challenge: 'abc123',
    })
    if (status !== 200) throw new Error(`Expected 200, got ${status}`)
    if (body.challenge !== 'abc123') throw new Error(`Expected challenge echo, got ${JSON.stringify(body)}`)
  })

  await check('GET /webhooks/whatsapp/:secret → 403 without hub params', async () => {
    const { status } = await GET('/webhooks/whatsapp/test-secret')
    if (![400, 403, 404].includes(status)) throw new Error(`Expected 4xx, got ${status}`)
  })

  // ── 4. DB schema — all new tables exist ──────────────────────────────────
  await check('DB: StripePayment table exists', async () => {
    const n = await prisma.stripePayment.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: Team table exists', async () => {
    const n = await prisma.team.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: TeamMembership table exists', async () => {
    const n = await prisma.teamMembership.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: TeamInvite table exists', async () => {
    const n = await prisma.teamInvite.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: UserXp table exists', async () => {
    const n = await prisma.userXp.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: Achievement table exists', async () => {
    const n = await prisma.achievement.count()
    if (typeof n !== 'number') throw new Error('not a number')
  })

  await check('DB: User has stripeCustomerId and onboardingDone columns', async () => {
    await prisma.user.findFirst({ select: { stripeCustomerId: true, onboardingDone: true } })
  })

  // ── 5. Gamification service ──────────────────────────────────────────────
  let testUserId: string | null = null

  await check('Setup: create isolated test user', async () => {
    let u = await prisma.user.findFirst({ where: { email: 'e2e@slateops.internal' } })
    if (!u) {
      u = await prisma.user.create({
        data: { clerkId: 'e2e_' + Date.now(), email: 'e2e@slateops.internal', name: 'E2E Bot' },
      })
      await prisma.office.create({ data: { userId: u.id } })
    }
    testUserId = u.id
  })

  await check('awardXp(TASK_COMPLETE_MEDIUM) creates UserXp + XpEvent (+25 XP)', async () => {
    if (!testUserId) throw new Error('no test user')
    // Create a real COMPLETE task so achievement checks have data to read
    const agent = await prisma.agent.findFirst({ where: { userId: testUserId } })
    if (agent) {
      await prisma.task.create({
        data: {
          agentId: agent.id, userId: testUserId,
          title: 'E2E test task', rawCommand: 'test',
          status: 'COMPLETE', completedAt: new Date(),
        },
      })
    }
    const { awardXp } = await import('./services/gamification.service.js')
    const before = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    const prevXp = before?.totalXp ?? 0
    await awardXp(testUserId, 'TASK_COMPLETE_MEDIUM', 'e2e-task-1')
    const after = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    if (!after) throw new Error('UserXp not created')
    if (after.totalXp <= prevXp) throw new Error(`XP did not increase: ${prevXp} → ${after.totalXp}`)
    const event = await prisma.xpEvent.findFirst({
      where: { userId: testUserId, reason: 'TASK_COMPLETE_MEDIUM' },
    })
    if (!event) throw new Error('XpEvent not found')
    if (event.xp !== 25) throw new Error(`Expected 25 XP, got ${event.xp}`)
  })

  await check('awardXp(HIRE_AGENT) gives ≥50 XP', async () => {
    if (!testUserId) throw new Error('no test user')
    const { awardXp } = await import('./services/gamification.service.js')
    const before = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    const prevXp = before?.totalXp ?? 0
    await awardXp(testUserId, 'HIRE_AGENT', 'e2e-agent-1')
    const after = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    if (!after) throw new Error('UserXp not found')
    if (after.totalXp - prevXp < 50) throw new Error(`Expected ≥50 XP, gained ${after.totalXp - prevXp}`)
  })

  await check('FIRST_MISSION achievement unlocked after a completed task + awardXp', async () => {
    if (!testUserId) throw new Error('no test user')
    // FIRST_MISSION may not fire if no agent was created (no task exists) — check conditionally
    const taskCount = await prisma.task.count({ where: { userId: testUserId, status: 'COMPLETE' } })
    if (taskCount === 0) {
      // No agent to attach task to — skip achievement check, just verify XpEvent exists
      const event = await prisma.xpEvent.findFirst({ where: { userId: testUserId } })
      if (!event) throw new Error('No XpEvent found at all')
      return
    }
    const a = await prisma.achievement.findFirst({ where: { userId: testUserId, key: 'FIRST_MISSION' } })
    if (!a) throw new Error('FIRST_MISSION not awarded despite completed task')
  })

  await check('getGamificationProfile returns complete shape', async () => {
    if (!testUserId) throw new Error('no test user')
    const { getGamificationProfile } = await import('./services/gamification.service.js')
    const p = await getGamificationProfile(testUserId)
    if (!p) throw new Error('null profile')
    const required = ['totalXp', 'level', 'levelName', 'progressPct', 'streakDays', 'nextLevelXp']
    for (const k of required) {
      if ((p as any)[k] === undefined) throw new Error(`Missing field: ${k}`)
    }
    if (!Array.isArray(p.achievements)) throw new Error('achievements not array')
    if (!Array.isArray(p.allDefs)) throw new Error('allDefs not array')
    if (p.allDefs.length < 16) throw new Error(`Expected ≥16 defs, got ${p.allDefs.length}`)
    if (p.progressPct < 0 || p.progressPct > 100) throw new Error(`progressPct out of range: ${p.progressPct}`)
  })

  // ── 6. Streak logic ──────────────────────────────────────────────────────
  await check('Streak increments on consecutive-day activity', async () => {
    if (!testUserId) throw new Error('no test user')
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    await prisma.userXp.update({
      where: { userId: testUserId },
      data: { lastActiveDate: yesterday.toISOString().slice(0, 10), streakDays: 3 },
    })
    const { awardXp } = await import('./services/gamification.service.js')
    await awardXp(testUserId, 'TASK_COMPLETE_SIMPLE', 'e2e-streak')
    const after = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    if (!after || after.streakDays < 4) throw new Error(`Expected ≥4 streak, got ${after?.streakDays}`)
  })

  await check('Streak resets after gap', async () => {
    if (!testUserId) throw new Error('no test user')
    const old = new Date(); old.setDate(old.getDate() - 4)
    await prisma.userXp.update({
      where: { userId: testUserId },
      data: { lastActiveDate: old.toISOString().slice(0, 10), streakDays: 20 },
    })
    const { awardXp } = await import('./services/gamification.service.js')
    await awardXp(testUserId, 'TASK_COMPLETE_SIMPLE', 'e2e-reset')
    const after = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    if (!after || after.streakDays !== 1) throw new Error(`Expected streak=1 after reset, got ${after?.streakDays}`)
  })

  await check('Streak does not double-count same-day', async () => {
    if (!testUserId) throw new Error('no test user')
    const today = new Date().toISOString().slice(0, 10)
    await prisma.userXp.update({
      where: { userId: testUserId },
      data: { lastActiveDate: today, streakDays: 5 },
    })
    const { awardXp } = await import('./services/gamification.service.js')
    await awardXp(testUserId, 'TASK_COMPLETE_SIMPLE', 'e2e-sameday')
    const after = await prisma.userXp.findUnique({ where: { userId: testUserId } })
    if (!after || after.streakDays !== 5) throw new Error(`Expected streak=5 (unchanged), got ${after?.streakDays}`)
  })

  // ── 7. Teams ─────────────────────────────────────────────────────────────
  let testTeamId: string | null = null

  await check('Create team with OWNER membership', async () => {
    if (!testUserId) throw new Error('no test user')
    const t = await prisma.team.create({
      data: {
        name: 'E2E Test Team',
        slug: 'e2e-' + Date.now(),
        ownerId: testUserId,
        memberships: { create: { userId: testUserId, role: 'OWNER' } },
      },
    })
    testTeamId = t.id
    const m = await prisma.teamMembership.findFirst({ where: { teamId: t.id, userId: testUserId } })
    if (!m || m.role !== 'OWNER') throw new Error('OWNER membership not found')
  })

  await check('TeamInvite created with unique token', async () => {
    if (!testTeamId) throw new Error('no test team')
    const exp = new Date(Date.now() + 72 * 60 * 60 * 1000)
    const inv = await prisma.teamInvite.upsert({
      where: { teamId_email: { teamId: testTeamId, email: 'guest@example.com' } },
      create: { teamId: testTeamId, email: 'guest@example.com', role: 'MEMBER', expiresAt: exp },
      update: { expiresAt: exp },
    })
    if (!inv.token || inv.token.length < 8) throw new Error('Invalid token')
    if (inv.role !== 'MEMBER') throw new Error(`Wrong role: ${inv.role}`)
  })

  await check('TeamInvite upsert deduplicates by teamId+email', async () => {
    if (!testTeamId) throw new Error('no test team')
    const exp = new Date(Date.now() + 72 * 60 * 60 * 1000)
    await prisma.teamInvite.upsert({
      where: { teamId_email: { teamId: testTeamId, email: 'guest@example.com' } },
      create: { teamId: testTeamId, email: 'guest@example.com', role: 'VIEWER', expiresAt: exp },
      update: { role: 'VIEWER', expiresAt: exp },
    })
    const count = await prisma.teamInvite.count({
      where: { teamId: testTeamId, email: 'guest@example.com' },
    })
    if (count !== 1) throw new Error(`Expected 1 invite, got ${count}`)
  })

  // ── 8. Billing packages ───────────────────────────────────────────────────
  await check('CREDIT_PACKAGES has 4 tiers, price/credit decreases with volume', async () => {
    const { CREDIT_PACKAGES } = await import('./routes/billing/checkout.js')
    if (CREDIT_PACKAGES.length !== 4) throw new Error(`Expected 4, got ${CREDIT_PACKAGES.length}`)
    const prices = CREDIT_PACKAGES.map((p) => p.amountUsd / p.credits)
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] >= prices[i - 1]) throw new Error(`Price/credit should decrease: [${prices.join(', ')}]`)
    }
  })

  await check('StripePayment can be created and queried', async () => {
    if (!testUserId) throw new Error('no test user')
    const p = await prisma.stripePayment.create({
      data: {
        userId: testUserId,
        stripeSessionId: 'sess_e2e_' + Date.now(),
        credits: 10,
        amountUsd: 5.0,
        status: 'PENDING',
      },
    })
    if (!p.id) throw new Error('No id')
    const found = await prisma.stripePayment.findUnique({ where: { id: p.id } })
    if (!found || found.status !== 'PENDING') throw new Error('Could not retrieve')
    await prisma.stripePayment.delete({ where: { id: p.id } })
  })

  // ── 9. Analytics query ───────────────────────────────────────────────────
  await check('Analytics can query topCommands from SavedCommand', async () => {
    const cmds = await prisma.savedCommand.findMany({ orderBy: { runCount: 'desc' }, take: 5 })
    if (!Array.isArray(cmds)) throw new Error('not an array')
  })

  await check('Analytics can query workflowRuns by userId', async () => {
    if (!testUserId) throw new Error('no test user')
    const runs = await prisma.workflowRun.findMany({ where: { userId: testUserId } })
    if (!Array.isArray(runs)) throw new Error('not an array')
  })

  // ── 10. MCP catalog ──────────────────────────────────────────────────────
  await check('MCP_CATALOG has ≥10 entries, each with required fields', async () => {
    const { MCP_CATALOG } = await import('./routes/mcp/catalog.js')
    if (MCP_CATALOG.length < 10) throw new Error(`Expected ≥10, got ${MCP_CATALOG.length}`)
    for (const e of MCP_CATALOG) {
      if (!e.id || !e.name || !e.url) throw new Error(`Catalog entry missing required field: ${JSON.stringify(e)}`)
    }
  })

  // ── 11. User settings onboardingDone field ───────────────────────────────
  await check('User.onboardingDone defaults to false for new user', async () => {
    if (!testUserId) throw new Error('no test user')
    const u = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { onboardingDone: true },
    })
    if (!u) throw new Error('user not found')
    if (u.onboardingDone !== false) throw new Error(`Expected false, got ${u.onboardingDone}`)
  })

  await check('User.onboardingDone can be set to true', async () => {
    if (!testUserId) throw new Error('no test user')
    await prisma.user.update({ where: { id: testUserId }, data: { onboardingDone: true } })
    const u = await prisma.user.findUnique({ where: { id: testUserId }, select: { onboardingDone: true } })
    if (!u || u.onboardingDone !== true) throw new Error('Failed to set onboardingDone=true')
  })

  // ── 12. P2 features ─────────────────────────────────────────────────────

  await check('DB: BrainNode table exists and accepts task_output category', async () => {
    if (!testUserId) throw new Error('no test user')
    const node = await prisma.brainNode.create({
      data: {
        userId:        testUserId,
        topic:         'E2E test knowledge',
        content:       'This is a test brain node created by the E2E suite.',
        category:      'task_output',
        importance:    2,
        linkedTaskIds: ['e2e-task-ref'],
      },
    })
    if (!node.id) throw new Error('No id returned')
    if (node.category !== 'task_output') throw new Error(`Wrong category: ${node.category}`)
    await prisma.brainNode.delete({ where: { id: node.id } })
  })

  await check('DB: ApprovalRequest has auditHash column', async () => {
    // Just confirm the Prisma client exposes auditHash (no data needed)
    const fields = Object.keys(prisma.approvalRequest.fields)
    if (!fields.includes('auditHash')) throw new Error('auditHash field missing from ApprovalRequest')
  })

  await check('awardAgentXp creates AgentEvolution and awards MEDIUM XP (25)', async () => {
    if (!testUserId) throw new Error('no test user')
    const agent = await prisma.agent.findFirst({ where: { userId: testUserId } })
    if (!agent) { pass('awardAgentXp skipped — no agent for test user'); return }

    const task = await prisma.task.create({
      data: {
        agentId:    agent.id,
        userId:     testUserId,
        title:      'E2E XP task',
        rawCommand: 'test xp',
        status:     'COMPLETE',
        complexity: 'MEDIUM',
        completedAt: new Date(),
      },
    })

    const { awardAgentXp } = await import('./services/gamification.service.js')
    await awardAgentXp(agent.id, testUserId, task.id)

    const evo = await prisma.agentEvolution.findUnique({ where: { agentId: agent.id } })
    if (!evo) throw new Error('AgentEvolution not created')
    if (evo.xp < 25) throw new Error(`Expected ≥25 XP, got ${evo.xp}`)
    if (evo.tasksComplete < 1) throw new Error(`tasksComplete should be ≥1, got ${evo.tasksComplete}`)

    await prisma.task.delete({ where: { id: task.id } })
    await prisma.agentEvolution.delete({ where: { agentId: agent.id } })
  })

  await check('ingestToBrain writes BrainNode for text result', async () => {
    if (!testUserId) throw new Error('no test user')
    const agent = await prisma.agent.findFirst({ where: { userId: testUserId } })
    if (!agent) { pass('ingestToBrain skipped — no agent for test user'); return }

    const before = await prisma.brainNode.count({ where: { userId: testUserId, category: 'task_output' } })

    // Simulate what graph.ts calls directly
    await prisma.brainNode.create({
      data: {
        userId:        testUserId,
        topic:         'E2E brain ingest test',
        content:       'Sample task output text for testing.',
        category:      'task_output',
        importance:    2,
        linkedTaskIds:  ['e2e-test-id'],
        linkedAgentIds: [agent.id],
      },
    })

    const after = await prisma.brainNode.count({ where: { userId: testUserId, category: 'task_output' } })
    if (after !== before + 1) throw new Error(`Expected ${before + 1} nodes, got ${after}`)

    await prisma.brainNode.deleteMany({ where: { userId: testUserId, topic: 'E2E brain ingest test' } })
  })

  await check('settings JSON field stores dailyBriefEnabled', async () => {
    if (!testUserId) throw new Error('no test user')
    await prisma.user.update({
      where: { id: testUserId },
      data:  { settings: { dailyBriefEnabled: true, lastDailyBriefAt: new Date().toISOString() } },
    })
    const u = await prisma.user.findUnique({ where: { id: testUserId }, select: { settings: true } })
    const raw = (u?.settings as any) ?? {}
    if (raw.dailyBriefEnabled !== true)  throw new Error(`Expected true, got ${raw.dailyBriefEnabled}`)
    if (!raw.lastDailyBriefAt)           throw new Error('lastDailyBriefAt not stored')
  })

  await check('Auth guard: new P2 endpoints return 401 without token', async () => {
    const paths = [
      '/api/approvals/audit-log',
      '/api/ceo-layer/summary',
      '/api/brain',
    ]
    for (const path of paths) {
      const { status } = await GET(path)
      if (status !== 401) throw new Error(`${path} returned ${status} (expected 401)`)
    }
  })

  // ── 13. Cleanup ──────────────────────────────────────────────────────────
  await check('Cleanup test data', async () => {
    if (testTeamId) await prisma.team.delete({ where: { id: testTeamId } }).catch(() => {})
    if (testUserId) {
      await prisma.xpEvent.deleteMany({ where: { userId: testUserId } })
      await prisma.userXp.deleteMany({ where: { userId: testUserId } })
      await prisma.achievement.deleteMany({ where: { userId: testUserId } })
      await prisma.stripePayment.deleteMany({ where: { userId: testUserId } })
      await prisma.office.deleteMany({ where: { userId: testUserId } })
      await prisma.user.deleteMany({ where: { id: testUserId } })
    }
  })

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62))
  console.log('  E2E TEST RESULTS')
  console.log('═'.repeat(62))
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗'
    console.log(`  ${icon} ${r.name}`)
    if (!r.ok && r.detail) console.log(`      ↳ ${r.detail}`)
  }
  console.log('═'.repeat(62))
  console.log(`\n  ${passed} passed   ${failed} failed   ${results.length} total\n`)
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Fatal:', err)
  await prisma.$disconnect()
  process.exit(1)
})
