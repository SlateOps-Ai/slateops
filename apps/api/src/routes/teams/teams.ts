import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const createSchema = z.object({
  name: z.string().min(2).max(80),
})

const inviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

const INVITE_TTL_HOURS = 72

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    + '-' + Math.random().toString(36).slice(2, 7)
}

export default async function teamsRoute(app: FastifyInstance) {

  // GET /api/teams — list teams this user belongs to
  app.get('/api/teams', async (req, reply) => {
    const memberships = await prisma.teamMembership.findMany({
      where:   { userId: req.dbUserId },
      include: {
        team: {
          include: {
            memberships: { include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } } },
            _count: { select: { memberships: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })
    return reply.send({ teams: memberships.map((m) => ({ ...m.team, myRole: m.role })) })
  })

  // POST /api/teams — create a new team (caller becomes OWNER)
  app.post('/api/teams', async (req, reply) => {
    const { name } = createSchema.parse(req.body)
    const userId   = req.dbUserId

    const team = await prisma.team.create({
      data: {
        name,
        slug:    makeSlug(name),
        ownerId: userId,
        memberships: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
        },
        _count: { select: { memberships: true } },
      },
    })

    return reply.code(201).send({ team: { ...team, myRole: 'OWNER' } })
  })

  // PATCH /api/teams/:id — rename team (OWNER/ADMIN only)
  app.patch('/api/teams/:id', async (req, reply) => {
    const { id }   = req.params as { id: string }
    const { name } = z.object({ name: z.string().min(2).max(80) }).parse(req.body)

    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: id, userId: req.dbUserId, role: { in: ['OWNER', 'ADMIN'] } },
    })
    if (!membership) return reply.code(403).send({ error: 'Forbidden' })

    const team = await prisma.team.update({ where: { id }, data: { name } })
    return reply.send({ team })
  })

  // DELETE /api/teams/:id — delete team (OWNER only)
  app.delete('/api/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const team = await prisma.team.findFirst({ where: { id, ownerId: req.dbUserId } })
    if (!team) return reply.code(403).send({ error: 'Only the owner can delete a team' })

    await prisma.team.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // POST /api/teams/:id/invite — send invite by email (OWNER/ADMIN)
  app.post('/api/teams/:id/invite', async (req, reply) => {
    const { id }      = req.params as { id: string }
    const { email, role } = inviteSchema.parse(req.body)

    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: id, userId: req.dbUserId, role: { in: ['OWNER', 'ADMIN'] } },
    })
    if (!membership) return reply.code(403).send({ error: 'Forbidden' })

    // If user already exists in the platform, add them directly
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const alreadyMember = await prisma.teamMembership.findFirst({
        where: { teamId: id, userId: existingUser.id },
      })
      if (alreadyMember) return reply.code(409).send({ error: 'User is already a member' })

      await prisma.teamMembership.create({
        data: { teamId: id, userId: existingUser.id, role },
      })
      return reply.code(201).send({ joined: true, userId: existingUser.id })
    }

    // Upsert invite (reset expiry if email already invited)
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)
    const invite = await prisma.teamInvite.upsert({
      where:  { teamId_email: { teamId: id, email } },
      create: { teamId: id, email, role, expiresAt },
      update: { role, expiresAt, usedAt: null },
    })

    const webUrl    = process.env.WEB_URL ?? 'https://slateops.tech'
    const inviteUrl = `${webUrl}/office?teamInvite=${invite.token}`

    // Send invite email — blocking so we can surface delivery failures to the caller
    let emailSent = false
    let emailError: string | null = null
    try {
      const { sendTeamInvite } = await import('../../services/email.service.js')
      const [teamRecord, inviter] = await Promise.all([
        prisma.team.findUnique({ where: { id }, select: { name: true } }),
        prisma.user.findUnique({ where: { id: req.dbUserId }, select: { name: true } }),
      ])
      if (teamRecord && inviter) {
        await sendTeamInvite({
          toEmail:     email,
          teamName:    teamRecord.name,
          inviterName: inviter.name,
          inviteUrl,
        })
        emailSent = true
      }
    } catch (err) {
      emailError = (err as Error).message ?? 'Email delivery failed'
      console.error('[team invite] email send failed:', emailError)
    }

    return reply.code(201).send({
      invite:     { id: invite.id, email, role, expiresAt, inviteUrl },
      emailSent,
      emailError: emailSent ? null : (emailError ?? 'Could not send invite email'),
    })
  })

  // GET /api/teams/invite/:token — accept invite
  app.get('/api/teams/invite/:token', async (req, reply) => {
    const { token } = req.params as { token: string }

    const invite = await prisma.teamInvite.findUnique({
      where:   { token },
      include: { team: { select: { id: true, name: true } } },
    })

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Invite expired or already used' })
    }

    const alreadyMember = await prisma.teamMembership.findFirst({
      where: { teamId: invite.teamId, userId: req.dbUserId },
    })

    if (!alreadyMember) {
      await prisma.teamMembership.create({
        data: { teamId: invite.teamId, userId: req.dbUserId, role: invite.role },
      })
    }

    await prisma.teamInvite.update({
      where: { token },
      data:  { usedAt: new Date() },
    })

    return reply.send({ team: invite.team, joined: !alreadyMember })
  })

  // PATCH /api/teams/:id/members/:userId — change member role (OWNER only)
  app.patch('/api/teams/:id/members/:userId', async (req, reply) => {
    const { id, userId: targetId } = req.params as { id: string; userId: string }
    const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) }).parse(req.body)

    const team = await prisma.team.findFirst({ where: { id, ownerId: req.dbUserId } })
    if (!team) return reply.code(403).send({ error: 'Only the owner can change roles' })

    await prisma.teamMembership.update({
      where: { teamId_userId: { teamId: id, userId: targetId } },
      data:  { role },
    })
    return reply.send({ ok: true })
  })

  // DELETE /api/teams/:id/members/:userId — remove member (OWNER/ADMIN, or self-leave)
  app.delete('/api/teams/:id/members/:userId', async (req, reply) => {
    const { id, userId: targetId } = req.params as { id: string; userId: string }
    const callerId = req.dbUserId

    // Self-leave always allowed (except owner)
    if (targetId === callerId) {
      const team = await prisma.team.findFirst({ where: { id, ownerId: callerId } })
      if (team) return reply.code(400).send({ error: 'Owner cannot leave — transfer ownership or delete the team' })
    } else {
      const adminCheck = await prisma.teamMembership.findFirst({
        where: { teamId: id, userId: callerId, role: { in: ['OWNER', 'ADMIN'] } },
      })
      if (!adminCheck) return reply.code(403).send({ error: 'Forbidden' })
    }

    await prisma.teamMembership.deleteMany({ where: { teamId: id, userId: targetId } })
    return reply.send({ ok: true })
  })
}
