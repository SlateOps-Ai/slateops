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
  | 'GRANT_REQUESTED'

export type ApprovalPreviewType = 'email' | 'calendar_event' | 'message' | 'document'

export type ResultType = 'document' | 'email_draft' | 'calendar_event' | 'list' | 'text'

export type FileFormat = 'docx' | 'xlsx' | 'pdf' | 'csv' | 'txt'

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW'

export interface ApprovalRequest {
  action: string
  preview: string
  previewType: ApprovalPreviewType
  destructive: boolean
  expiresAt: string
}

export interface TaskResult {
  type:        ResultType
  content:     unknown
  title:       string
  confidence?: ConfidenceBand
  format?:     FileFormat
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
  grantRequest?: {
    requestId:       string
    composioAppName: string
    label:           string
    emoji:           string
    reason:          string
    isAppConnected:  boolean
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
