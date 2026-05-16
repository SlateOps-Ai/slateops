// Shared time-window helper for analytics + ROI endpoints. The CEO Control
// Center sends ?window=today|week|month and each endpoint scopes its queries
// accordingly. Default = month so existing 30-day callers keep working.

export type TimeWindow = 'today' | 'week' | 'month'

/** Parse the query param, defaulting to 'month'. */
export function parseWindow(input: unknown): TimeWindow {
  if (input === 'today' || input === 'week') return input
  return 'month'
}

/** Lower-bound Date for the chosen window. */
export function windowSince(window: TimeWindow): Date {
  if (window === 'today') {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }
  const days = window === 'week' ? 7 : 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/** Number of days in the window (for daily-volume bucketing). */
export function windowDays(window: TimeWindow): number {
  if (window === 'today') return 1
  if (window === 'week')  return 7
  return 30
}
