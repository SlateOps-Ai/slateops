'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, CreditCard, Zap, Check, Loader2, Clock, AlertCircle } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Package {
  id:             string
  credits:        number
  amountUsd:      number
  label:          string
  pricePerCredit: number
}

interface Payment {
  id:          string
  credits:     number
  amountUsd:   number
  status:      string
  createdAt:   string
  completedAt: string | null
}

const PACKAGE_HIGHLIGHTS: Record<string, { badge?: string; highlight?: boolean }> = {
  pro:   { badge: 'Most popular', highlight: true },
  power: { badge: 'Best value' },
}

interface Props { onClose: () => void }

export function BillingPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [packages,  setPackages]  = useState<Package[]>([])
  const [payments,  setPayments]  = useState<Payment[]>([])
  const [tab,       setTab]       = useState<'buy' | 'history'>('buy')
  const [loading,   setLoading]   = useState(true)
  const [buying,    setBuying]    = useState<string | null>(null)
  const [stripeReady, setStripeReady] = useState(false)

  useEffect(() => {
    Promise.all([
      authFetch(`${API}/api/billing/packages`).then((r) => r.json()),
      authFetch(`${API}/api/billing/history`).then((r) => r.json()),
    ]).then(([pkgData, histData]) => {
      setPackages(pkgData.packages ?? [])
      setStripeReady(pkgData.stripeConfigured ?? false)
      setPayments(histData.payments ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [API, authFetch])

  async function handleBuy(pkg: Package) {
    if (!stripeReady) return
    setBuying(pkg.id)
    try {
      const res  = await authFetch(`${API}/api/billing/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ packageId: pkg.id }),
      })
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
    } catch { /* non-fatal */ }
    finally { setBuying(null) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-60 top-16 bottom-4 z-30 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <CreditCard size={13} className="text-panel-accent shrink-0" />
        <span className="text-white text-xs font-medium flex-1">Credits & Billing</span>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['buy', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-[11px] font-medium transition-colors',
              tab === t ? 'text-white border-b-2 border-panel-accent -mb-px' : 'text-panel-muted hover:text-white'
            )}
          >
            {t === 'buy' ? 'Buy Credits' : 'History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center pt-10 gap-2 text-panel-muted text-xs">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && tab === 'buy' && (
          <>
            {!stripeReady && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 flex items-start gap-2">
                <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-400/80 text-[10px] leading-relaxed">
                  Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to the API .env to enable purchases.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {packages.map((pkg) => {
                const meta = PACKAGE_HIGHLIGHTS[pkg.id] ?? {}
                return (
                  <div
                    key={pkg.id}
                    className={cn(
                      'rounded-xl border px-3 py-3 relative transition-colors',
                      meta.highlight
                        ? 'border-panel-accent/30 bg-panel-accent/6'
                        : 'border-white/8 bg-white/3'
                    )}
                  >
                    {meta.badge && (
                      <span className="absolute -top-2 right-3 bg-panel-accent text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                        {meta.badge}
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white text-sm font-semibold">{pkg.credits} credits</p>
                        <p className="text-panel-muted text-[10px]">${pkg.pricePerCredit}/credit</p>
                      </div>
                      <p className="text-panel-accent text-lg font-bold">${pkg.amountUsd}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      {Array.from({ length: Math.min(pkg.credits, 5) }).map((_, i) => (
                        <Zap key={i} size={9} className="text-panel-accent/60" />
                      ))}
                      {pkg.credits > 5 && <span className="text-[9px] text-panel-muted">+{pkg.credits - 5} more</span>}
                    </div>
                    <button
                      onClick={() => handleBuy(pkg)}
                      disabled={!stripeReady || buying === pkg.id}
                      className={cn(
                        'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                        meta.highlight
                          ? 'bg-panel-accent hover:bg-panel-accent/90 text-white disabled:opacity-50'
                          : 'bg-white/8 hover:bg-white/12 text-white disabled:opacity-40'
                      )}
                    >
                      {buying === pkg.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      {buying === pkg.id ? 'Redirecting…' : 'Buy now'}
                    </button>
                  </div>
                )
              })}
            </div>

            <p className="text-panel-muted/50 text-[10px] text-center px-2">
              Each task costs 1 credit. Credits never expire. Secure checkout via Stripe.
            </p>
          </>
        )}

        {!loading && tab === 'history' && (
          <>
            {payments.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <Clock size={18} className="text-panel-muted/40" />
                <p className="text-panel-muted text-xs">No purchases yet.</p>
              </div>
            )}
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap size={11} className="text-panel-accent" />
                      <span className="text-white text-xs font-medium">+{p.credits} credits</span>
                    </div>
                    <span className={cn(
                      'text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
                      p.status === 'COMPLETE' ? 'bg-lamp-done/15 text-lamp-done' :
                      p.status === 'FAILED'   ? 'bg-lamp-blocked/15 text-lamp-blocked' :
                                                'bg-lamp-idle/15 text-lamp-idle'
                    )}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-panel-muted text-[10px]">${p.amountUsd}</span>
                    <span className="text-panel-muted/50 text-[10px]">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
