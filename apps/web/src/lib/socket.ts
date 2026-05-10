import { io, Socket } from 'socket.io-client'
import type { AgentEvent } from '@agentcity/types'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000', {
      withCredentials: true,
      transports: ['websocket'],
      autoConnect: false,
    })
  }
  return socket
}

export function connectSocket(token: string): void {
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) s.connect()
}

export function disconnectSocket(): void {
  socket?.disconnect()
}

export function onAgentEvent(handler: (event: AgentEvent) => void): () => void {
  const s = getSocket()
  s.on('agent:event', handler)
  return () => s.off('agent:event', handler)
}
