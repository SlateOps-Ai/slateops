export type EventType =
  | 'TASK_ASSIGNED'
  | 'STEP_STARTED'
  | 'TOOL_CALLED'
  | 'TOOL_RESULT'
  | 'NEEDS_APPROVAL'
  | 'APPROVAL_GRANTED'
  | 'STEP_COMPLETE'
  | 'TASK_COMPLETE'
  | 'TASK_FAILED'
  | 'TASK_BLOCKED'

export type ApprovalPreviewType = 'email' | 'calendar_event' | 'message' | 'document'

export type ResultType = 'document' | 'email_draft' | 'calendar_event' | 'list' | 'text'

export interface ApprovalRequest {
  action: string
  preview: string
  previewType: ApprovalPreviewType
  destructive: boolean
  expiresAt: string
}

export interface TaskResult {
  type: ResultType
  content: unknown
  title: string
}

export interface AgentEventPayload {
  thoughtBubble?: string
  stepName?: string
  toolName?: string
  estimatedSecondsRemaining?: number
  result?: TaskResult
  approvalRequest?: ApprovalRequest
  error?: {
    message: string
    userFacing: string
    retryable: boolean
  }
}

export interface AgentEvent {
  type: EventType
  taskId: string
  agentId: string
  sequenceNumber: number
  timestamp: string
  payload: AgentEventPayload
}
