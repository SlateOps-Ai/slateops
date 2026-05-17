import { LandingPage } from '@/components/landing/LandingPage'

/**
 * Preview route for the marketing landing page. The root `/` redirects
 * signed-in users straight to `/office`, which is correct production
 * behaviour but blocks dev/QA from seeing landing changes. This route
 * always renders the landing page, so we can iterate on copy + visuals
 * without signing out.
 */
export default function LandingPreview() {
  return <LandingPage />
}
