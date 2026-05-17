/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@agentcity/types'],
  images: {
    remotePatterns: [
      // Cloudflare R2 — pinned to the SlateOps account's bucket pattern
      // rather than the previous wildcard `**.r2.dev` (anyone could
      // register a sibling bucket).
      { protocol: 'https', hostname: 'pub-slateops.r2.dev' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async headers() {
    // CSP is in REPORT-ONLY mode — the browser computes violations but
    // doesn't block anything. Reports POST to /api/csp-report (a Next.js
    // route handler that logs each violation). When the log goes quiet
    // for a week, promote to enforced by renaming the header to
    // 'Content-Security-Policy' (drop the -Report-Only suffix).
    //
    // The policy below is a best-effort starting point based on what we
    // know Clerk + Stripe + Socket.io + Cloudflare R2 + DiceBear need.
    // We expect SOME violations — that's the signal to update the policy,
    // not to flip back to "no CSP at all".
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
      "img-src 'self' data: blob: https://pub-slateops.r2.dev https://api.dicebear.com https://img.clerk.com https://*.clerk.com",
      "font-src 'self' data: https://*.clerk.accounts.dev https://*.clerk.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com https://*.clerk.com https://*.clerk.accounts.dev",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self' https://*.clerk.com https://*.clerk.accounts.dev",
      "object-src 'none'",
      "report-uri /api/csp-report",
    ].join('; ')

    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy-Report-Only', value: csp },
        // Modern Reporting API — duplicate of the report-uri above for
        // browsers that prefer Reporting-Endpoints over the legacy directive.
        { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
      ],
    }]
  },
}

export default nextConfig
