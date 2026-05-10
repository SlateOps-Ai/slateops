export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'NEEDS_APPROVAL'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED'

export type TaskComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX'

export interface Task {
  id: string
  agentId: string
  userId: string
  title: string
  rawCommand: string
  status: TaskStatus
  complexity: TaskComplexity
  result: TaskResultData | null
  tokensUsed: number
  costUsd: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface TaskResultData {
  type: 'document' | 'email_draft' | 'calendar_event' | 'list' | 'text'
  title: string
  content: unknown
}

export interface CreateTaskInput {
  agentId?: string
  rawCommand: string
}

export interface RouterDecision {
  targetAgentId: string | null
  taskTitle: string
  taskSummary: string
  estimatedComplexity: TaskComplexity
  requiredTools: string[]
  clarificationNeeded: boolean
  clarificationQuestion?: string
}

export interface ApprovalDecision {
  taskId: string
  status: 'APPROVED' | 'EDITED' | 'CANCELLED'
  edit?: unknown
}
