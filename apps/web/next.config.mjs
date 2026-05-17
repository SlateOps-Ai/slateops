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
    // Tune script-src and connect-src once Clerk + Socket.io + Stripe endpoints
    // are confirmed. Start strict; loosen with explicit hosts as needed.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://pub-slateops.r2.dev https://api.dicebear.com https://img.clerk.com https://*.clerk.com",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com https://*.clerk.com https://*.clerk.accounts.dev",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')

    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
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
