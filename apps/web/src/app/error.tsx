'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { SlateCaretLogo } from '@/components/branding/SlateCaretLogo'

// Next.js App Router error boundary. Fires whenever a client component
// throws during render in any route under app/ (except the root layout —
// for that, see global-error.tsx). Surfaces the real error message and
// stack so we never go silently blank again.

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[SlateOps error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0f1a] text-white antialiased p-6">
      <div className="w-full max-w-lg rounded-2xl border border-red-400/20 bg-[#12172b] shadow-2xl p-7 space-y-5">

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-400/10 border border-red-400/25 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-base font-bold leading-tight">Something crashed.</h1>
            <p className="text-white/40 text-xs mt-0.5">
              The office hit an error while rendering. Below is what blew up so we can fix it.
            </p>
          </div>
          <SlateCaretLogo size={28} variant="amber" animate={false} />
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">Error message</p>
          <p className="text-red-400 text-[12px] font-mono leading-relaxed break-words">
            {error.message || '(no message)'}
          </p>
          {error.digest && (
            <p className="text-white/30 text-[10px] font-mono">
              digest: <span className="text-white/55">{error.digest}</span>
            </p>
          )}
          {error.stack && (
            <details className="mt-2">
              <summary className="text-[10px] uppercase tracking-widest text-white/40 font-semibold cursor-pointer hover:text-white/60 transition-colors">
                Stack trace
              </summary>
              <pre className="text-white/40 text-[10px] font-mono leading-relaxed mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                {error.stack}
              </pre>
            </details>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-panel-accent text-white text-xs font-semibold hover:bg-panel-accent/85 transition-colors"
          >
            <RefreshCw size={12} /> Try again
          </button>
          <button
            onClick={() => router.push('/office')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 text-xs font-semibold hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <ArrowLeft size={12} /> Reload office
          </button>
        </div>

        <p className="text-[10px] text-white/30 leading-relaxed border-t border-white/[0.04] pt-3">
          Also check the browser console (F12) and the dev-server terminal —
          they often have more context than this panel does.
        </p>
      </div>
    </div>
  )
}
