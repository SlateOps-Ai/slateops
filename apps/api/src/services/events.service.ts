import type { Server as SocketServer } from 'socket.io'
import { prisma } from '../lib/prisma.js'
import type { AgentEvent, EventType } from '@agentcity/types'

let _io: SocketServer | null = null

export function setSocketServer(io: SocketServer): void {
  _io = io
}

let _sequenceCounters = new Map<string, number>()

export async function emitEvent(
  agentId: string,
  partial: Omit<AgentEvent, 'sequenceNumber' | 'timestamp'>
): Promise<void> {
  const key = partial.taskId
  const seq = (_sequenceCounters.get(key) ?? 0) + 1
  _sequenceCounters.set(key, seq)

  const event: AgentEvent = {
    ...partial,
    sequenceNumber: seq,
    timestamp:      new Date().toISOString(),
  }

  // Persist to DB for replay
  await prisma.taskEvent.create({
    data: {
      taskId:        event.taskId,
      agentId:       event.agentId,
      eventType:     event.type as any,
      sequenceNumber: event.sequenceNumber,
      payload:       event.payload as object,
    },
  })

  // Broadcast to authenticated socket room for this user
  // Room key uses clerkId (what the socket middleware sets on socket.data.userId)
  const agent = await prisma.agent.findUnique({
    where:  { id: agentId },
    select: { user: { select: { clerkId: true } } },
  })

  if (agent?.user?.clerkId && _io) {
    _io.to(`user:${agent.user.clerkId}`).emit('agent:event', event)
  }
}

export async function replayEvents(taskId: string): Promise<AgentEvent[]> {
  const rows = await prisma.taskEvent.findMany({
    where:   { taskId },
    orderBy: { sequenceNumber: 'asc' },
  })

  return rows.map((row) => ({
    type:           row.eventType as EventType,
    taskId:         row.taskId,
    agentId:        row.agentId,
    sequenceNumber: row.sequenceNumber,
    timestamp:      row.timestamp.toISOString(),
    payload:        row.payload as AgentEvent['payload'],
  }))
}
