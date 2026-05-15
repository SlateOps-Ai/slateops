import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { publishPost, getConnectionStatus, getOAuthUrl, COMPOSIO_APP_NAME, type SocialAccountInfo } from '../../services/social.service.js'

const SUPPORTED_PLATFORMS = ['TWITTER', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'THREADS', 'PINTEREST'] as const

const createSchema = z.object({
  content:     z.string().min(1).max(5000),
  platforms:   z.array(z.enum(SUPPORTED_PLATFORMS)).min(1),
  scheduledAt: z.string().datetime().optional(),
  mediaUrls:   z.array(z.string().url()).optional().default([]),
  agentId:     z.string().uuid().optional(),
})

const updateSchema = z.object({
  content:     z.string().min(1).max(5000).optional(),
  platforms:   z.array(z.enum(SUPPORTED_PLATFORMS)).min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  mediaUrls:   z.array(z.string().url()).optional(),
})

export default async function contentPostsRoute(app: FastifyInstance) {

  // GET /api/content/posts — list this user's scheduled posts
  app.get('/api/content/posts', async (req, reply) => {
    const { status, agentId, limit = '50', offset = '0' } = req.query as Record<string, string>

    const posts = await prisma.scheduledPost.findMany({
      where:   {
        userId: req.dbUserId,
        ...(status  ? { status: status as any } : {}),
        ...(agentId ? { agentId }               : {}),
      },
      orderBy: { scheduledAt: 'desc' },
      take:    Math.min(Number(limit), 100),
      skip:    Number(offset),
    })

    return reply.send({ posts })
  })

  // POST /api/content/posts — create a scheduled (or immediate) post
  app.post('/api/content/posts', async (req, reply) => {
    const body = createSchema.parse(req.body)
    const userId = req.dbUserId

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date()
    const isImmediate = !body.scheduledAt || scheduledAt <= new Date(Date.now() + 5_000)

    if (body.agentId) {
      const agent = await prisma.agent.findFirst({ where: { id: body.agentId, userId } })
      if (!agent) return reply.code(403).send({ error: 'Agent not found' })
    }

    const post = await prisma.scheduledPost.create({
      data: {
        userId,
        agentId:     body.agentId ?? null,
        platforms:   body.platforms,
        content:     body.content,
        mediaUrls:   body.mediaUrls,
        scheduledAt,
        status:      isImmediate ? 'PUBLISHING' : 'SCHEDULED',
      },
    })

    // If posting immediately, publish now and update
    if (isImmediate) {
      const results = await publishPost(userId, body.platforms, body.content, body.mediaUrls)
      const anySuccess = results.some((r) => r.success)
      const updated = await prisma.scheduledPost.update({
        where: { id: post.id },
        data:  {
          status:      anySuccess ? 'PUBLISHED' : 'FAILED',
          publishedAt: anySuccess ? new Date() : undefined,
          failReason:  anySuccess
            ? null
            : results.map((r) => `${r.platform}: ${r.error}`).join('; '),
          results: results as any,
        },
      })
      return reply.code(201).send({ post: updated, results })
    }

    return reply.code(201).send({ post })
  })

  // PATCH /api/content/posts/:id — edit a DRAFT or SCHEDULED post
  app.patch('/api/content/posts/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = updateSchema.parse(req.body)

    const post = await prisma.scheduledPost.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!post) return reply.code(404).send({ error: 'Post not found' })
    if (!['DRAFT', 'SCHEDULED'].includes(post.status)) {
      return reply.code(400).send({ error: 'Only DRAFT or SCHEDULED posts can be edited' })
    }

    const updated = await prisma.scheduledPost.update({
      where: { id },
      data:  {
        ...(body.content     ? { content: body.content }                 : {}),
        ...(body.platforms   ? { platforms: body.platforms }             : {}),
        ...(body.scheduledAt ? { scheduledAt: new Date(body.scheduledAt) } : {}),
        ...(body.mediaUrls   ? { mediaUrls: body.mediaUrls }             : {}),
      },
    })
    return reply.send({ post: updated })
  })

  // DELETE /api/content/posts/:id — cancel / delete a post
  app.delete('/api/content/posts/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const post = await prisma.scheduledPost.findFirst({
      where: { id, userId: req.dbUserId },
    })
    if (!post) return reply.code(404).send({ error: 'Post not found' })

    if (['PUBLISHED', 'PUBLISHING'].includes(post.status)) {
      await prisma.scheduledPost.update({ where: { id }, data: { status: 'CANCELLED' } })
    } else {
      await prisma.scheduledPost.delete({ where: { id } })
    }

    return reply.send({ ok: true })
  })

  // POST /api/content/posts/:id/publish — manually trigger publish for a SCHEDULED post
  app.post('/api/content/posts/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const post = await prisma.scheduledPost.findFirst({
      where: { id, userId },
    })
    if (!post) return reply.code(404).send({ error: 'Post not found' })
    if (!['SCHEDULED', 'DRAFT', 'FAILED'].includes(post.status)) {
      return reply.code(400).send({ error: 'Post cannot be published in its current state' })
    }

    await prisma.scheduledPost.update({ where: { id }, data: { status: 'PUBLISHING' } })
    const results = await publishPost(userId, post.platforms, post.content, post.mediaUrls)
    const anySuccess = results.some((r) => r.success)
    const updated = await prisma.scheduledPost.update({
      where: { id },
      data:  {
        status:      anySuccess ? 'PUBLISHED' : 'FAILED',
        publishedAt: anySuccess ? new Date() : undefined,
        failReason:  anySuccess
          ? null
          : results.map((r) => `${r.platform}: ${r.error}`).join('; '),
        results: results as any,
      },
    })

    return reply.send({ post: updated, results })
  })

  // GET /api/content/social/status — check which platforms are connected + their handles
  app.get('/api/content/social/status', async (req, reply) => {
    const accounts: Record<string, SocialAccountInfo> = await getConnectionStatus(req.dbUserId, [...SUPPORTED_PLATFORMS])
    return reply.send({ accounts })
  })

  // POST /api/content/social/connect — get OAuth URL for a platform
  app.post('/api/content/social/connect', async (req, reply) => {
    const { platform } = z.object({ platform: z.enum(SUPPORTED_PLATFORMS) }).parse(req.body)
    const webUrl = process.env.WEB_URL ?? 'https://slateops.tech'
    try {
      const redirectUrl = await getOAuthUrl(req.dbUserId, platform, webUrl)
      return reply.send({ redirectUrl })
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to generate connection URL'
      // Surface both the error and a direct Composio dashboard fallback link
      const appName = COMPOSIO_APP_NAME[platform.toUpperCase()] ?? platform.toLowerCase()
      return reply.code(502).send({
        error: msg,
        composioFallbackUrl: `https://app.composio.dev/apps/${appName}`,
      })
    }
  })
}
