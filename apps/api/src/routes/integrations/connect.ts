import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ComposioToolSet } from 'composio-core'
import { prisma } from '../../lib/prisma.js'

// Composio app names → our IntegrationProvider enum
const PROVIDER_MAP: Record<string, string> = {
  gmail:            'GMAIL',
  google_calendar:  'GOOGLE_CALENDAR',
  slack:            'SLACK',
}

const connectSchema = z.object({
  provider: z.enum(['gmail', 'google_calendar', 'slack']),
})

export default async function integrationsRoute(app: FastifyInstance) {

  // POST /api/integrations/connect
  // Returns a Composio OAuth redirect URL
  app.post('/api/integrations/connect', async (req, reply) => {
    const { provider } = connectSchema.parse(req.body)
    const userId = req.dbUserId

    const toolset = new ComposioToolSet({ apiKey: process.env.COMPOSIO_API_KEY })

    // Each user gets their own Composio entity (stable ID = our db userId)
    const entity = toolset.client.getEntity(userId)

    const callbackUrl = `${process.env.WEB_URL ?? 'http://localhost:3000'}/onboarding?connected=${provider}`

    const connection = await entity.initiateConnection({
      appName:     provider,
      redirectUri: callbackUrl,
    })

    return reply.send({ redirectUrl: connection.redirectUrl })
  })

  // GET /api/integrations/status
  // Returns list of providers the user has connected
  app.get('/api/integrations/status', async (req, reply) => {
    const userId = req.dbUserId

    const integrations = await prisma.integration.findMany({
      where:  { userId, isActive: true },
      select: { provider: true, createdAt: true },
    })

    const toolset = new ComposioToolSet({ apiKey: process.env.COMPOSIO_API_KEY })
    const entity  = toolset.client.getEntity(userId)

    // Also check live status from Composio
    let composioConnected: string[] = []
    try {
      const accounts = await entity.getConnections()
      composioConnected = (accounts as any[]).map((a) => a.appName?.toLowerCase() ?? '')
    } catch {
      // Composio unreachable — fall back to DB
    }

    const dbProviders = integrations.map(i => i.provider.toLowerCase())

    // Union of DB record + Composio live status
    const connected = [...new Set([...dbProviders, ...composioConnected])]

    return reply.send({ connected })
  })

  // POST /api/integrations/callback
  // Called by our frontend after Composio redirects back with ?connected=<provider>
  // Records the connection in our DB
  app.post('/api/integrations/callback', async (req, reply) => {
    const { provider } = z.object({ provider: z.string() }).parse(req.body)
    const userId = req.dbUserId

    const dbProvider = PROVIDER_MAP[provider.toLowerCase()]
    if (!dbProvider) return reply.code(400).send({ error: 'Unknown provider' })

    // Upsert integration record — Composio manages the token, we just note it's connected
    await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: dbProvider as any,
        },
      },
      update: {
        isActive:            true,
        composioConnectionId: userId,           // entity ID acts as connection ref
        updatedAt:           new Date(),
      },
      create: {
        userId,
        provider:            dbProvider as any,
        accessToken:         'composio-managed', // Composio holds the real token
        scopes:              [],
        isActive:            true,
        composioConnectionId: userId,
      },
    })

    return reply.send({ ok: true, provider: dbProvider })
  })

  // DELETE /api/integrations/:provider
  // Disconnect an integration
  app.delete('/api/integrations/:provider', async (req, reply) => {
    const { provider } = req.params as { provider: string }
    const userId = req.dbUserId

    const dbProvider = PROVIDER_MAP[provider.toLowerCase()]
    if (!dbProvider) return reply.code(400).send({ error: 'Unknown provider' })

    await prisma.integration.updateMany({
      where:  { userId, provider: dbProvider as any },
      data:   { isActive: false },
    })

    return reply.send({ ok: true })
  })
}
