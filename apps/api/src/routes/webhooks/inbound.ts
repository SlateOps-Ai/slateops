import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { processInboundTrigger } from '../../services/trigger.service.js'
import type { NormalisedEvent } from '../../services/trigger.service.js'

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(reply: any, extra?: Record<string, unknown>) {
  return reply.send({ ok: true, ...extra })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── WhatsApp Business API ──────────────────────────────────────────────────────
// URL pattern: /webhooks/whatsapp/:secret
// Meta GET challenge + POST events

function parseWhatsApp(body: any): NormalisedEvent | null {
  try {
    const entry   = body?.entry?.[0]
    const change  = entry?.changes?.[0]
    const msg     = change?.value?.messages?.[0]
    if (!msg) return null

    const contact = change?.value?.contacts?.[0]
    const sender  = contact?.profile?.name ?? msg.from
    const text    = msg?.text?.body ?? msg?.button?.text ?? '[media message]'

    return { sender, body: text, raw: body }
  } catch {
    return null
  }
}

// ── Slack Events API ───────────────────────────────────────────────────────────
// URL pattern: /webhooks/slack/:secret
// Slack sends url_verification challenge + event callbacks

function parseSlack(body: any): NormalisedEvent | null {
  try {
    const event = body?.event
    if (!event) return null
    if (event.bot_id) return null  // ignore bot messages

    const sender  = event.user ?? event.username ?? 'unknown'
    const channel = event.channel ?? body?.authorizations?.[0]?.team_id ?? 'unknown'
    const text    = event.text ?? ''

    return { sender, channel, body: text, raw: body }
  } catch {
    return null
  }
}

// ── GitHub Webhooks ────────────────────────────────────────────────────────────
// URL pattern: /webhooks/github/:secret
// X-Hub-Signature-256 HMAC verified using webhookSecret

function parseGitHub(eventHeader: string | undefined, body: any): NormalisedEvent | null {
  try {
    const eventType = eventHeader ?? 'push'
    const actor     = body?.sender?.login ?? body?.pusher?.name ?? 'unknown'
    const repo      = body?.repository?.full_name ?? 'unknown'

    let description = ''
    if (eventType === 'push') {
      const commits = (body?.commits ?? []).map((c: any) => `- ${c.message}`).join('\n')
      description = `${actor} pushed to ${repo}:\n${commits || 'no commit messages'}`
    } else if (eventType === 'pull_request') {
      const pr = body?.pull_request
      description = `${actor} ${body?.action ?? 'opened'} PR #${pr?.number}: "${pr?.title}"\n${pr?.body ?? ''}`
    } else if (eventType === 'issues') {
      const issue = body?.issue
      description = `${actor} ${body?.action ?? 'opened'} issue #${issue?.number}: "${issue?.title}"\n${issue?.body ?? ''}`
    } else {
      description = `GitHub ${eventType} event by ${actor} on ${repo}`
    }

    return { sender: actor, subject: eventType, channel: repo, body: description, raw: body }
  } catch {
    return null
  }
}

// ── Email inbound (SendGrid/Mailgun parse format) ──────────────────────────────
// URL pattern: /webhooks/email/:secret
// Both providers POST multipart/form-data with from, subject, text/html

function parseEmail(body: any): NormalisedEvent | null {
  try {
    const from    = body?.from ?? body?.sender ?? ''
    const subject = body?.subject ?? ''
    const text    = body?.text ?? (body?.html ? stripHtml(body.html) : '') ?? body?.['body-plain'] ?? ''

    // Extract display name + address from "Name <addr@domain.com>"
    const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/)
    const sender      = senderMatch ? `${senderMatch[1]} <${senderMatch[2]}>` : from

    return { sender, subject, body: text, raw: body }
  } catch {
    return null
  }
}

// ── Generic webhook ────────────────────────────────────────────────────────────
// URL pattern: /webhooks/generic/:secret
// Any tool (Zapier, Make, n8n, custom) can POST here
// Tries to find meaningful text fields; falls back to full JSON

function parseGeneric(body: any): NormalisedEvent {
  if (typeof body === 'string') return { body, raw: body }
  const text =
    body?.text    ?? body?.message ?? body?.content ?? body?.body ??
    body?.payload ?? body?.data    ?? JSON.stringify(body, null, 2)
  const sender  = body?.from ?? body?.sender ?? body?.user ?? body?.email
  const subject = body?.subject ?? body?.title ?? body?.event ?? body?.type
  return {
    sender:  typeof sender === 'string'  ? sender  : undefined,
    subject: typeof subject === 'string' ? subject : undefined,
    body:    typeof text === 'string' ? text : JSON.stringify(text),
    raw:     body,
  }
}

// ── Route registration ─────────────────────────────────────────────────────────

export default async function inboundWebhookRoutes(app: FastifyInstance) {

  // ── WhatsApp: GET challenge verification ─────────────────────────────────────
  app.get('/webhooks/whatsapp/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const q = req.query as Record<string, string>

    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === secret) {
      return reply.send(q['hub.challenge'])
    }
    return reply.code(403).send('Forbidden')
  })

  // ── WhatsApp: POST events ─────────────────────────────────────────────────────
  app.post('/webhooks/whatsapp/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const event = parseWhatsApp(req.body)
    if (!event) return ok(reply)  // Always 200 to Meta

    await processInboundTrigger(secret, event).catch(console.error)
    return ok(reply)
  })

  // ── Slack: url_verification challenge + events ────────────────────────────────
  app.post('/webhooks/slack/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const body = req.body as any

    // Slack sends a challenge on first setup
    if (body?.type === 'url_verification') {
      return reply.send({ challenge: body.challenge })
    }

    const event = parseSlack(body)
    if (!event) return ok(reply)

    await processInboundTrigger(secret, event).catch(console.error)
    return ok(reply)
  })

  // ── GitHub: HMAC-verified events ──────────────────────────────────────────────
  app.post('/webhooks/github/:secret', {
    config: { rawBody: true },  // need raw body for HMAC
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const sig = (req.headers['x-hub-signature-256'] as string | undefined) ?? ''

    // Verify signature if present (if not yet configured, allow through)
    if (sig) {
      const raw  = (req as any).rawBody as Buffer | undefined
      if (raw) {
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
        const valid    = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
        if (!valid) return reply.code(401).send({ error: 'Invalid signature' })
      }
    }

    const eventHeader = req.headers['x-github-event'] as string | undefined
    const event = parseGitHub(eventHeader, req.body)
    if (!event) return ok(reply)

    await processInboundTrigger(secret, event).catch(console.error)
    return ok(reply)
  })

  // ── Email inbound: SendGrid/Mailgun format ────────────────────────────────────
  app.post('/webhooks/email/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const event = parseEmail(req.body)
    if (!event) return ok(reply)

    const result = await processInboundTrigger(secret, event).catch(() => null)
    if (result?.error === 'Rule not found') return reply.code(404).send({ error: 'No matching trigger rule' })
    return ok(reply)
  })

  // ── Generic: any HTTP POST (Zapier, Make, n8n, custom) ───────────────────────
  app.post('/webhooks/generic/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const event = parseGeneric(req.body)

    const result = await processInboundTrigger(secret, event).catch(() => null)
    if (result?.error === 'Rule not found') return reply.code(404).send({ error: 'No matching trigger rule' })
    return ok(reply)
  })
}
