import type { Agent } from '@prisma/client'
import type { RouterDecision } from '@agentcity/types'
import { getAnthropicClient } from '../lib/claude.js'

const ROUTER_SYSTEM = `You are a task router for an AI-powered office.
Given a natural language command and a list of agents (with their current status), decide which agent should handle it.
Prefer IDLE agents, but if the command explicitly names a WORKING agent, assign it to them anyway.
Return ONLY a valid JSON object matching the RouterDecision schema — no markdown, no prose.

RouterDecision schema:
{
  "targetAgentId": string | null,       // null only if no agents exist at all
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
  byokKey?: string,
  userId?: string,
): Promise<RouterDecision> {
  const client = getAnthropicClient(byokKey)

  const agentList = agents
    .filter((a) => a.isActive)
    .map((a) => `- id: ${a.id}, name: ${a.name}, role: ${a.role}, status: ${a.status}`)
    .join('\n')

  const { callAnthropic } = await import('../lib/llm-usage.js')
  const message = userId
    ? await callAnthropic(client, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: ROUTER_SYSTEM,
        messages: [{
          role: 'user',
          content: `Command: "${rawCommand}"\n\nAvailable agents:\n${agentList || 'None available'}`,
        }],
      }, { userId, endpoint: 'agents/router', byok: !!byokKey })
    : await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: ROUTER_SYSTEM,
        messages: [{
          role: 'user',
          content: `Command: "${rawCommand}"\n\nAvailable agents:\n${agentList || 'None available'}`,
        }],
      })

  const text = (message.content as any[])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => (b as { text: string }).text)
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
