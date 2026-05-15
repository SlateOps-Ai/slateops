import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import pg from 'pg'
import type { Agent } from '@prisma/client'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { prisma } from '../lib/prisma.js'
import { emitEvent } from '../services/events.service.js'
import { executeStepNode } from './nodes/execute-step.js'
import { needsApprovalNode } from './nodes/needs-approval.js'
import { scoreConfidence } from '../lib/confidence.js'
import { writeAudit } from '../lib/audit.js'
import { registerExecutor, unregisterExecutor } from './executor-registry.js'

// ── State Schema ───────────────────────────────────────────────────────────

export const AgentGraphAnnotation = Annotation.Root({
  // Identity
  taskId:   Annotation<string>(),
  agentId:  Annotation<string>(),
  agent:    Annotation<Agent>(),
  byokKey:  Annotation<string | undefined>(),

  // Task
  rawCommand:   Annotation<string>(),
  taskTitle:    Annotation<string>(),
  steps:        Annotation<TaskStep[]>(),
  currentStepIndex: Annotation<number>({ default: () => 0, reducer: (_, b) => b }),

  // Execution state
  messageHistory: Annotation<MessageParam[]>({
    default:  () => [],
    reducer:  (_, b) => b,
  }),
  stepOutputs: Annotation<Array<{ step: string; output: string }>>({
    default:  () => [],
    reducer:  (a, b) => a.concat(b),
  }),
  tokensUsed: Annotation<number>({ default: () => 0, reducer: (a, b) => a + b }),
  costUsd:    Annotation<number>({ default: () => 0, reducer: (a, b) => a + b }),

  // Approval gate
  pendingApprovalTool:  Annotation<PendingTool | null>({ default: () => null, reducer: (_, b) => b }),
  waitingForApproval:   Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
  approvalDecision:     Annotation<'APPROVED' | 'EDITED' | 'CANCELLED' | null>({
    default: () => null, reducer: (_, b) => b,
  }),
  approvalEdit: Annotation<unknown>({ default: () => null, reducer: (_, b) => b }),

  // Output
  finalResult: Annotation<FinalResult | null>({ default: () => null, reducer: (_, b) => b }),
  error:       Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),

  // When true (workflow mode) skip the human-in-the-loop approval gate for destructive tools
  skipApproval: Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
})

export type AgentGraphState = typeof AgentGraphAnnotation.State

interface TaskStep {
  name:        string
  description: string
  instruction: string
}

interface PendingTool {
  name:      string
  input:     unknown
  toolUseId: string
}

interface FinalResult {
  type:    string
  title:   string
  content: unknown
}

// ── Post-task helpers ──────────────────────────────────────────────────────

