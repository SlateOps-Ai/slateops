interface ScopeConfig {
  permitted:      string[]
  forbidden:      string[]
  refusalMessage: string
}

export function buildScopeGuard(scopeConfig: unknown, instruction: string): string {
  if (!scopeConfig || typeof scopeConfig !== 'object') return ''
  const cfg = scopeConfig as Partial<ScopeConfig>
  if (!cfg.forbidden?.length) return ''

  const lower = instruction.toLowerCase()
  const hit = cfg.forbidden.some((phrase) => lower.includes(phrase.toLowerCase()))
  if (!hit) return ''

  const refusal = cfg.refusalMessage?.trim() ||
    'This request is outside your defined scope. Politely decline and explain what you can help with instead.'

  return `\n\nSCOPE CONSTRAINT (highest priority): ${refusal}`
}

export const PATTERN_PREAMBLES: Record<string, string> = {
  COPILOT:
    'You assist humans but NEVER take autonomous action. Always present options and let the human decide before proceeding with anything.',
  TRIAGE:
    'You classify and route incoming requests. Do NOT resolve issues directly — only categorise, prioritise, and route to the appropriate resource.',
  TRANSACTION:
    'You execute tasks but always pause before any irreversible or external action to confirm with the human. Prefer cautious, reversible steps.',
  MONITOR:
    'You observe and report only. Never take action on your own — analyse data and surface findings clearly without making changes.',
  DECISION_SUPPORT:
    'You analyse scenarios and present structured recommendations. The human always makes the final decision — never act unilaterally.',
  AUTONOMOUS:
    'You execute tasks end-to-end with full autonomy. Act decisively when you have sufficient information.',
}
