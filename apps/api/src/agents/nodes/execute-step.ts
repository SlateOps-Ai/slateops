import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '../../lib/claude.js'
import { emitEvent } from '../../services/events.service.js'
import { requiresApproval, ROLE_TOOLS } from '../tools/registry.js'
import { prisma } from '../../lib/prisma.js'
import type { AgentGraphState } from '../graph.js'

function buildSystemPrompt(
  agentName: string,
  role: string,
  personality: string,
  contextBrief?: string | null,
  memories: Array<{ key: string; value: string }> = [],
): string {
  const brief = contextBrief?.trim()
  const memBlock = memories.length
    ? `\n\nWhat you know about the person you work for:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
    : ''
  return `You are ${agentName}, a ${role.toLowerCase().replace(/_/g, ' ')} AI agent.
Personality: ${personality || 'professional and efficient'}.${brief ? `\n\nContext: ${brief}` : ''}${memBlock}
Execute the current task step using the available tools.
When you have enough information, stop calling tools and return a clear, structured result.
Never fabricate data — if a tool returns no results, say so honestly.`
}

export async function executeStepNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const { taskId, agentId, agent, currentStepIndex, steps, messageHistory, byokKey } = state

  // Fetch agent memories (top 15 by recency) to inject into every step
  const memories = await prisma.agentMemory.findMany({
    where:   { agentId },
    orderBy: { updatedAt: 'desc' },
    take:    15,
    select:  { key: true, value: true },
  })

  const step = steps[currentStepIndex]
  if (!step) return { currentStepIndex: currentStepIndex + 1 }

  await emitEvent(agentId, {
    type: 'STEP_STARTED',
    taskId,
    agentId,
    payload: {
      stepName:      step.name,
      thoughtBubble: step.description ?? `Working on: ${step.name}`,
    },
  })

  const client = getAnthropicClient(byokKey)
  const tools = buildTools(agent.role)

  // Build messages: history + current step instruction
  const messages: Anthropic.MessageParam[] = [
    ...messageHistory,
    {
      role:    'user',
      content: step.instruction,
    },
  ]


  // Agentic loop: keep calling LLM until it stops using tools
  while (true) {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     buildSystemPrompt(agent.name, agent.role, agent.personality ?? '', agent.contextBrief, memories),
      tools,
      messages,
    })

    // Accumulate token usage
    const newTokens = response.usage.input_tokens + response.usage.output_tokens
    const costUsd   = (newTokens / 1000) * 0.003  // approximate

    // Push the assistant response to history
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      // Extract final text from response
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('\n')
        .trim()

      return {
        messageHistory:  messages,
        stepOutputs:     [...(state.stepOutputs ?? []), { step: step.name, output: text }],
        tokensUsed:      (state.tokensUsed ?? 0) + newTokens,
        costUsd:         (state.costUsd ?? 0) + costUsd,
        currentStepIndex: currentStepIndex + 1,
        pendingApprovalTool: null,
      }
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      const toolResultContent: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        await emitEvent(agentId, {
          type: 'TOOL_CALLED',
          taskId,
          agentId,
          payload: {
            toolName:      toolUse.name,
            thoughtBubble: `Using ${toolUse.name.replace(/_/g, ' ').toLowerCase()}…`,
          },
        })

        // Gate destructive tools — suspend and wait for approval
        if (requiresApproval(toolUse.name)) {
          return {
            messageHistory:  messages,
            tokensUsed:      (state.tokensUsed ?? 0) + newTokens,
            costUsd:         (state.costUsd ?? 0) + costUsd,
            pendingApprovalTool: { name: toolUse.name, input: toolUse.input, toolUseId: toolUse.id },
            currentStepIndex,
          }
        }

        // Execute via Composio (real implementation injected by the graph)
        const toolOutput = await state.executeTool(toolUse.name, toolUse.input)

        await emitEvent(agentId, {
          type: 'TOOL_RESULT',
          taskId,
          agentId,
          payload: {
            toolName:      toolUse.name,
            thoughtBubble: summariseTool(toolUse.name, toolOutput),
          },
        })

        toolResultContent.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content:     JSON.stringify(toolOutput),
        })
      }

      messages.push({ role: 'user', content: toolResultContent })
    }
  }
}

function buildTools(role: string): Anthropic.Tool[] {
  // These are declared so the LLM knows what tools exist.
  // Actual execution is routed through Composio in executeTool().
  return ROLE_TOOLS[role as keyof typeof ROLE_TOOLS]?.map((name) => ({
    name,
    description: `Execute the ${name} action`,
    input_schema: {
      type: 'object' as const,
      properties: { params: { type: 'object', description: 'Action parameters' } },
    },
  })) ?? []
}

function summariseTool(toolName: string, output: unknown): string {
  if (toolName.includes('SEARCH'))  return 'Found results, reading…'
  if (toolName.includes('GMAIL'))   return 'Email processed'
  if (toolName.includes('CALENDAR')) return 'Calendar updated'
  if (toolName.includes('SCRAPE'))  return 'Page read'
  return 'Step complete'
}
