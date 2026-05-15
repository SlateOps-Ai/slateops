import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { startAgentTask } from '../../agents/graph.js'
import { emitEvent } from '../../services/events.service.js'
import { getAnthropicClient } from '../../lib/claude.js'

const workflowStepSchema = z.object({
  agentId:      z.string().uuid(),
  instruction:  z.string().min(3).max(2000),
  label:        z.string().min(1).max(100),
  requiresGate: z.boolean().optional(),
})

const createSchema = z.object({
  name:  z.string().min(1).max(120),
  steps: z.array(workflowStepSchema).min(1).max(10),
})

async function waitForGateDecision(runId: string, timeoutMs = 30 * 60 * 1000): Promise<'APPROVED' | 'REJECTED'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const run = await prisma.workflowRun.findUnique({ where: { id: runId }, select: { status: true } })
    if (!run || run.status === 'GATE_REJECTED') return 'REJECTED'
    if (run.status === 'GATE_APPROVED') return 'APPROVED'
    await new Promise((r) => setTimeout(r, 3000))
  }
  return 'REJECTED'
}

async function waitForTaskCompletion(taskId: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const task = await prisma.task.findUnique({
      where:  { id: taskId },
      select: { status: true },
    })
    if (!task) return 'FAILED'
    if (task.status === 'COMPLETE') return 'COMPLETE'
    if (task.status === 'FAILED' || task.status === 'CANCELLED') return 'FAILED'
    // If stuck waiting for human approval in a workflow context, fail fast
    if (task.status === 'NEEDS_APPROVAL') return 'FAILED'
    await new Promise((r) => setTimeout(r, 3000))
  }
  return 'FAILED'
}

const AI_GENERATE_SYSTEM = `You are a workflow architect for an AI-powered office.
Given a business process description and a list of available AI agents, design a structured step-by-step workflow.
Assign each step to the most appropriate agent based on their role.
Return ONLY a single valid JSON object — no markdown, no prose, no explanation.

Schema:
{
  "name": string,           // concise workflow name ≤ 60 chars
  "steps": [
    {
      "label": string,      // short step label 3-6 words
      "agentId": string,    // must be one of the provided agent IDs
      "instruction": string // clear, actionable instruction for the agent 1-3 sentences
    }
  ]
}`