async function extractAndSaveMemories(
  agentId: string,
  taskId:  string,
  rawCommand: string,
  stepOutputs: Array<{ step: string; output: string }>,
  byokKey?: string,
  userId?: string,
): Promise<void> {
  try {
    const { getAnthropicClient } = await import('../lib/claude.js')
    const { callAnthropic }      = await import('../lib/llm-usage.js')
    const client = getAnthropicClient(byokKey)

    const callParams = {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Extract 0-4 memorable facts about the user's working context, preferences, or style
from this completed task. Only extract facts useful for future tasks (tone preferences, industry, brand voice, recurring patterns, key contacts, domain-specific terms).
Return ONLY JSON: {"memories":[{"key":"snake_case_name","value":"concise fact","confidence":0.85}]}
Keys ≤40 chars, values ≤200 chars. confidence 0–1 (how certain you are this fact is useful and accurate).
Return {"memories":[]} if nothing meaningful.`,
      messages: [{
        role:    'user' as const,
        content: `Task: ${rawCommand}\n\nOutputs:\n${stepOutputs.map((s) => s.output).join('\n\n').slice(0, 2000)}`,
      }],
    }
    const response = userId
      ? await callAnthropic(client, callParams, { userId, agentId, endpoint: 'agents/graph:extractMemories', byok: !!byokKey })
      : await client.messages.create(callParams)

    const text = (response.content as any[])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as { text: string }).text)
      .join('')

    const { memories } = JSON.parse(text)
    for (const mem of (memories as Array<{ key: string; value: string; confidence?: number }>)) {
      if (!mem.key || !mem.value) continue
      await prisma.agentMemory.upsert({
        where:  { agentId_key: { agentId, key: mem.key } },
        create: {
          agentId,
          key:        mem.key,
          value:      mem.value,
          source:     'AUTO',
          taskId,
          confidence: mem.confidence ?? null,
        },
        update: {
          value:      mem.value,
          source:     'AUTO',
          taskId,
          confidence: mem.confidence ?? null,
        },
      })
    }
  } catch { /* non-fatal */ }
}

async function ingestToBrain(
  userId:    string,
  agentId:   string,
  taskId:    string,
  taskTitle: string,
  result:    FinalResult,
): Promise<void> {
  try {
    if (result.type !== 'text' && result.type !== 'document') return
    const content = typeof result.content === 'string'
      ? result.content.slice(0, 3000)
      : JSON.stringify(result.content).slice(0, 3000)
    if (!content.trim()) return
    await prisma.brainNode.create({
      data: {
        userId,
        topic:          taskTitle,
        content,
        category:       'task_output',
        importance:     2,
        linkedTaskIds:  [taskId],
        linkedAgentIds: [agentId],
      },
    })
  } catch { /* non-fatal */ }
}

async function sendTaskCompleteEmail(
  agentId: string,
  userId: string,
  result: FinalResult,
  taskTitle: string,
): Promise<void> {
  try {
    const [agent, user] = await Promise.all([
      prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, avatarUrl: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
    ])
    if (!agent || !user || user.email.endsWith('@clerk')) return

    const { sendTaskComplete } = await import('../services/email.service.js')
    const summary = typeof result.content === 'string'
      ? result.content.slice(0, 600)
      : JSON.stringify(result.content).slice(0, 600)

    await sendTaskComplete({
      agentName:      agent.name,
      agentAvatarUrl: agent.avatarUrl ?? '',
      userName:       user.name,
      userEmail:      user.email,
      taskTitle,
      resultSummary:  summary,
      officeUrl:      `${process.env.WEB_URL ?? 'https://slateops.tech'}/office`,
    })
  } catch { /* non-fatal */ }
}

// ── Nodes ─────────────────────────────────────────────────────────────────

async function planStepsNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const fallback: TaskStep[] = [{ name: 'execute', description: state.rawCommand, instruction: state.rawCommand }]

  try {
    const { getAnthropicClient } = await import('../lib/claude.js')
    const { callAnthropic }      = await import('../lib/llm-usage.js')
    const client = getAnthropicClient(state.byokKey)

    const response = await callAnthropic(client, {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     `You are a task planner. Break the command into 2-4 concrete sequential steps.
Return ONLY a JSON array: [{"name":"string","description":"string","instruction":"string"}]
"instruction" is the exact prompt that will be sent to an LLM to complete that step.
Keep steps specific and actionable.`,
      messages: [{ role: 'user', content: state.rawCommand }],
    }, { userId: state.agent.userId, agentId: state.agentId, endpoint: 'agents/graph:planSteps', byok: !!state.byokKey })

    const text = (response.content as any[])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as { text: string }).text)
      .join('')

    let steps: TaskStep[] = []
    try { steps = JSON.parse(text) } catch { steps = fallback }

    return { steps: steps.length ? steps : fallback, currentStepIndex: 0 }
  } catch {
    return { steps: fallback, currentStepIndex: 0 }
  }
}

async function compileResultNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const stepsText = state.stepOutputs
    .map((s, i) => `Step ${i + 1} (${s.step}):\n${s.output}`)
    .join('\n\n')

  // Fallback result used when the Claude compile call fails or all steps soft-failed
  let result: FinalResult = {
    type:    'text',
    title:   state.taskTitle,
    content: stepsText || 'Task completed.',
  }

  const hasRealOutputs = state.stepOutputs.some(
    (s) => s.output && !s.output.startsWith('Unable to complete step')
  )

  if (hasRealOutputs) {
    try {
      const { getAnthropicClient } = await import('../lib/claude.js')
      const client = getAnthropicClient(state.byokKey)

      // Detect if the user requested a specific file format
      const cmdLower = state.rawCommand.toLowerCase()
      const formatKeywords: Array<[string[], string]> = [
        [['word document', 'word doc', '.docx', 'docx'],        'docx'],
        [['excel', 'spreadsheet', '.xlsx', 'xlsx'],              'xlsx'],
        [['pdf', '.pdf'],                                        'pdf'],
        [['csv', '.csv', 'comma-separated'],                     'csv'],
        [['text file', '.txt', 'plain text file'],               'txt'],
      ]
      let detectedFormat: string | null = null
      for (const [kws, fmt] of formatKeywords) {
        if (kws.some((kw) => cmdLower.includes(kw))) { detectedFormat = fmt; break }
      }

      const formatInstruction = detectedFormat === 'xlsx' || detectedFormat === 'csv'
        ? `The user requested a ${detectedFormat.toUpperCase()} file. Structure content as valid CSV text: first line is headers, following lines are data rows. Use commas as delimiters. Quote fields that contain commas.`
        : detectedFormat
        ? `The user requested a ${detectedFormat.toUpperCase()} file. Produce clean, well-structured plain text or markdown content — it will be converted to ${detectedFormat.toUpperCase()} automatically.`
        : ''

      const { callAnthropic } = await import('../lib/llm-usage.js')
      const response = await callAnthropic(client, {
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: `You compile step outputs into a single polished result. Choose the most appropriate type:

- "email_draft": when the result is an email to send. content = { "to": string, "subject": string, "body": string }
- "calendar_event": when creating a meeting/event. content = { "title": string, "start": string, "end": string, "location": string }
- "list": when the result is a set of items/findings. content = ["item 1", "item 2", ...]
- "document": when the result is a report, analysis, or long-form content. content = "full text"
- "text": for short answers or summaries. content = "text"

${formatInstruction ? formatInstruction + '\n\n' : ''}Return ONLY valid JSON: {"type":"<type>","title":"<concise title>","content":<content matching the schema above>${detectedFormat ? `,"format":"${detectedFormat}"` : ''}}`,
        messages: [{
          role:    'user',
          content: `Original command: ${state.rawCommand}\n\nStep outputs:\n${stepsText}`,
        }],
      }, { userId: state.agent.userId, agentId: state.agentId, endpoint: 'agents/graph:compileResult', byok: !!state.byokKey })

      const text = (response.content as any[])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => (b as { text: string }).text)
        .join('')

      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      try {
        const parsed: FinalResult = JSON.parse(stripped)
        if (parsed.content && typeof parsed.content === 'object' && 'content' in (parsed.content as object)) {
          parsed.content = (parsed.content as any).content
        }
        result = parsed
      } catch { /* use text fallback */ }
    } catch { /* compile call failed — use raw step text as result */ }
  }

  const { band: confidenceBand } = scoreConfidence(state.stepOutputs)

  // Persist result and mark task complete
  await Promise.all([
    prisma.task.update({
      where: { id: state.taskId },
      data: {
        status:      'COMPLETE',
        result:      result as object,
        tokensUsed:  state.tokensUsed,
        costUsd:     state.costUsd,
        confidence:  confidenceBand,
        completedAt: new Date(),
      },
    }),
    prisma.agent.update({
      where: { id: state.agentId },
      data:  { status: 'IDLE' },
    }),
  ])

  // Deduct credits — non-fatal: a billing error should never fail a completed task
  try {
    await prisma.creditEntry.create({
      data: {
        userId:      state.agent.userId,
        taskId:      state.taskId,
        amount:      -1,
        reason:      'TASK_CONSUMPTION',
        description: `Task: ${state.taskTitle}`,
      },
    })
    await prisma.user.update({
      where: { id: state.agent.userId },
      data:  { creditsRemaining: { decrement: 1 } },
    })
  } catch { /* non-fatal */ }

  // Auto-save to command library — non-fatal: long instructions can exceed column limits
  try {
    const truncatedCommand = state.rawCommand.slice(0, 800)
    await prisma.savedCommand.upsert({
      where:  { userId_rawCommand: { userId: state.agent.userId, rawCommand: truncatedCommand } },
      create: {
        userId:     state.agent.userId,
        agentId:    state.agentId,
        title:      state.taskTitle,
        rawCommand: truncatedCommand,
        runCount:   1,
        lastRunAt:  new Date(),
      },
      update: {
        runCount:  { increment: 1 },
        lastRunAt: new Date(),
        title:     state.taskTitle,
      },
    })
  } catch { /* non-fatal */ }

  // Emit completion event — non-fatal: socket errors must not fail a completed task
  try {
    await emitEvent(state.agentId, {
      type:    'TASK_COMPLETE',
      taskId:  state.taskId,
      agentId: state.agentId,
      payload: {
        thoughtBubble: 'Done!',
        result: {
          type:       result.type as any,
          title:      result.title,
          content:    result.content,
          confidence: confidenceBand,
        },
      },
    })
  } catch { /* non-fatal */ }

  try { writeAudit({
    userId:     state.agent.userId,
    agentId:    state.agentId,
    taskId:     state.taskId,
    action:     'TASK_COMPLETE',
    entityType: 'task',
    payload:    { title: state.taskTitle, confidence: confidenceBand, costUsd: state.costUsd },
  }) } catch { /* non-fatal */ }

  // Determine XP reason based on task complexity
  const complexityXpReason = (() => {
    const complexity = (state as any).complexity ?? 'MEDIUM'
    if (complexity === 'SIMPLE')  return 'TASK_COMPLETE_SIMPLE'  as const
    if (complexity === 'COMPLEX') return 'TASK_COMPLETE_COMPLEX' as const
    return 'TASK_COMPLETE_MEDIUM' as const
  })()

  // Run memory extraction, email, XP award, and brain ingest in parallel — all non-blocking
  Promise.all([
    extractAndSaveMemories(state.agentId, state.taskId, state.rawCommand, state.stepOutputs, state.byokKey, state.agent.userId),
    sendTaskCompleteEmail(state.agentId, state.agent.userId, result, state.taskTitle),
    import('../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(state.agent.userId, complexityXpReason, state.taskId))
      .catch(() => {}),
    import('../services/gamification.service.js')
      .then(({ awardAgentXp }) => awardAgentXp(state.agentId, state.agent.userId, state.taskId))
      .catch(() => {}),
    ingestToBrain(state.agent.userId, state.agentId, state.taskId, state.taskTitle, result),
  ]).catch((err) => console.error('Post-task hooks error:', err))

  return { finalResult: result }
}

async function handleErrorNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  await Promise.all([
    prisma.task.update({
      where: { id: state.taskId },
      data:  { status: 'FAILED' },
    }),
    prisma.agent.update({
      where: { id: state.agentId },
      data:  { status: 'IDLE' },
    }),
  ])

  await emitEvent(state.agentId, {
    type: 'TASK_FAILED',
    taskId: state.taskId,
    agentId: state.agentId,
    payload: {
      thoughtBubble: 'I ran into a problem',
      error: {
        message:   state.error ?? 'Unknown error',
        userFacing: 'Something went wrong. You can retry this task.',
        retryable:  true,
      },
    },
  })

  writeAudit({
    userId:     state.agent.userId,
    agentId:    state.agentId,
    taskId:     state.taskId,
    action:     'TASK_FAILED',
    entityType: 'task',
    payload:    { error: state.error ?? 'Unknown error' },
  })

  return {}
}

// ── Routing ────────────────────────────────────────────────────────────────

function routeAfterStep(state: AgentGraphState): string {
  if (state.error)                                return 'handle_error'
  if (state.pendingApprovalTool && !state.waitingForApproval) return 'needs_approval'
  if (state.waitingForApproval)                   return END  // suspend
  if (state.approvalDecision === 'CANCELLED')     return 'handle_error'
  if (state.currentStepIndex < state.steps.length) return 'execute_step'
  return 'compile_result'
}

// ── Graph ──────────────────────────────────────────────────────────────────

const graph = new StateGraph(AgentGraphAnnotation)
  .addNode('plan_steps',    planStepsNode)
  .addNode('execute_step',  executeStepNode as any)
  .addNode('needs_approval', needsApprovalNode as any)
  .addNode('compile_result', compileResultNode)
  .addNode('handle_error',   handleErrorNode)
  .addEdge(START,            'plan_steps')
  .addEdge('plan_steps',     'execute_step')
  .addConditionalEdges('execute_step', routeAfterStep, {
    execute_step:    'execute_step',
    needs_approval:  'needs_approval',
    compile_result:  'compile_result',
    handle_error:    'handle_error',
    [END]:           END,
  })
  .addEdge('needs_approval', 'execute_step')
  .addEdge('compile_result', END)
  .addEdge('handle_error',   END)

// ── Compiled graph with Postgres checkpointer ──────────────────────────────

let _compiled: ReturnType<typeof graph.compile> | null = null

export async function getCompiledGraph() {
  if (_compiled) return _compiled

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const checkpointer = new PostgresSaver(pool)
  await checkpointer.setup()

  _compiled = graph.compile({ checkpointer: checkpointer as any })
  return _compiled
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startAgentTask(params: {
  taskId:       string
  agentId:      string
  agent:        Agent
  rawCommand:   string
  taskTitle:    string
  byokKey?:     string
  skipApproval?: boolean
  executeTool:  (name: string, input: unknown) => Promise<unknown>
}): Promise<void> {
  const compiled = await getCompiledGraph()
  registerExecutor(params.taskId, params.executeTool)
  try {
    await compiled.invoke(
      {
        taskId:       params.taskId,
        agentId:      params.agentId,
        agent:        params.agent,
        rawCommand:   params.rawCommand,
        taskTitle:    params.taskTitle,
        byokKey:      params.byokKey,
        skipApproval: params.skipApproval ?? false,
      },
      { configurable: { thread_id: params.taskId } }
    )
  } finally {
    unregisterExecutor(params.taskId)
  }
}

export async function resumeAgentTask(params: {
  taskId:           string
  approvalDecision: 'APPROVED' | 'EDITED' | 'CANCELLED'
  approvalEdit?:    unknown
  executeTool:      (name: string, input: unknown) => Promise<unknown>
}): Promise<void> {
  const compiled = await getCompiledGraph()
  registerExecutor(params.taskId, params.executeTool)
  try {
    await compiled.invoke(
      {
        waitingForApproval: false,
        pendingApprovalTool: null,
        approvalDecision:   params.approvalDecision,
        approvalEdit:       params.approvalEdit ?? null,
      },
      { configurable: { thread_id: params.taskId } }
    )
  } finally {
    unregisterExecutor(params.taskId)
  }
}
