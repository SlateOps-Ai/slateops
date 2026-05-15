'use client'

import { useState } from 'react'
import { X, Check, Zap, Shield, FileText, Lock, HeadphonesIcon, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Props { onClose: () => void }

type PlanId    = 'growth' | 'business'
type BillCycle = 'monthly' | 'annually'

interface Feature {
  label: string
  starter: boolean | string
  growth:  boolean | string
  business: boolean | string
}

const FEATURES: Feature[] = [
  { label: 'AI agents',             starter: '2',         growth: '5',         business: '15'        },
  { label: 'Tasks per month',       starter: '10',        growth: 'Unlimited', business: 'Unlimited' },
  { label: 'Human Review Gate',     starter: false,       growth: true,        business: true        },
  { label: 'Bring your own API key',starter: false,       growth: true,        business: true        },
  { label: 'Full audit trail',      starter: false,       growth: true,        business: true        },
  { label: 'Agent marketplace',     starter: true,        growth: true,        business: true        },
  { label: 'Workflow builder',      starter: false,       growth: true,        business: true        },
  { label: 'SOC 2 audit export',    starter: false,       growth: false,       business: true        },
  { label: 'Multi-team access',     starter: false,       growth: false,       business: true        },
  { label: 'Custom approval chains',starter: false,       growth: false,       business: true        },
  { label: 'Support',               starter: 'Community', growth: 'Email',     business: 'Priority'  },
]

const PLANS = {
  growth:   { monthly: 79,  annually: 63,  annualTotal: 756  },
  business: { monthly: 249, annually: 199, annualTotal: 2388 },
}

const DISCOUNT_PCT = 20

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true)  return <Check size={13} className="text-emerald-400 shrink-0" />
  if (value === false) return <span className="w-3 h-px bg-white/15 block" />
  return <span className="text-white/55 text-[11px]">{value}</span>
}