export default async function workflowsRoute(app: FastifyInstance) {

  // POST /api/workflows/generate — AI-powered workflow builder
  app.post('/api/workflows/generate', async (req, reply) => {
    const { description } = z.object({ description: z.string().min(10).max(4000) }).parse(req.body)
    const userId = req.dbUserId

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { byokKey: true } })
    const agents = await prisma.agent.findMany({
      where:  { userId, isActive: true },
      select: { id: true, name: true, role: true },
    })
    if (!agents.length) return reply.code(400).send({ error: 'No agents found. Create at least one agent first.' })

    const client = getAnthropicClient(user?.byokKey ?? undefined)
    const agentList = agents.map((a) => `- id: ${a.id}, name: ${a.name}, role: ${a.role.replace(/_/g, ' ')}`).join('\n')

    const { callAnthropic } = await import('../../lib/llm-usage.js')
    const msg = await callAnthropic(client, {
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     AI_GENERATE_SYSTEM,
      messages:   [{
        role:    'user',
        content: `Business process:\n${description}\n\nAvailable agents:\n${agentList}`,
      }],
    }, { userId, endpoint: '/api/workflows/ai-generate', byok: !!user?.byokKey })

    const raw = (msg.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => (b as any).text).join('')
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    try {
      const parsed = JSON.parse(stripped)
      if (!parsed.name || !Array.isArray(parsed.steps)) throw new Error('Invalid schema')
      return reply.send({ workflow: parsed })
    } catch {
      return reply.code(422).send({ error: 'AI could not parse this process into steps. Try adding more detail.' })
    }
  })

  // GET /api/workflows
  app.get('/api/workflows', async (req, reply) => {
    const workflows = await prisma.workflow.findMany({
      where:   { userId: req.dbUserId },
      orderBy: { createdAt: 'desc' },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    })
    return reply.send({ workflows })
  })

  // POST /api/workflows
  app.post('/api/workflows', async (req, reply) => {
    const body     = createSchema.parse(req.body)
    const userId   = req.dbUserId

    // Verify all agentIds belong to this user
    const agentIds = [...new Set(body.steps.map((s) => s.agentId))]
    const agents   = await prisma.agent.findMany({
      where: { id: { in: agentIds }, userId, isActive: true },
      select: { id: true },
    })
    if (agents.length !== agentIds.length) {
      return reply.code(400).send({ error: 'One or more agents not found' })
    }

    const workflow = await prisma.workflow.create({
      data: {
        userId,
        name:  body.name,
        steps: body.steps,
      },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'CREATE_WORKFLOW', workflow.id))
      .catch(() => {})

    return reply.code(201).send({ workflow })
  })

  // DELETE /api/workflows/:id
  app.delete('/api/workflows/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.workflow.deleteMany({ where: { id, userId: req.dbUserId } })
    return reply.send({ ok: true })
  })

  // POST /api/workflows/runs/:runId/gate — approve or reject a human review gate
  app.post('/api/workflows/runs/:runId/gate', async (req, reply) => {
    const { runId }   = req.params as { runId: string }
    const { decision } = req.body as { decision: 'APPROVE' | 'REJECT' }
    const userId      = req.dbUserId

    const run = await prisma.workflowRun.findFirst({
      where: { id: runId, userId, status: 'WAITING_GATE' },
    })
    if (!run) return reply.code(404).send({ error: 'No pending gate for this run' })

    await prisma.workflowRun.update({
      where: { id: runId },
      data:  { status: decision === 'APPROVE' ? 'GATE_APPROVED' : 'GATE_REJECTED' },
    })
    return reply.send({ ok: true })
  })

  // POST /api/workflows/:id/run
  app.post('/api/workflows/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId
    const { isTest = false } = (req.body as any) ?? {}

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
    })
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    // Test runs are credit-free — only block live runs
    if (!isTest && user.creditsRemaining <= 0 && !user.byokKey) {
      return reply.code(402).send({ error: 'No credits remaining', code: 'NO_CREDITS' })
    }

    const steps = workflow.steps as Array<{ agentId: string; instruction: string; label: string; requiresGate?: boolean }>

    // ── Test mode: synchronous dry-run, returns result immediately ──
    if (isTest) {
      console.log('[TEST] userId:', userId, '| steps:', steps.length)
      const outputs: Array<{ label: string; taskId: string; status: string }> = []
      for (const step of steps) {
        const agent = await prisma.agent.findFirst({
          where: { id: step.agentId, userId, isActive: true },
          select: { id: true },
        })
        console.log('[TEST] step:', step.label, '| agentId:', step.agentId, '| found:', !!agent)
        if (!agent) {
          outputs.push({ label: step.label, taskId: '', status: 'FAILED' })
          break
        }
        outputs.push({ label: step.label, taskId: 'dry-run', status: 'COMPLETE' })
      }
      const allComplete = outputs.length === steps.length && outputs.every((o) => o.status === 'COMPLETE')
      const finalStatus = allComplete ? 'TEST_COMPLETE' : 'TEST_FAILED'
      console.log('[TEST] finalStatus:', finalStatus, '| outputs:', JSON.stringify(outputs))
      const run = await prisma.workflowRun.create({
        data: { workflowId: id, userId, status: finalStatus, stepOutputs: outputs, completedAt: new Date() },
      })
      return reply.code(200).send({ run: { id: run.id, workflowId: id, status: finalStatus, stepOutputs: outputs } })
    }

    // ── Live mode ────────────────────────────────────────────────────
    const run = await prisma.workflowRun.create({
      data: { workflowId: id, userId, status: 'RUNNING' },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'RUN_WORKFLOW', run.id))
      .catch(() => {})

    // Run steps sequentially in background — don't await
    ;(async () => {
      const outputs: Array<{ label: string; taskId: string; status: string }> = []

      for (const [i, step] of steps.entries()) {
        try {
          const agent = await prisma.agent.findFirst({
            where: { id: step.agentId, userId, isActive: true },
          })
          if (!agent) {
            outputs.push({ label: step.label, taskId: '', status: 'FAILED' })
            break
          }

          // ── Full agent execution ──────────────────────────────────
          const task = await prisma.task.create({
            data: {
              agentId:    agent.id,
              userId,
              title:      step.label,
              rawCommand: step.instruction,
              status:     'PENDING',
              complexity: 'MEDIUM',
            },
          })

          await emitEvent(agent.id, {
            type:    'TASK_ASSIGNED',
            taskId:  task.id,
            agentId: agent.id,
            payload: { thoughtBubble: `Workflow step: ${step.label}` },
          })

          await Promise.all([
            prisma.task.update({
              where: { id: task.id },
              data:  { status: 'IN_PROGRESS', startedAt: new Date(), langGraphThread: task.id },
            }),
            prisma.agent.update({ where: { id: agent.id }, data: { status: 'WORKING' } }),
          ])

          const { makeExecutor } = await import('../../lib/composio.js')

          startAgentTask({
            taskId:       task.id,
            agentId:      agent.id,
            agent,
            rawCommand:   step.instruction,
            taskTitle:    step.label,
            byokKey:      user.byokKey ?? undefined,
            skipApproval: true,
            executeTool:  makeExecutor(userId),
          }).catch(async (err) => {
            console.error(`Workflow step error [${step.label}]:`, err)
            await Promise.all([
              prisma.task.update({ where: { id: task.id }, data: { status: 'FAILED' } }),
              prisma.agent.update({ where: { id: agent.id }, data: { status: 'IDLE' } }),
            ])
          }).finally(async () => {
            await prisma.agent.update({ where: { id: agent.id }, data: { status: 'IDLE' } })
          })

          const finalStatus = await waitForTaskCompletion(task.id)
          outputs.push({ label: step.label, taskId: task.id, status: finalStatus })

          if (finalStatus !== 'COMPLETE') break

          // ── Human Review Gate ────────────────────────────────────────
          if (step.requiresGate && i < steps.length - 1) {
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: {
                status:      'WAITING_GATE',
                stepOutputs: [...outputs, { _gate: true, afterStep: i, afterStepLabel: step.label }],
              },
            })
            const decision = await waitForGateDecision(run.id)
            if (decision === 'REJECTED') {
              await prisma.workflowRun.update({
                where: { id: run.id },
                data:  { status: 'FAILED', completedAt: new Date(), stepOutputs: outputs },
              })
              return
            }
            await prisma.workflowRun.update({
              where: { id: run.id },
              data:  { status: 'RUNNING', stepOutputs: outputs },
            })
          }
        } catch (err) {
          console.error(`Workflow step error [${step.label}]:`, err)
          outputs.push({ label: step.label, taskId: '', status: 'FAILED' })
          break
        }
      }

      const allComplete = outputs.length === steps.length && outputs.every((o) => o.status === 'COMPLETE')
      await prisma.workflowRun.update({
        where: { id: run.id },
        data:  {
          status:      allComplete ? 'COMPLETE' : 'FAILED',
          stepOutputs: outputs,
          completedAt: new Date(),
        },
      })
    })().catch(console.error)

    return reply.code(202).send({ run: { id: run.id, workflowId: id } })
  })
}
