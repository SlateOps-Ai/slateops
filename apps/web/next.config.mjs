/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@agentcity/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
}

export default nextConfig
