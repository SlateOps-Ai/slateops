import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const scheduleSchema = z.object({
  savedCommandId: z.string().uuid(),
  cronExpr:       z.string().min(9),   // e.g. "0 9 * * 1"
  label:          z.string().min(1).max(80),
})

export default async function libraryRoute(app: FastifyInstance) {

  // GET /api/library — list saved commands
  app.get('/api/library', async (req, reply) => {
    const commands = await prisma.savedCommand.findMany({
      where:   { userId: req.dbUserId },
      orderBy: { lastRunAt: 'desc' },
      take:    50,
      include: { agent: { select: { id: true, name: true, avatarUrl: true, role: true } } },
    })
    return reply.send({ commands })
  })

  // DELETE /api/library/:id — remove a saved command
  app.delete('/api/library/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.savedCommand.deleteMany({ where: { id, userId: req.dbUserId } })
    return reply.send({ ok: true })
  })

  // POST /api/library/:id/run — run a saved command immediately
  app.post('/api/library/:id/run', async (req, reply) => {
    const { id }  = req.params as { id: string }
    const userId  = req.dbUserId

    const saved = await prisma.savedCommand.findFirst({
      where: { id, userId },
    })
    if (!saved) return reply.code(404).send({ error: 'Not found' })

    // Delegate to the task creation route logic inline
    const res = await fetch(
      `${process.env.WEB_URL?.replace(':3000', ':4000') ?? 'http://localhost:4000'}/api/tasks`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-user-id': userId },
        body: JSON.stringify({ rawCommand: saved.rawCommand, agentId: saved.agentId }),
      }
    )
    const data = await res.json()
    return reply.code(res.status).send(data)
  })

  // POST /api/library/schedule — schedule a saved command
  app.post('/api/library/schedule', async (req, reply) => {
    const body   = scheduleSchema.parse(req.body)
    const userId = req.dbUserId

    const saved = await prisma.savedCommand.findFirst({
      where: { id: body.savedCommandId, userId },
    })
    if (!saved) return reply.code(404).send({ error: 'Saved command not found' })

    const schedule = await prisma.scheduledRun.create({
      data: {
        userId,
        savedCommandId: body.savedCommandId,
        cronExpr:       body.cronExpr,
        label:          body.label,
      },
    })
    return reply.code(201).send({ schedule })
  })

  // GET /api/library/schedules — list active schedules
  app.get('/api/library/schedules', async (req, reply) => {
    const schedules = await prisma.scheduledRun.findMany({
      where:   { userId: req.dbUserId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { savedCommand: { select: { title: true, rawCommand: true } } },
    })
    return reply.send({ schedules })
  })

  // DELETE /api/library/schedules/:id — cancel a schedule
  app.delete('/api/library/schedules/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.scheduledRun.updateMany({
      where: { id, userId: req.dbUserId },
      data:  { isActive: false },
    })
    return reply.send({ ok: true })
  })
}
