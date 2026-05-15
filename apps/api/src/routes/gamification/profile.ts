import type { FastifyInstance } from 'fastify'
import { getGamificationProfile } from '../../services/gamification.service.js'

export default async function gamificationProfileRoute(app: FastifyInstance) {
  app.get('/api/gamification/profile', async (req, reply) => {
    const profile = await getGamificationProfile(req.dbUserId)
    return reply.send({ profile })
  })
}
