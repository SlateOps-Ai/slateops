import { prisma } from '../lib/prisma.js'

export interface NormalisedEvent {
  sender?:  string   // phone, email address, Slack username, GitHub actor
  subject?: string   // email subject, GitHub event type
  channel?: string   // Slack channel, GitHub repo
  body:     string   // main text content
  raw:      unknown  // full original payload
}

// ── Filter evaluation ──────────────────────────────────────────────────────────

function matchesFilter(
  filterField: string | null,
  filterOp:    string | null,
  filterValue: string | null,
  event:       NormalisedEvent,
): boolean {
  if (!filterField || !filterOp || filterOp === 'any') return true

  const candidate = (() => {
    switch (filterField) {
      case 'from':    return event.sender  ?? ''
      case 'subject': return event.subject ?? ''
      case 'body':    return event.body
      case 'channel': return event.channel ?? ''
      default:        return ''
    }
  })().toLowerCase()

  const val = (filterValue ?? '').toLowerCase()

  switch (filterOp) {
    case 'contains':    return candidate.includes(val)
    case 'equals':      return candidate === val
    case 'startsWith':  return candidate.startsWith(val)
    case 'endsWith':    return candidate.endsWith(val)
    default:            return true
  }
}

// ── Prompt template substitution ──────────────────────────────────────────────

function buildPrompt(template: string, event: NormalisedEvent): string {
  return template
    .replace(/\{sender\}/g,  event.sender  ?? 'unknown')
    .replace(/\{subject\}/g, event.subject ?? '')
    .replace(/\{channel\}/g, event.channel ?? '')
    .replace(/\{body\}/g,    event.body)
}

// ── Task title derivation ──────────────────────────────────────────────────────

function deriveTitle(provider: string, event: NormalisedEvent): string {
  switch (provider) {
    case 'WHATSAPP': return `WhatsApp from ${event.sender ?? 'unknown'}`
    case 'EMAIL':    return event.subject ? `Email: ${event.subject}` : `Email from ${event.sender ?? 'unknown'}`
    case 'SLACK':    return `Slack message in ${event.channel ?? 'unknown'}`
    case 'GITHUB':   return `GitHub: ${event.subject ?? 'event'} on ${event.channel ?? 'repo'}`
    case 'GENERIC':  return `Inbound trigger`
    default:         return `Inbound event`
  }
}

// ── Core processor ────────────────────────────────────────────────────────────

export async function processInboundTrigger(
  webhookSecret: string,
  event: NormalisedEvent,
): Promise<{ matched: boolean; taskId?: string; error?: string }> {
  const rule = await prisma.triggerRule.findUnique({
    where:   { webhookSecret },
    include: { user: true, agent: true },
  })

  if (!rule) return { matched: false, error: 'Rule not found' }
  if (!rule.isActive) return { matched: false, error: 'Rule inactive' }

  const passes = matchesFilter(rule.filterField, rule.filterOp, rule.filterValue, event)

  // Always log the event — matched flag reflects filter result
  const senderInfo = [event.sender, event.subject].filter(Boolean).join(' · ')

  if (!passes) {
    await prisma.inboundEvent.create({
      data: {
        ruleId:     rule.id,
        provider:   rule.provider,
        senderInfo: senderInfo || null,
        summary:    event.body.slice(0, 160),
        matched:    false,
        rawPayload: event.raw as any,
      },
    })
    return { matched: false }
  }

  const user  = rule.user
  const agent = rule.agent

  // Credit / BYOK gate
  if (user.creditsRemaining <= 0 && !user.byokKey) {
    await prisma.inboundEvent.create({
      data: {
        ruleId:     rule.id,
        provider:   rule.provider,
        senderInfo: senderInfo || null,
        summary:    'Skipped — no credits',
        matched:    true,
        rawPayload: event.raw as any,
      },
    })
    return { matched: true, error: 'No credits remaining' }
  }

  const rawCommand = buildPrompt(rule.promptTemplate, event)
  const title      = deriveTitle(rule.provider, event)

  // Create the task
  const task = await prisma.task.create({
    data: {
      agentId:    agent.id,
      userId:     user.id,
      title,
      rawCommand,
      status:     'PENDING',
      complexity: 'MEDIUM',
    },
  })

  // Log the inbound event with taskId
  await prisma.inboundEvent.create({
    data: {
      ruleId:     rule.id,
      taskId:     task.id,
      provider:   rule.provider,
      senderInfo: senderInfo || null,
      summary:    event.body.slice(0, 160),
      matched:    true,
      rawPayload: event.raw as any,
    },
  })

  // Update rule stats
  await prisma.triggerRule.update({
    where: { id: rule.id },
    data:  { fireCount: { increment: 1 }, lastFiredAt: new Date() },
  })

  // Emit TASK_ASSIGNED and start agent — fire-and-forget
  const { emitEvent }   = await import('./events.service.js')
  const { makeExecutor } = await import('../lib/composio.js')
  const { startAgentTask } = await import('../agents/graph.js')

  await Promise.all([
    prisma.task.update({
      where: { id: task.id },
      data:  { status: 'IN_PROGRESS', startedAt: new Date(), langGraphThread: task.id },
    }),
    prisma.agent.update({ where: { id: agent.id }, data: { status: 'WORKING' } }),
    emitEvent(agent.id, {
      type:    'TASK_ASSIGNED',
      taskId:  task.id,
      agentId: agent.id,
      payload: { thoughtBubble: 'Got an inbound message, on it!' },
    }),
  ])

  startAgentTask({
    taskId:      task.id,
    agentId:     agent.id,
    agent:       agent as any,
    rawCommand,
    taskTitle:   title,
    byokKey:     user.byokKey ?? undefined,
    executeTool: makeExecutor(user.id),
  }).catch(async (err) => {
    console.error('Trigger task error:', err)
    await prisma.task.update({ where: { id: task.id }, data: { status: 'FAILED' } })
  }).finally(async () => {
    await prisma.agent.update({ where: { id: agent.id }, data: { status: 'IDLE' } })
  })

  return { matched: true, taskId: task.id }
}
