import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma.js'

// ── Pricing (per million tokens, USD) ─────────────────────────────────────────
// Source: Anthropic public pricing. Update here when models / pricing change.
//
// For models not in this table we fall back to MODEL_PRICING_DEFAULT — log row
// will still be written, cost will just be a rough estimate.

interface ModelPricing {
  inputPerMTok:        number
  outputPerMTok:       number
  cacheReadPerMTok:    number
  cacheCreatePerMTok:  number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4 family
  'claude-sonnet-4-6':            { inputPerMTok: 3,    outputPerMTok: 15,  cacheReadPerMTok: 0.30,  cacheCreatePerMTok: 3.75 },
  'claude-sonnet-4-5':            { inputPerMTok: 3,    outputPerMTok: 15,  cacheReadPerMTok: 0.30,  cacheCreatePerMTok: 3.75 },
  // Claude Opus 4 family
  'claude-opus-4-7':              { inputPerMTok: 15,   outputPerMTok: 75,  cacheReadPerMTok: 1.50,  cacheCreatePerMTok: 18.75 },
  'claude-opus-4-6':              { inputPerMTok: 15,   outputPerMTok: 75,  cacheReadPerMTok: 1.50,  cacheCreatePerMTok: 18.75 },
  // Claude Haiku
  'claude-haiku-4-5-20251001':    { inputPerMTok: 1,    outputPerMTok: 5,   cacheReadPerMTok: 0.10,  cacheCreatePerMTok: 1.25 },
}

const MODEL_PRICING_DEFAULT: ModelPricing = {
  inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.30, cacheCreatePerMTok: 3.75,
}

// ── Anthropic response.usage shape ────────────────────────────────────────────

export interface AnthropicUsage {
  input_tokens:                number
  output_tokens:               number
  cache_read_input_tokens?:    number | null
  cache_creation_input_tokens?: number | null
}

export function computeCostUsd(model: string, usage: AnthropicUsage): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING_DEFAULT
  const input  = (usage.input_tokens         ?? 0) * p.inputPerMTok
  const output = (usage.output_tokens        ?? 0) * p.outputPerMTok
  const cRead  = (usage.cache_read_input_tokens     ?? 0) * p.cacheReadPerMTok
  const cWrite = (usage.cache_creation_input_tokens ?? 0) * p.cacheCreatePerMTok
  return (input + output + cRead + cWrite) / 1_000_000
}

// ── Log writer ────────────────────────────────────────────────────────────────

interface LogParams {
  userId:       string
  agentId?:     string | null
  endpoint:     string
  model:        string
  usage:        AnthropicUsage | null  // null when call failed before getting usage
  byok?:        boolean
  latencyMs?:   number
  status?:      'OK' | 'ERROR' | 'RATE_LIMITED'
  errorMessage?: string
}

/**
 * Persist a single LLM API call's usage to the LlmCallLog table.
 * Non-blocking — never throws into the caller; logs internally on failure.
 */
