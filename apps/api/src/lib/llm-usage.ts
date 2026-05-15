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

// ── Daily anomaly check (called by the cron) ──────────────────────────────────

const DAILY_USER_SPEND_RATIO_THRESHOLD = 5  // alert if today is 5x the 7-day avg

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
    if (today > 0.5 && avg > 0 && today / avg >= DAILY_USER_SPEND_RATIO_THRESHOLD) {
      anomalies.push({ userId: r.userId, todayUsd: today, avgUsd: avg })
    }
  }
  return anomalies
}
