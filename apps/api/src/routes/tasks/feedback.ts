import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const bodySchema = z.object({
  rating: z.enum(['POSITIVE', 'NEGATIVE']),
})

export default async function taskFeedbackRoute(app: FastifyInstance) {
  app.patch('/api/tasks/:id/feedback', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rating } = bodySchema.parse(req.body)

    const task = await prisma.task.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    await prisma.task.update({
      where: { id },
      data:  { userRating: rating },
    })

    if (rating === 'POSITIVE') {
      import('../../services/gamification.service.js')
        .then(({ awardXp }) => awardXp(req.dbUserId, 'RATE_TASK_POSITIVE', id))
        .catch(() => {})
    }

    return reply.send({ ok: true })
  })
}
