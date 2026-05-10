import { emitEvent } from '../../services/events.service.js'
import { prisma } from '../../lib/prisma.js'
import type { AgentGraphState } from '../graph.js'

const APPROVAL_TTL_MS = 10 * 60 * 1000  // 10 minutes

export async function needsApprovalNode(
  state: AgentGraphState
): Promise<Partial<AgentGraphState>> {
  const { taskId, agentId, pendingApprovalTool } = state
  if (!pendingApprovalTool) return {}

  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS)

  // Persist the approval request
  await prisma.approvalRequest.create({
    data: {
      taskId,
      agentId,
      action:       pendingApprovalTool.name,
      preview:      pendingApprovalTool.input as object,
      previewType:  inferPreviewType(pendingApprovalTool.name),
      isDestructive: true,
      expiresAt,
    },
  })

  // Update task status
  await prisma.task.update({
    where: { id: taskId },
    data:  { status: 'NEEDS_APPROVAL' },
  })

  // Emit event so frontend shows the approval overlay
  await emitEvent(agentId, {
    type: 'NEEDS_APPROVAL',
    taskId,
    agentId,
    payload: {
      thoughtBubble: 'Waiting for your approval…',
      approvalRequest: {
        action:      pendingApprovalTool.name,
        preview:     JSON.stringify(pendingApprovalTool.input, null, 2),
        previewType: inferPreviewType(pendingApprovalTool.name),
        destructive: true,
        expiresAt:   expiresAt.toISOString(),
      },
    },
  })

  // The graph suspends here — resumed by the /api/tasks/:id/approve route
  // which calls graph.invoke() with the approval decision in state
  return { waitingForApproval: true }
}

function inferPreviewType(
  toolName: string
): 'email' | 'calendar_event' | 'message' | 'document' {
  if (toolName.includes('GMAIL'))    return 'email'
  if (toolName.includes('CALENDAR')) return 'calendar_event'
  return 'document'
}
