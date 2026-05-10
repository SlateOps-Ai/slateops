import type { AgentRole } from '@agentcity/types'

// Tools available to each role. Mapped to Composio action names.
export const ROLE_TOOLS: Record<AgentRole, string[]> = {
  EXEC_ASSISTANT: [
    'GMAIL_LIST_THREADS',
    'GMAIL_GET_THREAD',
    'GMAIL_CREATE_DRAFT',
    'GMAIL_SEND_EMAIL',
    'GOOGLECALENDAR_LIST_EVENTS',
    'GOOGLECALENDAR_CREATE_EVENT',
  ],
  RESEARCH_ANALYST: [
    'SERPAPI_SEARCH',
    'BROWSERBASE_SCRAPE_URL',
  ],
  CONTENT_WRITER: [
    'SERPAPI_SEARCH',
  ],
  SALES_PROSPECTOR: [
    'SERPAPI_SEARCH',
    'BROWSERBASE_SCRAPE_URL',
  ],
  OPS_COORDINATOR: [
    'GOOGLECALENDAR_LIST_EVENTS',
    'GOOGLECALENDAR_CREATE_EVENT',
  ],
}

// These tools trigger the human-in-the-loop approval gate before execution
export const DESTRUCTIVE_TOOLS = new Set([
  'GMAIL_SEND_EMAIL',
  'GOOGLECALENDAR_CREATE_EVENT',
  'GOOGLECALENDAR_DELETE_EVENT',
  'GOOGLECALENDAR_UPDATE_EVENT',
])

export function requiresApproval(toolName: string): boolean {
  return DESTRUCTIVE_TOOLS.has(toolName)
}
