import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { setSocketServer } from '../services/events.service.js'

export default fp(async function socketPlugin(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin:      process.env.WEB_URL ?? 'http://localhost:3000',
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Unauthorized'))

    // Verify token via Clerk SDK
    try {
      const { verifyToken } = await import('@clerk/backend')
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      })
      socket.data.userId = payload.sub
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId
    // Each user has their own room; events are routed here by events.service
    socket.join(`user:${userId}`)

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`)
    })
  })

  setSocketServer(io)
  app.decorate('io', io)
})

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}
