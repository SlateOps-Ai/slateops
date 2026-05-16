import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ComposioToolSet } from 'composio-core'
import { prisma } from '../../lib/prisma.js'
import { INTEGRATION_CATALOG, findCatalogApp, appsForRoles } from '@agentcity/types'
import type { AgentRole } from '@agentcity/types'
import { callAnthropic } from '../../lib/llm-usage.js'
import Anthropic from '@anthropic-ai/sdk'

// Legacy enum → Composio app name. New code stores composioAppName directly;
// this only matters for the 5 providers that pre-date the catalog.
const LEGACY_PROVIDER_MAP: Record<string, string> = {
  GMAIL:           'gmail',
  GOOGLE_CALENDAR: 'google_calendar',
  SLACK:           'slack',
  NOTION:          'notion',
  LINEAR:          'linear',
}

function appNameToLegacyEnum(appName: string): string {
  switch (appName) {
    case 'gmail':           return 'GMAIL'
    case 'google_calendar': return 'GOOGLE_CALENDAR'
    case 'slack':           return 'SLACK'
    case 'notion':          return 'NOTION'
    case 'linear':          return 'LINEAR'
    default:                return 'OTHER'
  }
}

export default async function integrationsRoute(app: FastifyInstance) {

  // ── Catalog ──────────────────────────────────────────────────────────────
  // GET /api/integrations/catalog — static list of all apps we can connect
  app.get('/api/integrations/catalog', async (_req, reply) => {
    return reply.send({ apps: INTEGRATION_CATALOG })
  })

  // ── Connections (account-level OAuth) ────────────────────────────────────

  // GET /api/integrations/connections — list user's active connections
  app.get('/api/integrations/connections', async (req, reply) => {
    const userId = req.dbUserId
    const rows = await prisma.integration.findMany({
      where:  { userId, isActive: true },
      select: {
        id: true, provider: true, composioAppName: true,
        composioConnectionId: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    const connections = rows.map((r) => {
      const appName = r.composioAppName ?? LEGACY_PROVIDER_MAP[r.provider]
      const catalog = appName ? findCatalogApp(appName) : undefined
      return {
        id:               r.id,
        composioAppName:  appName ?? 'unknown',
        label:            catalog?.label       ?? appName ?? 'Unknown',
        emoji:            catalog?.emoji       ?? '🔌',
        description:      catalog?.description ?? '',
        connectedAt:      r.createdAt,
      }
    })
    return reply.send({ connections })
  })

  // POST /api/integrations/connect — initiate Composio OAuth for any app
  // Returns { redirectUrl } that the browser opens (usually in a popup).
  const connectSchema = z.object({
    composioAppName: z.string().min(1),
  })
  app.post('/api/integrations/connect', async (req, reply) => {
    const { composioAppName } = connectSchema.parse(req.body)
    const userId = req.dbUserId

    const catalog = findCatalogApp(composioAppName)
    if (!catalog) {
      return reply.code(400).send({ error: 'Unknown app', composioAppName })
    }

    const toolset = new ComposioToolSet({ apiKey: process.env.COMPOSIO_API_KEY })
    const entity  = toolset.client.getEntity(userId)

    const callbackUrl = `${process.env.WEB_URL ?? 'http://localhost:3000'}/oauth-callback?connected=${composioAppName}`

    try {
      // Composio's new Platform requires an Auth Config (formerly "Integration")
      // per app. We discover the user's auth config dynamically.
      let integrationId: string | undefined
      let lookupRaw: any
      try {
        lookupRaw = await toolset.client.integrations.list({ appUniqueKeys: [composioAppName] } as any)
        // eslint-disable-next-line no-console
        console.log('[connect] integrations.list raw:', JSON.stringify(lookupRaw).slice(0, 500))
        const items = (lookupRaw as any)?.items ?? (lookupRaw as any) ?? []
        // eslint-disable-next-line no-console
        console.log('[connect] integrations.list items count:', Array.isArray(items) ? items.length : 'not-array')
        const active = (items as any[]).find((i: any) =>
          (i.appName?.toLowerCase?.() === composioAppName ||
           i.appUniqueKey === composioAppName ||
           i.app_name?.toLowerCase?.() === composioAppName) &&
          i.enabled !== false
        )
        integrationId = active?.id
        // eslint-disable-next-line no-console
        console.log('[connect] resolved integrationId for', composioAppName, '=', integrationId)
      } catch (lookupErr) {
        // eslint-disable-next-line no-console
        console.error('[connect] integrations.list FAILED for', composioAppName, ':', (lookupErr as Error).message)
      }

      const params = integrationId
        ? { integrationId, redirectUri: callbackUrl }
        : { appName: composioAppName, redirectUri: callbackUrl }
      // eslint-disable-next-line no-console
      console.log('[connect] calling initiateConnection with', JSON.stringify(params))

      const connection = await entity.initiateConnection(params)
      // eslint-disable-next-line no-console
      console.log('[connect] initiateConnection OK, redirectUrl=', (connection as any)?.redirectUrl)
      return reply.send({ redirectUrl: connection.redirectUrl })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[connect] initiateConnection threw:', err)
      return reply.code(502).send({
        error:  'Could not initiate OAuth',
        detail: (err as Error).message,
        hint:   `Make sure an Auth Config is set up for "${composioAppName}" in the Composio dashboard (Toolkits → ${composioAppName} → Add to Project).`,
      })
    }
  })

  // POST /api/integrations/callback — fired from the front-end after the
  // OAuth popup closes. Records the connection. Auto-creates grants for any
  // currently-pending grant requests on this app.
  app.post('/api/integrations/callback', async (req, reply) => {
    const { composioAppName } = z.object({ composioAppName: z.string() }).parse(req.body)
    const userId = req.dbUserId

    const catalog = findCatalogApp(composioAppName)
    if (!catalog) return reply.code(400).send({ error: 'Unknown app' })

    const providerEnum = appNameToLegacyEnum(composioAppName) as any

    // Upsert by (userId, composioAppName) — Composio holds the actual token.
    const integration = await prisma.integration.upsert({
      where:  { userId_composioAppName: { userId, composioAppName } },
      update: { isActive: true, updatedAt: new Date() },
      create: {
        userId,
        provider:             providerEnum,
        composioAppName,
        accessToken:          'composio-managed',
        scopes:               [],
        isActive:             true,
        composioConnectionId: userId,
      },
    })

    // Auto-grant to any agent that had a pending request for this app.
    const pending = await prisma.integrationGrantRequest.findMany({
      where: { composioAppName, status: 'PENDING', agent: { userId } },
      include: { agent: { select: { id: true } } },
    })
    for (const pr of pending) {
      await prisma.agentIntegrationGrant.upsert({
        where:  { agentId_integrationId: { agentId: pr.agentId, integrationId: integration.id } },
        update: { mode: 'ALWAYS' },
        create: { agentId: pr.agentId, integrationId: integration.id, mode: 'ALWAYS', scopes: [] },
      })
      await prisma.integrationGrantRequest.update({
        where: { id: pr.id },
        data:  { status: 'GRANTED_ALWAYS', resolvedAt: new Date() },
      })
    }

    return reply.send({ ok: true, composioAppName, autoGrantedAgents: pending.length })
  })

  // DELETE /api/integrations/connections/:id — disconnect
  app.delete('/api/integrations/connections/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const integ = await prisma.integration.findUnique({ where: { id } })
    if (!integ || integ.userId !== userId) return reply.code(404).send({ error: 'Not found' })

    await prisma.integration.update({
      where: { id },
      data:  { isActive: false },
    })
    return reply.send({ ok: true })
  })

  // Back-compat GET /api/integrations/status (the existing onboarding code reads this)
  app.get('/api/integrations/status', async (req, reply) => {
    const userId = req.dbUserId
    const rows = await prisma.integration.findMany({
      where:  { userId, isActive: true },
      select: { provider: true, composioAppName: true },
    })
    const connected = Array.from(new Set(rows.map((r) =>
      r.composioAppName ?? (LEGACY_PROVIDER_MAP[r.provider] ?? r.provider.toLowerCase())
    )))
    return reply.send({ connected })
  })

  // ── Grants (per-agent permissions) ───────────────────────────────────────

  // GET /api/integrations/grants — current user's grants across all agents
  app.get('/api/integrations/grants', async (req, reply) => {
    const userId = req.dbUserId
    const grants = await prisma.agentIntegrationGrant.findMany({
      where: { agent: { userId } },
      select: {
        id: true, agentId: true, integrationId: true, mode: true,
        scopes: true, grantedAt: true, lastUsedAt: true,
        integration: { select: { composioAppName: true, provider: true } },
        agent:       { select: { name: true, role: true } },
      },
      orderBy: { grantedAt: 'desc' },
    })
    return reply.send({ grants })
  })

  // POST /api/integrations/grants — grant an agent access to a connection
  app.post('/api/integrations/grants', async (req, reply) => {
    const body = z.object({
      agentId:         z.string(),
      composioAppName: z.string(),
      mode:            z.enum(['ALWAYS', 'ASK_EACH']).optional(),
    }).parse(req.body)
    const userId = req.dbUserId

    const [agent, integration] = await Promise.all([
      prisma.agent.findUnique({ where: { id: body.agentId } }),
      prisma.integration.findUnique({
        where: { userId_composioAppName: { userId, composioAppName: body.composioAppName } },
      }),
    ])
    if (!agent || agent.userId !== userId) return reply.code(404).send({ error: 'Agent not found' })
    if (!integration)                       return reply.code(404).send({ error: 'Integration not connected yet' })

    const grant = await prisma.agentIntegrationGrant.upsert({
      where:  { agentId_integrationId: { agentId: body.agentId, integrationId: integration.id } },
      update: { mode: body.mode ?? 'ALWAYS' },
      create: {
        agentId:       body.agentId,
        integrationId: integration.id,
        mode:          body.mode ?? 'ALWAYS',
        scopes:        [],
      },
    })

    // Resolve any pending requests for this (agent, app) pair
    await prisma.integrationGrantRequest.updateMany({
      where: { agentId: body.agentId, composioAppName: body.composioAppName, status: 'PENDING' },
      data:  { status: 'GRANTED_ALWAYS', resolvedAt: new Date() },
    })

    return reply.send({ ok: true, grant })
  })

  // DELETE /api/integrations/grants/:id — revoke
  app.delete('/api/integrations/grants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const grant = await prisma.agentIntegrationGrant.findUnique({
      where: { id },
      include: { agent: { select: { userId: true } } },
    })
    if (!grant || grant.agent.userId !== userId) return reply.code(404).send({ error: 'Not found' })

    await prisma.agentIntegrationGrant.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ── Grant requests (in-flight agent asks) ────────────────────────────────

  // GET /api/integrations/requests — pending requests for this user's agents
  app.get('/api/integrations/requests', async (req, reply) => {
    const userId = req.dbUserId
    const rows = await prisma.integrationGrantRequest.findMany({
      where: { agent: { userId }, status: 'PENDING' },
      select: {
        id: true, agentId: true, composioAppName: true,
        toolName: true, reason: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    // Annotate with whether the app is already connected (drives the bubble actions)
    const connectedApps = new Set(
      (await prisma.integration.findMany({
        where: { userId, isActive: true },
        select: { composioAppName: true, provider: true },
      })).map((r) => r.composioAppName ?? LEGACY_PROVIDER_MAP[r.provider] ?? null).filter(Boolean) as string[]
    )
    const requests = rows.map((r) => {
      const catalog = findCatalogApp(r.composioAppName)
      return {
        ...r,
        label:        catalog?.label ?? r.composioAppName,
        emoji:        catalog?.emoji ?? '🔌',
        isAppConnected: connectedApps.has(r.composioAppName),
      }
    })
    return reply.send({ requests })
  })

  // POST /api/integrations/requests/:id/respond — handle a grant prompt
  app.post('/api/integrations/requests/:id/respond', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { action } = z.object({
      action: z.enum(['grant_once', 'grant_always', 'deny']),
    }).parse(req.body)
    const userId = req.dbUserId

    const reqRow = await prisma.integrationGrantRequest.findUnique({
      where: { id },
      include: { agent: { select: { userId: true } } },
    })
    if (!reqRow || reqRow.agent.userId !== userId) {
      return reply.code(404).send({ error: 'Not found' })
    }

    if (action === 'deny') {
      await prisma.integrationGrantRequest.update({
        where: { id },
        data:  { status: 'DENIED', resolvedAt: new Date() },
      })
      return reply.send({ ok: true })
    }

    // Grant requires the connection to exist already
    const integration = await prisma.integration.findUnique({
      where: { userId_composioAppName: { userId, composioAppName: reqRow.composioAppName } },
    })
    if (!integration) {
      return reply.code(409).send({ error: 'Connect the app first', composioAppName: reqRow.composioAppName })
    }

    await prisma.agentIntegrationGrant.upsert({
      where:  { agentId_integrationId: { agentId: reqRow.agentId, integrationId: integration.id } },
      update: { mode: action === 'grant_always' ? 'ALWAYS' : 'ASK_EACH' },
      create: {
        agentId:       reqRow.agentId,
        integrationId: integration.id,
        mode:          action === 'grant_always' ? 'ALWAYS' : 'ASK_EACH',
        scopes:        [],
      },
    })
    await prisma.integrationGrantRequest.update({
      where: { id },
      data:  {
        status:     action === 'grant_always' ? 'GRANTED_ALWAYS' : 'GRANTED_ONCE',
        resolvedAt: new Date(),
      },
    })
    return reply.send({ ok: true })
  })

  // ── Suggest (LLM picks apps from the onboarding intake) ──────────────────

  // POST /api/integrations/suggest — returns 3-5 likely-needed apps
  app.post('/api/integrations/suggest', async (req, reply) => {
    const userId = req.dbUserId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })
    const intake = (user?.settings as any)?.onboardingIntake ?? {}
    const business: string  = intake.businessDescription ?? ''
    const pain:     string  = intake.topPainPoint ?? ''
    const agents = ((user?.settings as any)?.onboardingIntake?.composedAgents ?? []) as Array<{ role: string; name: string }>

    if (!business && !pain) {
      // Fall back to a sensible default trio when there's no intake yet
      return reply.send({ suggestions: ['gmail', 'google_calendar', 'slack'] })
    }

    // Keyword fallback used if the LLM call fails or is unavailable
    function keywordFallback(): string[] {
      const text = `${business} ${pain}`.toLowerCase()
      const hits: string[] = []
      const addIf = (k: string, app: string) => { if (text.includes(k) && !hits.includes(app)) hits.push(app) }
      addIf('crm',         'hubspot')
      addIf('salesforce',  'salesforce')
      addIf('hubspot',     'hubspot')
      addIf('support',     'zendesk')
      addIf('ticket',      'zendesk')
      addIf('shopify',     'shopify')
      addIf('ecommerce',   'shopify')
      addIf('invoice',     'quickbooks')
      addIf('accounting',  'quickbooks')
      addIf('slack',       'slack')
      addIf('email',       'gmail')
      addIf('schedule',    'google_calendar')
      addIf('linkedin',    'linkedin')
      addIf('content',     'linkedin')
      addIf('twitter',     'twitter')
      // Always include the core trio if we have fewer than 3
      for (const fallback of ['gmail', 'google_calendar', 'slack']) {
        if (hits.length >= 4) break
        if (!hits.includes(fallback)) hits.push(fallback)
      }
      return hits.slice(0, 5)
    }

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      // Constrain the menu to apps that any of the composed agents could plausibly use.
      const roles = agents.map((a) => a.role as AgentRole).filter(Boolean)
      const allowed = appsForRoles(roles)
      const catalog = allowed.map((a) => `${a.composioAppName} — ${a.label} (${a.description})`).join('\n')
      const resp: any = await callAnthropic(
        client,
        {
          model:     'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system:    'You suggest SaaS apps to connect for an AI-agent business assistant. Output ONLY the JSON tool call, no prose.',
          messages:  [{
            role: 'user',
            content: [
              `Business: ${business}`,
              `Top pain point: ${pain}`,
              `Roles being set up: ${agents.map((a) => a.role).join(', ') || 'general'}`,
              '',
              'Catalog of connectable apps (use the lowercase id on the left):',
              catalog,
              '',
              'Pick 3 to 5 apps the user is most likely to need on day one. Prefer free/common tools (Gmail, Calendar, Slack) and CRM/commerce only if relevant to their business.',
            ].join('\n'),
          }],
          tools: [{
            name: 'suggest_apps',
            description: 'Return suggested Composio app ids.',
            input_schema: {
              type: 'object' as const,
              properties: {
                appIds: { type: 'array', items: { type: 'string' }, description: 'Composio app ids from the catalog (lowercase).' },
              },
              required: ['appIds'],
            },
          }],
          tool_choice: { type: 'tool', name: 'suggest_apps' },
        },
        { userId, endpoint: 'integrations/suggest' }
      )
      const block = (resp.content as any[]).find((b: any) => b.type === 'tool_use')
      const raw   = (block?.input as { appIds?: string[] } | undefined)?.appIds ?? []
      // Re-validate against the role-constrained allowed set so a misbehaving
      // LLM can't suggest off-role apps even if it tries.
      const allowedNames = new Set(allowed.map((a) => a.composioAppName))
      const valid = raw.filter((id) => allowedNames.has(id)).slice(0, 5)
      if (valid.length === 0) return reply.send({ suggestions: keywordFallback() })
      return reply.send({ suggestions: valid })
    } catch {
      return reply.send({ suggestions: keywordFallback() })
    }
  })
}
