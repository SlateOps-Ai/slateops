import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fetchMcpTools } from '../../lib/mcp.js'

// ── Pre-built catalog ──────────────────────────────────────────────────────────

export const MCP_CATALOG = [
  {
    id:          'github',
    name:        'GitHub',
    description: 'Search repos, create issues, open PRs, read file contents',
    url:         'https://mcp.github.com',
    category:    'developer',
    icon:        'github',
  },
  {
    id:          'slack',
    name:        'Slack',
    description: 'Post messages, read channels, search conversations',
    url:         'https://mcp.slack.com',
    category:    'communication',
    icon:        'slack',
  },
  {
    id:          'notion',
    name:        'Notion',
    description: 'Read/write pages, create databases, query blocks',
    url:         'https://mcp.notion.com',
    category:    'productivity',
    icon:        'notion',
  },
  {
    id:          'linear',
    name:        'Linear',
    description: 'Create issues, update status, assign team members',
    url:         'https://mcp.linear.app',
    category:    'project',
    icon:        'linear',
  },
  {
    id:          'gdrive',
    name:        'Google Drive',
    description: 'Read docs, sheets, slides — search and summarise files',
    url:         'https://mcp.google.com/drive',
    category:    'productivity',
    icon:        'gdrive',
  },
  {
    id:          'postgres',
    name:        'Postgres',
    description: 'Run read-only SQL queries against your own database',
    url:         'https://mcp.supabase.com/postgres',
    category:    'data',
    icon:        'postgres',
  },
  {
    id:          'jira',
    name:        'Jira',
    description: 'Manage sprints, create tickets, update issue status',
    url:         'https://mcp.atlassian.com/jira',
    category:    'project',
    icon:        'jira',
  },
  {
    id:          'hubspot',
    name:        'HubSpot',
    description: 'Search contacts, create deals, update CRM records',
    url:         'https://mcp.hubspot.com',
    category:    'crm',
    icon:        'hubspot',
  },
  {
    id:          'airtable',
    name:        'Airtable',
    description: 'Query bases, create records, update fields in any table',
    url:         'https://mcp.airtable.com',
    category:    'data',
    icon:        'airtable',
  },
  {
    id:          'zapier',
    name:        'Zapier',
    description: 'Trigger any Zap — connect 6 000+ apps via natural language',
    url:         'https://mcp.zapier.com',
    category:    'automation',
    icon:        'zapier',
  },
] as const

// ── Validation ─────────────────────────────────────────────────────────────────

const AddServerSchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  url:         z.string().url(),
  authHeader:  z.string().optional(),
})

// ── Routes ─────────────────────────────────────────────────────────────────────

export default async function mcpCatalogRoute(app: FastifyInstance) {

  // GET /api/mcp/catalog — pre-built server catalog
  app.get('/api/mcp/catalog', async (_req, reply) => {
    return reply.send({ catalog: MCP_CATALOG })
  })

  // GET /api/mcp/servers — user's connected servers
  app.get('/api/mcp/servers', async (req, reply) => {
    const userId = req.dbUserId
    const servers = await prisma.mcpServer.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ servers })
  })

  // POST /api/mcp/servers — connect a new server (custom URL)
  app.post('/api/mcp/servers', async (req, reply) => {
    const userId = req.dbUserId
    const body   = AddServerSchema.parse(req.body)

    // Probe the server to fetch its tool list
    let tools: Awaited<ReturnType<typeof fetchMcpTools>> = []
    let toolCount = 0
    let lastTestedAt: Date | undefined

    try {
      tools        = await fetchMcpTools(body.url, body.authHeader)
      toolCount    = tools.length
      lastTestedAt = new Date()
    } catch {
      // Allow adding even if probe fails; user can re-test later
    }

    const server = await prisma.mcpServer.create({
      data: {
        userId,
        name:        body.name,
        description: body.description ?? null,
        url:         body.url,
        authHeader:  body.authHeader ?? null,
        tools:       tools as any,
        toolCount,
        lastTestedAt: lastTestedAt ?? null,
      },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'CONNECT_MCP', server.id))
      .catch(() => {})

    return reply.code(201).send({ server })
  })

  // POST /api/mcp/servers/from-catalog — quick-connect a catalog entry
  app.post('/api/mcp/servers/from-catalog', async (req, reply) => {
    const userId    = req.dbUserId
    const { catalogId, authHeader } = req.body as { catalogId: string; authHeader?: string }

    const entry = MCP_CATALOG.find((c) => c.id === catalogId)
    if (!entry) return reply.code(404).send({ error: 'Catalog entry not found' })

    // Upsert by (userId, url)
    const existing = await prisma.mcpServer.findFirst({ where: { userId, url: entry.url } })
    if (existing) return reply.code(409).send({ error: 'Already connected', server: existing })

    let tools: Awaited<ReturnType<typeof fetchMcpTools>> = []
    let toolCount = 0
    let lastTestedAt: Date | undefined
    try {
      tools        = await fetchMcpTools(entry.url, authHeader)
      toolCount    = tools.length
      lastTestedAt = new Date()
    } catch { /* best-effort */ }

    const server = await prisma.mcpServer.create({
      data: {
        userId,
        name:        entry.name,
        description: entry.description,
        url:         entry.url,
        authHeader:  authHeader ?? null,
        tools:       tools as any,
        toolCount,
        lastTestedAt: lastTestedAt ?? null,
      },
    })

    import('../../services/gamification.service.js')
      .then(({ awardXp }) => awardXp(userId, 'CONNECT_MCP', server.id))
      .catch(() => {})

    return reply.code(201).send({ server })
  })

  // POST /api/mcp/servers/:id/test — re-probe and refresh tool list
  app.post('/api/mcp/servers/:id/test', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const server = await prisma.mcpServer.findFirst({ where: { id, userId } })
    if (!server) return reply.code(404).send({ error: 'Server not found' })

    try {
      const tools = await fetchMcpTools(server.url, server.authHeader)
      await prisma.mcpServer.update({
        where: { id },
        data:  { tools: tools as any, toolCount: tools.length, lastTestedAt: new Date(), isActive: true },
      })
      return reply.send({ ok: true, toolCount: tools.length, tools })
    } catch (err: any) {
      await prisma.mcpServer.update({ where: { id }, data: { isActive: false, lastTestedAt: new Date() } })
      return reply.code(502).send({ ok: false, error: err.message })
    }
  })

  // DELETE /api/mcp/servers/:id — disconnect a server
  app.delete('/api/mcp/servers/:id', async (req, reply) => {
    const userId = req.dbUserId
    const { id } = req.params as { id: string }

    const server = await prisma.mcpServer.findFirst({ where: { id, userId } })
    if (!server) return reply.code(404).send({ error: 'Server not found' })

    await prisma.mcpServer.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}
