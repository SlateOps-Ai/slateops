import type { Agent } from '@prisma/client'
import type { RouterDecision } from '@agentcity/types'
import { getAnthropicClient } from '../lib/claude.js'

const ROUTER_SYSTEM = `You are a task router for an AI-powered office.
Given a natural language command and a list of available agents, decide which agent should handle it.
Return ONLY a valid JSON object matching the RouterDecision schema — no markdown, no prose.

RouterDecision schema:
{
  "targetAgentId": string | null,       // null if no suitable agent or all are busy
  "taskTitle": string,                  // concise title ≤ 60 chars
  "taskSummary": string,               // one sentence
  "estimatedComplexity": "SIMPLE" | "MEDIUM" | "COMPLEX",
  "requiredTools": string[],            // tool names from the agent's tool belt
  "clarificationNeeded": boolean,
  "clarificationQuestion": string | undefined
}`

export async function routeCommand(
  rawCommand: string,
  agents: Agent[],
  byokKey?: string
): Promise<RouterDecision> {
  const client = getAnthropicClient(byokKey)

  const agentList = agents
    .filter((a) => a.isActive && a.status !== 'WORKING')
    .map((a) => `- id: ${a.id}, name: ${a.name}, role: ${a.role}, status: ${a.status}`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: ROUTER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Command: "${rawCommand}"\n\nAvailable agents:\n${agentList || 'None available'}`,
      },
    ],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')

  try {
    return JSON.parse(text) as RouterDecision
  } catch {
    // Fallback: assign to first idle agent if parse fails
    const firstIdle = agents.find((a) => a.status === 'IDLE')
    return {
      targetAgentId:       firstIdle?.id ?? null,
      taskTitle:           rawCommand.slice(0, 60),
      taskSummary:         rawCommand,
      estimatedComplexity: 'MEDIUM',
      requiredTools:       [],
      clarificationNeeded: false,
    }
  }
}
