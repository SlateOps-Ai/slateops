import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { encrypt, decryptByokKey } from '../../lib/crypto.js'

function inferProvider(key: string): string {
  if (key.startsWith('sk-ant-')) return 'ANTHROPIC'
  if (key.startsWith('sk-'))     return 'OPENAI'
  return 'GEMINI'
}

function maskKey(byok: string | null): string | null {
  const plain = decryptByokKey(byok)
  return plain ? `***...${plain.slice(-6)}` : null
}

const patchSchema = z.object({
  byokKey:             z.string().min(10).max(300).nullable().optional(),
  byokProvider:        z.enum(['ANTHROPIC', 'OPENAI', 'GEMINI']).optional(),
  name:                z.string().min(1).max(100).optional(),
  weeklyDigestEnabled: z.boolean().optional(),
  dailyBriefEnabled:   z.boolean().optional(),
  onboardingDone:      z.boolean().optional(),
})

export default async function settingsRoute(app: FastifyInstance) {
  app.get('/api/user/settings', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where:  { id: req.dbUserId },
      select: {
        id: true, name: true, email: true,
        plan: true, creditsRemaining: true,
        byokKey: true, byokProvider: true,
        weeklyDigestEnabled: true, onboardingDone: true, settings: true,
      },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })

    const raw = (user.settings as any) ?? {}

    return reply.send({
      settings: {
        ...user,
        settings:             undefined,
        byokKey:              maskKey(user.byokKey),
        byokConfigured:       !!user.byokKey,
        byokProvider:         user.byokProvider ?? null,
        dailyBriefEnabled:    raw.dailyBriefEnabled ?? false,
        onboardingIntakeDone: !!raw.onboardingIntake,
      },
    })
  })

  app.patch('/api/user/settings', async (req, reply) => {
    const body = patchSchema.parse(req.body)

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.weeklyDigestEnabled !== undefined) data.weeklyDigestEnabled = body.weeklyDigestEnabled
    if (body.onboardingDone !== undefined) data.onboardingDone = body.onboardingDone

    // dailyBriefEnabled lives in the settings JSON field
    if (body.dailyBriefEnabled !== undefined) {
      const existing = await prisma.user.findUnique({ where: { id: req.dbUserId }, select: { settings: true } })
      const raw = (existing?.settings as any) ?? {}
      data.settings = { ...raw, dailyBriefEnabled: body.dailyBriefEnabled }
    }
    if (body.byokKey !== undefined) {
      data.byokKey = encrypt(body.byokKey)
      if (!body.byokKey) {
        data.byokProvider = null
      } else {
        data.byokProvider = body.byokProvider ?? inferProvider(body.byokKey)
      }
    } else if (body.byokProvider !== undefined) {
      data.byokProvider = body.byokProvider
    }

    const user = await prisma.user.update({
      where:  { id: req.dbUserId },
      data,
      select: {
        id: true, name: true, email: true,
        plan: true, creditsRemaining: true,
        byokKey: true, weeklyDigestEnabled: true, settings: true,
      },
    })

    const updatedRaw = (user.settings as any) ?? {}

    return reply.send({
      settings: {
        ...user,
        settings:          undefined,
        byokKey:           maskKey(user.byokKey),
        byokConfigured:    !!user.byokKey,
        dailyBriefEnabled: updatedRaw.dailyBriefEnabled ?? false,
      },
    })
  })
}
