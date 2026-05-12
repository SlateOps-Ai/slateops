import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import pg from 'pg'
import type { Agent } from '@prisma/client'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { prisma } from '../lib/prisma.js'
import { emitEvent } from '../services/events.service.js'
import { executeStepNode } from './nodes/execute-step.js'
import { needsApprovalNode } from './nodes/needs-approval.js'

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

  // Injected executor (Composio wrapper passed in at runtime)
  executeTool: Annotation<(name: string, input: unknown) => Promise<unknown>>(),
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
  rawCommand: string,
  stepOutputs: Array<{ step: string; output: string }>,
  byokKey?: string,
): Promise<void> {
  try {
    const { getAnthropicClient } = await import('../lib/claude.js')
    const client = getAnthropicClient(byokKey)

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `Extract 0-3 memorable facts about the user's working context, preferences, or style
from this completed task. Only extract facts useful for future tasks (tone preferences, industry, brand voice, recurring patterns).
Return ONLY JSON: {"memories":[{"key":"snake_case_name","value":"concise fact"}]}
Keys ≤40 chars, values ≤200 chars. Return {"memories":[]} if nothing meaningful.`,
      messages: [{
        role:    'user',
        content: `Task: ${rawCommand}\n\nOutputs:\n${stepOutputs.map((s) => s.output).join('\n\n').slice(0, 1500)}`,
      }],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')

    const { memories } = JSON.parse(text)
    for (const mem of (memories as Array<{ key: string; value: string }>)) {
      if (!mem.key || !mem.value) continue
      await prisma.agentMemory.upsert({
        where:  { agentId_key: { agentId, key: mem.key } },
        create: { agentId, key: mem.key, value: mem.value },
        update: { value: mem.value },
      })
    }
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
  const { getAnthropicClient } = await import('../lib/claude.js')
  const client = getAnthropicClient(state.byokKey)

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:     `You are a task planner. Break the command into 2-4 concrete sequential steps.
Return ONLY a JSON array: [{"name":"string","description":"string","instruction":"string"}]
"instruction" is the exact prompt that will be sent to an LLM to complete that step.
Keep steps specific and actionable.`,
    messages: [{ role: 'user', content: state.rawCommand }],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')

  let steps: TaskStep[] = []
  try {
    steps = JSON.parse(text)
  } catch {
    steps = [{ name: 'execute', description: state.rawCommand, instruction: state.rawCommand }]
  }

  return { steps, currentStepIndex: 0 }
}

async function compileResultNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const { getAnthropicClient } = await import('../lib/claude.js')
  const client = getAnthropicClient(state.byokKey)

  const stepsText = state.stepOutputs
    .map((s, i) => `Step ${i + 1} (${s.step}):\n${s.output}`)
    .join('\n\n')

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You compile step outputs into a single polished result. Choose the most appropriate type:

- "email_draft": when the result is an email to send. content = { "to": string, "subject": string, "body": string }
- "calendar_event": when creating a meeting/event. content = { "title": string, "start": string, "end": string, "location": string }
- "list": when the result is a set of items/findings. content = ["item 1", "item 2", ...]
- "document": when the result is a report, analysis, or long-form content. content = "full text"
- "text": for short answers or summaries. content = "text"

Return ONLY valid JSON: {"type":"<type>","title":"<concise title>","content":<content matching the schema above>}`,
    messages: [
      {
        role: 'user',
        content: `Original command: ${state.rawCommand}\n\nStep outputs:\n${stepsText}`,
      },
    ],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')

  let result: FinalResult = { type: 'text', title: state.taskTitle, content: text }
  try {
    result = JSON.parse(text)
  } catch { /* use text fallback */ }

  // Persist result and mark task complete
  await prisma.task.update({
    where: { id: state.taskId },
    data: {
      status:      'COMPLETE',
      result:      result as object,
      tokensUsed:  state.tokensUsed,
      costUsd:     state.costUsd,
      completedAt: new Date(),
    },
  })

  // Deduct credits
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

  // Auto-save to command library (upsert — bump runCount if command already saved)
  await prisma.savedCommand.upsert({
    where:  { userId_rawCommand: { userId: state.agent.userId, rawCommand: state.rawCommand } },
    create: {
      userId:    state.agent.userId,
      agentId:   state.agentId,
      title:     state.taskTitle,
      rawCommand: state.rawCommand,
      runCount:  1,
      lastRunAt: new Date(),
    },
    update: {
      runCount:  { increment: 1 },
      lastRunAt: new Date(),
      title:     state.taskTitle,
    },
  })

  await emitEvent(state.agentId, {
    type: 'TASK_COMPLETE',
    taskId: state.taskId,
    agentId: state.agentId,
    payload: {
      thoughtBubble: 'Done!',
      result: { type: result.type as any, title: result.title, content: result.content },
    },
  })

  // Run memory extraction and email notification in parallel, non-blocking
  Promise.all([
    extractAndSaveMemories(state.agentId, state.rawCommand, state.stepOutputs, state.byokKey),
    sendTaskCompleteEmail(state.agentId, state.agent.userId, result, state.taskTitle),
  ]).catch((err) => console.error('Post-task hooks error:', err))

  return { finalResult: result }
}

async function handleErrorNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  await prisma.task.update({
    where: { id: state.taskId },
    data:  { status: 'FAILED' },
  })

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
  taskId:    string
  agentId:   string
  agent:     Agent
  rawCommand: string
  taskTitle: string
  byokKey?:  string
  executeTool: (name: string, input: unknown) => Promise<unknown>
}): Promise<void> {
  const compiled = await getCompiledGraph()

  await compiled.invoke(
    {
      taskId:      params.taskId,
      agentId:     params.agentId,
      agent:       params.agent,
      rawCommand:  params.rawCommand,
      taskTitle:   params.taskTitle,
      byokKey:     params.byokKey,
      executeTool: params.executeTool,
    },
    { configurable: { thread_id: params.taskId } }
  )
}

export async function resumeAgentTask(params: {
  taskId:           string
  approvalDecision: 'APPROVED' | 'EDITED' | 'CANCELLED'
  approvalEdit?:    unknown
  executeTool:      (name: string, input: unknown) => Promise<unknown>
}): Promise<void> {
  const compiled = await getCompiledGraph()

  await compiled.invoke(
    {
      waitingForApproval: false,
      pendingApprovalTool: null,
      approvalDecision:   params.approvalDecision,
      approvalEdit:       params.approvalEdit ?? null,
      executeTool:        params.executeTool,
    },
    { configurable: { thread_id: params.taskId } }
  )
}
