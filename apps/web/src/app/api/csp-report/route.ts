import { NextResponse } from 'next/server'

/**
 * CSP violation collector — receives Report-Only violation reports from the
 * browser and logs them to stdout. Used to enumerate exactly which scripts /
 * styles / connects the strict policy would block before flipping CSP from
 * report-only to enforced.
 *
 * Browsers POST these with content-type `application/csp-report` (legacy) or
 * `application/reports+json` (modern Reporting API). No auth — browsers won't
 * send credentials with reports, so this endpoint is excluded from Clerk
 * middleware protection (see apps/web/src/middleware.ts).
 *
 * Volume can spike if the policy is too strict; we cap per-request log size
 * to avoid drowning the dev console.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text()
    const trimmed = raw.length > 4096 ? raw.slice(0, 4096) + '… [truncated]' : raw
    let parsed: unknown
    try { parsed = JSON.parse(trimmed) } catch { parsed = trimmed }

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const body = (item as any)?.body ?? item
        const directive = body?.['violated-directive'] ?? body?.violatedDirective
        const blocked   = body?.['blocked-uri']        ?? body?.blockedURL
        // eslint-disable-next-line no-console
        console.warn(`[csp-report] directive=${directive} blocked=${blocked}`)
      }
    } else if (parsed && typeof parsed === 'object') {
      const body = (parsed as any)['csp-report'] ?? parsed
      const directive = body?.['violated-directive'] ?? body?.violatedDirective
      const blocked   = body?.['blocked-uri']        ?? body?.blockedURL
      // eslint-disable-next-line no-console
      console.warn(`[csp-report] directive=${directive} blocked=${blocked}`)
    }
  } catch {
    // never throw back to the browser — CSP-report endpoint failure should
    // not turn into a console error visible to the end user.
  }

  return new NextResponse(null, { status: 204 })
}

export const runtime = 'nodejs'
