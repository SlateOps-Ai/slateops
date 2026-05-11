/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@agentcity/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.fal.run' },
    ],
  },
}

export default nextConfig
