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
    // NOTE: CSP temporarily disabled — the strict policy from the security
    // audit (HIGH-08) was blocking Clerk's sign-in widget from loading.
    // Re-enable in report-only mode once we've enumerated every host Clerk
    // pulls scripts/styles/fonts from for THIS instance, then promote to
    // enforced mode after a week of clean reports.
    return [{
      source: '/(.*)',
      headers: [
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