export async function logLlmCall(params: LogParams): Promise<void> {
  const u = params.usage
  const costUsd = u ? computeCostUsd(params.model, u) : 0

  try {
    await prisma.llmCallLog.create({
      data: {
        userId:            params.userId,
        agentId:           params.agentId ?? null,
        endpoint:          params.endpoint,
        model:             params.model,
        provider:          'ANTHROPIC',
        byok:              params.byok ?? false,
        inputTokens:       u?.input_tokens                 ?? 0,
        outputTokens:      u?.output_tokens                ?? 0,
        cacheReadTokens:   u?.cache_read_input_tokens      ?? 0,
        cacheCreateTokens: u?.cache_creation_input_tokens  ?? 0,
        estimatedCostUsd:  costUsd,
        latencyMs:         params.latencyMs ?? null,
        status:            params.status    ?? 'OK',
        errorMessage:      params.errorMessage ?? null,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llm-usage] failed to log call:', (err as Error).message)
  }
}

// ── Wrapper: call Anthropic + auto-log usage ──────────────────────────────────

interface CallCtx {
  userId:    string
  agentId?:  string | null
  endpoint:  string
  byok?:     boolean
}

/**
 * Drop-in wrapper around `client.messages.create()` that logs token usage
 * + cost on success and on error. Use this everywhere instead of calling
 * `client.messages.create` directly so we keep a complete audit trail.
 */
export async function callAnthropic(
  client: Anthropic,
  params: any,
  ctx: CallCtx,
): Promise<any> {
  const start = Date.now()
  try {
    const response = await client.messages.create(params)
    await logLlmCall({
      userId:    ctx.userId,
      agentId:   ctx.agentId,
      endpoint:  ctx.endpoint,
      model:     params.model,
      usage:     (response.usage ?? null) as AnthropicUsage | null,
      byok:      ctx.byok,
      latencyMs: Date.now() - start,
    })
    return response
  } catch (err) {
    await logLlmCall({
      userId:       ctx.userId,
      agentId:      ctx.agentId,
      endpoint:     ctx.endpoint,
      model:        params.model,
      usage:        null,
      byok:         ctx.byok,
      latencyMs:    Date.now() - start,
      status:       'ERROR',
      errorMessage: (err as Error).message?.slice(0, 500),
    })
    throw err
  }
}

// ── Anomaly detection ────────────────────────────────────────────────────────
//
// Two conditions trip an anomaly — whichever fires first:
//   1. today_spend / 7day_avg ≥ 3
//   2. today_spend ≥ $2 (absolute floor — catches new users with zero baseline)
//
// Designed to be called hourly. With the rolling daily window, an attacker
// burning credits at >$2/hour will trigger within one cron tick.

const DAILY_USER_SPEND_RATIO_THRESHOLD = 3
const DAILY_USER_SPEND_ABSOLUTE_FLOOR  = 2   // USD

export async function checkSpendAnomalies(): Promise<Array<{ userId: string; todayUsd: number; avgUsd: number }>> {
  const now      = new Date()
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const start7d    = new Date(now); start7d.setDate(start7d.getDate() - 7); start7d.setHours(0, 0, 0, 0)

  const [todayRows, weekRows] = await Promise.all([
    prisma.llmCallLog.groupBy({
      by:    ['userId'],
      where: { createdAt: { gte: startToday } },
      _sum:  { estimatedCostUsd: true },
    }),
    prisma.llmCallLog.groupBy({
      by:    ['userId'],
      where: { createdAt: { gte: start7d, lt: startToday } },
      _sum:  { estimatedCostUsd: true },
    }),
  ])

  const weekAvgByUser = new Map<string, number>()
  for (const r of weekRows) weekAvgByUser.set(r.userId, (r._sum.estimatedCostUsd ?? 0) / 7)

  const anomalies: Array<{ userId: string; todayUsd: number; avgUsd: number }> = []
  for (const r of todayRows) {
    const today = r._sum.estimatedCostUsd ?? 0
    const avg   = weekAvgByUser.get(r.userId) ?? 0
    const ratioTrip = avg > 0 && today / avg >= DAILY_USER_SPEND_RATIO_THRESHOLD
    const floorTrip = today >= DAILY_USER_SPEND_ABSOLUTE_FLOOR
    if (today > 0.1 && (ratioTrip || floorTrip)) {
      anomalies.push({ userId: r.userId, todayUsd: today, avgUsd: avg })
    }
  }
  return anomalies
}

// ── Per-agent public-chat cost guard ─────────────────────────────────────────
//
// Sum the cost of all LLM calls billed to a specific agent through the public
// widget endpoint within the last `windowMs`. Used to refuse anonymous calls
// once the agent's owner has spent more than `PUBLIC_AGENT_DAILY_USD_CAP` via
// the public widget in 24h. Prevents one anonymous attacker from draining an
// account.

export const PUBLIC_AGENT_DAILY_USD_CAP = 1   // USD per agent per rolling 24h

export async function publicAgentSpendSince(agentId: string, sinceMs: number): Promise<number> {
  const row = await prisma.llmCallLog.aggregate({
    where: {
      agentId,
      endpoint:  '/api/public/agents/:id/chat',
      createdAt: { gte: new Date(Date.now() - sinceMs) },
    },
    _sum: { estimatedCostUsd: true },
  })
  return row._sum.estimatedCostUsd ?? 0
}
