import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import rawBody from 'fastify-raw-body'
import { processInboundTrigger } from '../../services/trigger.service.js'
import type { NormalisedEvent } from '../../services/trigger.service.js'

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(reply: any, extra?: Record<string, unknown>) {
  return reply.send({ ok: true, ...extra })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Constant-time string compare. Returns false if lengths differ rather than
 * throwing (timingSafeEqual requires equal length). Inputs are coerced to
 * Buffer before comparison.
 */
function timingSafeEq(a: string | undefined, b: string): boolean {
  if (!a) return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function hmacHex(secret: string, body: Buffer | string, prefix = ''): string {
  return prefix + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Read the raw request body. fastify-raw-body exposes it on `req.rawBody`.
 * Returns undefined if the route isn't configured with rawBody:true.
 */
function getRawBody(req: any): Buffer | undefined {
  const raw = req.rawBody
  if (Buffer.isBuffer(raw)) return raw
  if (typeof raw === 'string') return Buffer.from(raw)
  return undefined
}

// ── Parsers (unchanged) ───────────────────────────────────────────────────────

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

function parseSlack(body: any): NormalisedEvent | null {
  try {
    const event = body?.event
    if (!event) return null
    if (event.bot_id) return null

    const sender  = event.user ?? event.username ?? 'unknown'
    const channel = event.channel ?? body?.authorizations?.[0]?.team_id ?? 'unknown'
    const text    = event.text ?? ''

    return { sender, channel, body: text, raw: body }
  } catch {
    return null
  }
}

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

function parseEmail(body: any): NormalisedEvent | null {
  try {
    const from    = body?.from ?? body?.sender ?? ''
    const subject = body?.subject ?? ''
    const text    = body?.text ?? (body?.html ? stripHtml(body.html) : '') ?? body?.['body-plain'] ?? ''

    const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/)
    const sender      = senderMatch ? `${senderMatch[1]} <${senderMatch[2]}>` : from

    return { sender, subject, body: text, raw: body }
  } catch {
    return null
  }
}

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
  // Scope rawBody capture to this plugin so other JSON routes are unaffected.
  // Every webhook route below opts in via { config: { rawBody: true } }.
  await app.register(rawBody, {
    field:    'rawBody',
    global:   false,
    encoding: false,   // Buffer
    runFirst: true,
  })

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
  // Meta signs events with the WhatsApp app secret using X-Hub-Signature-256.
  app.post('/webhooks/whatsapp/:secret', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      req.log.error('META_APP_SECRET not set — refusing WhatsApp webhook')
      return reply.code(503).send({ error: 'Webhook not configured' })
    }
    const sig = req.headers['x-hub-signature-256'] as string | undefined
    const raw = getRawBody(req)
    if (!sig || !raw) return reply.code(401).send({ error: 'Missing signature' })
    const expected = hmacHex(appSecret, raw, 'sha256=')
    if (!timingSafeEq(sig, expected)) return reply.code(401).send({ error: 'Invalid signature' })

    const event = parseWhatsApp(req.body)
    if (!event) return ok(reply)
    await processInboundTrigger(secret, event).catch((err) => req.log.error(err))
    return ok(reply)
  })

  // ── Slack: url_verification challenge + events ────────────────────────────────
  // Slack signs every request with X-Slack-Signature (HMAC over `v0:ts:body`).
  // 5-minute timestamp tolerance prevents replay.
  app.post('/webhooks/slack/:secret', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const signing = process.env.SLACK_SIGNING_SECRET
    if (!signing) {
      req.log.error('SLACK_SIGNING_SECRET not set — refusing Slack webhook')
      return reply.code(503).send({ error: 'Webhook not configured' })
    }
    const sig = req.headers['x-slack-signature']        as string | undefined
    const ts  = req.headers['x-slack-request-timestamp'] as string | undefined
    const raw = getRawBody(req)
    if (!sig || !ts || !raw) return reply.code(401).send({ error: 'Missing signature' })

    // Reject events older than 5 minutes (replay protection).
    const tsNum = Number(ts)
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      return reply.code(401).send({ error: 'Stale timestamp' })
    }

    const base     = `v0:${ts}:${raw.toString('utf8')}`
    const expected = 'v0=' + crypto.createHmac('sha256', signing).update(base).digest('hex')
    if (!timingSafeEq(sig, expected)) return reply.code(401).send({ error: 'Invalid signature' })

    const body = req.body as any
    if (body?.type === 'url_verification') {
      return reply.send({ challenge: body.challenge })
    }

    const event = parseSlack(body)
    if (!event) return ok(reply)
    await processInboundTrigger(secret, event).catch((err) => req.log.error(err))
    return ok(reply)
  })

  // ── GitHub: HMAC-verified events ──────────────────────────────────────────────
  // GitHub signs events with the per-webhook secret using X-Hub-Signature-256.
  // The path :secret IS the signing secret here (GitHub config writes it on
  // both ends); fail closed if signature is missing or invalid.
  app.post('/webhooks/github/:secret', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const sig = req.headers['x-hub-signature-256'] as string | undefined
    const raw = getRawBody(req)
    if (!sig || !raw) return reply.code(401).send({ error: 'Missing signature' })
    const expected = hmacHex(secret, raw, 'sha256=')
    if (!timingSafeEq(sig, expected)) return reply.code(401).send({ error: 'Invalid signature' })

    const eventHeader = req.headers['x-github-event'] as string | undefined
    const event = parseGitHub(eventHeader, req.body)
    if (!event) return ok(reply)
    await processInboundTrigger(secret, event).catch((err) => req.log.error(err))
    return ok(reply)
  })

  // ── Email inbound: SendGrid / Mailgun ─────────────────────────────────────────
  // SendGrid uses Ed25519 signatures (X-Twilio-Email-Event-Webhook-Signature);
  // Mailgun uses HMAC over `timestamp + token`. Configure whichever you use
  // via SENDGRID_WEBHOOK_PUBLIC_KEY *or* MAILGUN_SIGNING_KEY; if neither is
  // set, the endpoint is disabled.
  app.post('/webhooks/email/:secret', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const body = req.body as any

    const mailgunKey = process.env.MAILGUN_SIGNING_KEY
    const sendgridPub = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY

    let verified = false

    // Mailgun: signature object inside the body
    if (mailgunKey && body?.signature?.timestamp && body?.signature?.token && body?.signature?.signature) {
      const { timestamp, token, signature } = body.signature
      const expected = crypto.createHmac('sha256', mailgunKey)
        .update(timestamp + token).digest('hex')
      if (timingSafeEq(signature, expected)) verified = true
    }

    // SendGrid: Ed25519 verification via headers
    if (!verified && sendgridPub) {
      const sigHdr = req.headers['x-twilio-email-event-webhook-signature']  as string | undefined
      const tsHdr  = req.headers['x-twilio-email-event-webhook-timestamp']  as string | undefined
      const raw    = getRawBody(req)
      if (sigHdr && tsHdr && raw) {
        try {
          const key = crypto.createPublicKey({
            key: Buffer.from(sendgridPub, 'base64'),
            format: 'der',
            type: 'spki',
          })
          const msg = Buffer.concat([Buffer.from(tsHdr), raw])
          verified = crypto.verify(null, msg, key, Buffer.from(sigHdr, 'base64'))
        } catch {
          verified = false
        }
      }
    }

    if (!verified) return reply.code(401).send({ error: 'Invalid or missing signature' })

    const event = parseEmail(body)
    if (!event) return ok(reply)
    const result = await processInboundTrigger(secret, event).catch(() => null)
    if (result?.error === 'Rule not found') return reply.code(404).send({ error: 'No matching trigger rule' })
    return ok(reply)
  })

  // ── Generic: any HTTP POST (Zapier, Make, n8n, custom) ───────────────────────
  // Requires an X-Hmac-Signature-256 header signed with the path :secret over
  // the raw body. Callers MUST sign their requests; we no longer accept
  // unauthenticated posts. Timestamp tolerance (5 min) via X-Timestamp.
  app.post('/webhooks/generic/:secret', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const { secret } = req.params as { secret: string }
    const sig = req.headers['x-hmac-signature-256'] as string | undefined
    const ts  = req.headers['x-timestamp']           as string | undefined
    const raw = getRawBody(req)
    if (!sig || !raw) return reply.code(401).send({ error: 'Missing signature' })

    // Timestamp optional; if provided, enforce 5-min tolerance.
    if (ts) {
      const tsNum = Number(ts)
      if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
        return reply.code(401).send({ error: 'Stale timestamp' })
      }
    }

    const payload  = ts ? Buffer.concat([Buffer.from(`${ts}:`), raw]) : raw
    const expected = hmacHex(secret, payload, 'sha256=')
    if (!timingSafeEq(sig, expected)) return reply.code(401).send({ error: 'Invalid signature' })

    const event = parseGeneric(req.body)
    const result = await processInboundTrigger(secret, event).catch(() => null)
    if (result?.error === 'Rule not found') return reply.code(404).send({ error: 'No matching trigger rule' })
    return ok(reply)
  })
}
