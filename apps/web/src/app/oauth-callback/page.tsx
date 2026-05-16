'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Composio redirects the OAuth popup back here after auth completes. We
// post the app name up to the opener (the takeover or Connections panel)
// and close the popup. The opener calls /api/integrations/callback to
// record the connection.

function CallbackInner() {
  const params = useSearchParams()
  useEffect(() => {
    const composioAppName = params.get('connected')
    const errorMsg        = params.get('error')
    try {
      window.opener?.postMessage(
        { type: 'composio_oauth_complete', composioAppName, error: errorMsg ?? null },
        window.location.origin,
      )
    } catch { /* opener gone — fall through and let the user close the tab */ }
    // Give the parent ~50ms to process before we close
    setTimeout(() => { try { window.close() } catch { /* ignore */ } }, 80)
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] text-white/60 text-sm">
      Connected. You can close this window.
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  )
}