export function UpgradePanel({ onClose }: Props) {
  const authFetch  = useAuthFetch()
  const API        = process.env.NEXT_PUBLIC_API_URL
  const [loading,  setLoading]  = useState<PlanId | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [cycle,    setCycle]    = useState<BillCycle>('monthly')

  const isAnnual = cycle === 'annually'

  async function subscribe(plan: PlanId) {
    setLoading(plan)
    setError(null)
    try {
      const res  = await authFetch(`${API}/api/billing/subscribe`, {
        method: 'POST',
        body:   JSON.stringify({ plan, cycle }),
      })
      const data = await res.json()

      if (res.status === 503) {
        setError("Billing is not yet live. Join the waitlist and we'll notify you when plans are available.")
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      if (data.url) window.location.href = data.url
    } catch {
      setError('Could not connect to billing. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="relative px-8 pt-8 pb-6 text-center border-b border-white/[0.06]">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
          <h2 className="text-white text-2xl font-bold tracking-tight">Choose your plan</h2>
          <p className="text-[#8892b0] text-sm mt-1.5">Start free. Upgrade when your team is ready.</p>

          {/* Billing cycle toggle */}
          <div className="mt-5 inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            <button
              onClick={() => setCycle('monthly')}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                !isAnnual
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle('annually')}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                isAnnual
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              )}
            >
              Annually
              <span className={cn(
                'text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors',
                isAnnual
                  ? 'bg-emerald-400 text-[#0d1117]'
                  : 'bg-emerald-400/15 text-emerald-400'
              )}>
                -{DISCOUNT_PCT}%
              </span>
            </button>
          </div>
          {isAnnual && (
            <p className="text-emerald-400/70 text-[11px] mt-2">
              Save up to ${((PLANS.business.monthly - PLANS.business.annually) * 12).toLocaleString()} per year
            </p>
          )}
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-8 pt-4"
            >
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 flex items-start gap-3">
                <Zap size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-400/90 text-xs leading-relaxed">{error}</p>
                <button onClick={() => setError(null)} className="text-white/25 hover:text-white/60 transition-colors ml-auto shrink-0">
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plans grid */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06]">

          {/* ── Starter ─────────────────────────────────────── */}
          <div className="p-8 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30 mb-3">Starter</p>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="text-white text-4xl font-black">Free</span>
              </div>
              <p className="text-white/30 text-xs">No card required</p>
            </div>

            <ul className="space-y-3 flex-1">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-3">
                  <span className="text-white/40 text-xs">{f.label}</span>
                  <FeatureValue value={f.starter} />
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <div className="w-full py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/30 text-sm font-semibold text-center">
                Current plan
              </div>
            </div>
          </div>

          {/* ── Growth ──────────────────────────────────────── */}
          <div className="p-8 flex flex-col gap-5 bg-[#4d7fff]/[0.04] relative">
            <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#4d7fff] to-transparent" />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 rounded-full bg-[#4d7fff] text-white text-[9px] font-black uppercase tracking-widest">
                Most popular
              </span>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#4d7fff] mb-3">Growth</p>
              <div className="flex items-end gap-1.5 mb-1">
                {isAnnual && (
                  <span className="text-white/25 text-xl font-bold line-through mb-0.5">${PLANS.growth.monthly}</span>
                )}
                <span className="text-white text-4xl font-black">
                  ${isAnnual ? PLANS.growth.annually : PLANS.growth.monthly}
                </span>
                <span className="text-white/40 text-sm mb-1.5">/mo</span>
              </div>
              <p className="text-white/30 text-xs">
                {isAnnual
                  ? `Billed $${PLANS.growth.annualTotal}/yr · save $${((PLANS.growth.monthly - PLANS.growth.annually) * 12)}/yr`
                  : 'Per workspace · billed monthly'}
              </p>
            </div>

            <ul className="space-y-3 flex-1">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-3">
                  <span className="text-white/60 text-xs">{f.label}</span>
                  <FeatureValue value={f.growth} />
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <button
                onClick={() => subscribe('growth')}
                disabled={loading !== null}
                className="w-full py-3 rounded-xl bg-[#4d7fff] hover:bg-[#3d6fee] active:scale-[0.98] text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#4d7fff]/20"
              >
                {loading === 'growth'
                  ? <><Loader2 size={14} className="animate-spin" /> Redirecting…</>
                  : 'Upgrade to Growth →'}
              </button>
            </div>
          </div>

          {/* ── Business ────────────────────────────────────── */}
          <div className="p-8 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-400 mb-3">Business</p>
              <div className="flex items-end gap-1.5 mb-1">
                {isAnnual && (
                  <span className="text-white/25 text-xl font-bold line-through mb-0.5">${PLANS.business.monthly}</span>
                )}
                <span className="text-white text-4xl font-black">
                  ${isAnnual ? PLANS.business.annually : PLANS.business.monthly}
                </span>
                <span className="text-white/40 text-sm mb-1.5">/mo</span>
              </div>
              <p className="text-white/30 text-xs">
                {isAnnual
                  ? `Billed $${PLANS.business.annualTotal.toLocaleString()}/yr · save $${((PLANS.business.monthly - PLANS.business.annually) * 12)}/yr`
                  : 'Per workspace · billed monthly'}
              </p>
            </div>

            <ul className="space-y-3 flex-1">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-3">
                  <span className="text-white/60 text-xs">{f.label}</span>
                  <FeatureValue value={f.business} />
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <button
                onClick={() => subscribe('business')}
                disabled={loading !== null}
                className="w-full py-3 rounded-xl bg-amber-400/15 border border-amber-400/30 hover:bg-amber-400/25 active:scale-[0.98] text-amber-400 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading === 'business'
                  ? <><Loader2 size={14} className="animate-spin" /> Redirecting…</>
                  : 'Upgrade to Business →'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-8 py-4 flex items-center justify-center gap-6">
          {[
            { icon: <Lock size={11} />,           label: 'Secure checkout via Stripe' },
            { icon: <Shield size={11} />,         label: 'Cancel anytime'             },
            { icon: <FileText size={11} />,       label: 'No setup fees'              },
            { icon: <HeadphonesIcon size={11} />, label: 'Support on every plan'      },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-white/25 text-[10px]">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
