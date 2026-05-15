const HEDGING = [
  'not sure', 'unclear', "couldn't find", 'unable to', 'could not find',
  'no results', 'uncertain', 'possibly', 'might be', 'i cannot', "i can't",
  'unfortunately', 'failed to', 'no information', 'not available',
]

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW'

export function scoreConfidence(
  stepOutputs: Array<{ step: string; output: string }>,
): { score: number; band: ConfidenceBand } {
  if (!stepOutputs.length) return { score: 0.5, band: 'MEDIUM' }

  let score = 0.80

  // Boost: all steps produced substantive output (>80 chars each)
  const substantive = stepOutputs.filter((s) => s.output.trim().length > 80)
  if (substantive.length === stepOutputs.length) score += 0.08

  // Penalty: hedging language found in any output
  const combined = stepOutputs.map((s) => s.output.toLowerCase()).join(' ')
  let hedgeHits = 0
  for (const phrase of HEDGING) {
    if (combined.includes(phrase)) hedgeHits++
  }
  score -= Math.min(hedgeHits * 0.06, 0.25)

  // Penalty: very short total output (agent may have given up)
  const totalChars = stepOutputs.reduce((n, s) => n + s.output.length, 0)
  if (totalChars < 200) score -= 0.15

  score = Math.max(0, Math.min(1, score))

  const band: ConfidenceBand =
    score >= 0.85 ? 'HIGH'
    : score >= 0.60 ? 'MEDIUM'
    : 'LOW'

  return { score, band }
}
