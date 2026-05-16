'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2, Sparkles, Check, Plug } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'
import { INTEGRATION_CATALOG, findCatalogApp } from '@agentcity/types'

interface ComposedAgent {
  role:      string
  name:      string
  firstTask: string
}

const ROLE_LABELS: Record<string, string> = {
  EXEC_ASSISTANT:       'Executive Assistant',
  RESEARCH_ANALYST:     'Research Analyst',
  CONTENT_WRITER:       'Content Writer',
  SALES_PROSPECTOR:     'Sales Prospector',
  OPS_COORDINATOR:      'Operations Coordinator',
  FINANCIAL_ANALYST:    'Financial Analyst',
  HR_MANAGER:           'HR Manager',
  CUSTOMER_SUPPORT:     'Customer Support',
  DATA_ANALYST:         'Data Analyst',
  MARKETING_STRATEGIST: 'Marketing Strategist',
}

interface Props {
  onComplete: () => void
  onSkip:     () => void
}

export function OnboardingTakeover({ onComplete, onSkip }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [step, setStep]             = useState<1 | 2 | 'loading' | 'preview' | 'integrations' | 'installing'>(1)
  const [business, setBusiness]     = useState('')
  const [pain, setPain]             = useState('')
  const [team, setTeam]             = useState<ComposedAgent[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [suggestedApps,  setSuggestedApps]  = useState<string[]>([])
  const [connectedApps,  setConnectedApps]  = useState<Set<string>>(new Set())
  const [connectingApp,  setConnectingApp]  = useState<string | null>(null)
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const setAgents             = useAgentsStore((s) => s.setAgents)
  const setTeamChatOpen       = useAgentsStore((s) => s.setTeamChatOpen)
  const setActiveChatAgent    = useAgentsStore((s) => s.setActiveChatAgent)
  const setPendingFirstTask   = useAgentsStore((s) => s.setPendingFirstTask)
  const setArrivingAgentIds   = useAgentsStore((s) => s.setArrivingAgentIds)

  async function submit() {
    setStep('loading')
    setError(null)
    try {
      const res = await authFetch(`${API}/api/onboarding/compose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ businessDescription: business.trim(), topPainPoint: pain.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not compose team')
      setTeam(data.agents ?? [])
      setStep('preview')
    } catch (err) {
      setError((err as Error).message)
      setStep(2)
    }
  }

  async function goToIntegrations() {
    setStep('integrations')
    setLoadingSuggest(true)
    try {
      const [sugRes, conRes] = await Promise.all([
        authFetch(`${API}/api/integrations/suggest`, { method: 'POST', body: JSON.stringify({}) }),
        authFetch(`${API}/api/integrations/connections`),
      ])
      const sug = await sugRes.json()
      const con = await conRes.json()
      const apps: string[] = Array.isArray(sug.suggestions) ? sug.suggestions : []
      setSuggestedApps(apps)
      setConnectedApps(new Set((con.connections ?? []).map((c: { composioAppName: string }) => c.composioAppName)))
    } catch {
      // Fall back to a sensible default trio
      setSuggestedApps(['gmail', 'google_calendar', 'slack'])
    } finally {
      setLoadingSuggest(false)
    }
  }

  // Listen for the OAuth popup completion message
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.data?.type !== 'composio_oauth_complete')   return
      const appName = ev.data?.composioAppName as string | undefined
      if (!appName) return
      // Record the connection on the server
      authFetch(`${API}/api/integrations/callback`, {
        method:  'POST',
        body:    JSON.stringify({ composioAppName: appName }),
      })
      .then(() => {
        setConnectedApps((s) => new Set(s).add(appName))
      })
      .catch(() => {})
      .finally(() => setConnectingApp(null))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [API, authFetch])

  async function connectApp(composioAppName: string) {
    setConnectingApp(composioAppName)
    try {
      const res  = await authFetch(`${API}/api/integrations/connect`, {
        method: 'POST',
        body:   JSON.stringify({ composioAppName }),
      })
      const data = await res.json()
      if (!data.redirectUrl) {
        setConnectingApp(null)
        return
      }
      // Open the OAuth flow in a popup so the takeover state stays alive
      const popup = window.open(data.redirectUrl, 'composio_oauth', 'width=600,height=720,popup=1')
      if (!popup) {
        // Popups blocked — fall back to full redirect (state lost, but still completes)
        window.location.href = data.redirectUrl
      }
    } catch {
      setConnectingApp(null)
    }
  }

  async function installAndComplete() {
    setStep('installing')
    setError(null)
    try {
      const res = await authFetch(`${API}/api/onboarding/install`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not install your team')

      if (Array.isArray(data.agents) && data.agents.length > 0) {
        setAgents(data.agents)

        // Match the first composed agent (by name + role) to the newly installed record
        const firstComposed = team[0]
        const firstAgent    = firstComposed
          ? data.agents.find((a: { name: string; role: string }) =>
              a.name === firstComposed.name && a.role === firstComposed.role)
          : data.agents[0]

        // Trigger the walk-in animation for all newly installed agents.
        // Ordered by composedAgents (the takeover preview order) so stagger matches the user's expectation.
        const newAgentIds: string[] = team
          .map((c) => data.agents.find((a: { name: string; role: string }) =>
            a.name === c.name && a.role === c.role)?.id)
          .filter((id: string | undefined): id is string => !!id)
        setArrivingAgentIds(newAgentIds)

        if (firstAgent && firstComposed?.firstTask) {
          setPendingFirstTask({ agentId: firstAgent.id, taskText: firstComposed.firstTask })

          // Open Team Chat AFTER the walk-in animation completes so the user sees the spectacle first.
          // Stagger: 0.7s per agent, last agent walks for 1.4s, +0.4s buffer.
          const animDurationMs = (newAgentIds.length - 1) * 700 + 1400 + 400
          setTimeout(() => {
            setActiveChatAgent(firstAgent.id)
            setTeamChatOpen(true)
          }, animDurationMs)
        }
      }
      onComplete()
    } catch (err) {
      setError((err as Error).message)
      setStep('preview')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-[#080b14]/95 backdrop-blur-md flex items-center justify-center px-6"
    >
      <div className="w-full max-w-[640px]">
        {/* Skip link */}
        <button
          onClick={onSkip}
          className="absolute top-6 right-6 text-white/30 hover:text-white/60 text-xs transition-colors"
        >
          Skip for now
        </button>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-panel-accent" />
                <span className="text-[10px] uppercase tracking-widest text-panel-accent font-semibold">Step 1 of 2</span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-3">
                Before we start — what does your business actually do?
              </h1>
              <p className="text-white/40 text-sm mb-6 leading-relaxed">
                Plain English is fine. The more specific you are, the better we can tailor your team.
              </p>
              <textarea
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                rows={4}
                autoFocus
                placeholder="e.g. We run a boutique B2B consulting firm focused on healthcare ops…"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 resize-none focus:outline-none focus:border-panel-accent/50 transition-colors"
              />
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={business.trim().length < 3}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-panel-accent" />
                <span className="text-[10px] uppercase tracking-widest text-panel-accent font-semibold">Step 2 of 2</span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-3">
                What's the most time-consuming thing on your plate this week?
              </h1>
              <p className="text-white/40 text-sm mb-6 leading-relaxed">
                We'll build your office around delegating this first.
              </p>
              <textarea
                value={pain}
                onChange={(e) => setPain(e.target.value)}
                rows={4}
                autoFocus
                placeholder="e.g. Manually drafting LinkedIn posts and chasing competitor news every Monday morning…"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 resize-none focus:outline-none focus:border-panel-accent/50 transition-colors"
              />
              {error && (
                <p className="text-red-400 text-xs mt-2">{error}</p>
              )}
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="text-white/40 hover:text-white text-xs transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={submit}
                  disabled={pain.trim().length < 3}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Compose my team <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <Loader2 size={28} className="text-panel-accent animate-spin mb-4" />
              <p className="text-white/60 text-sm">Assembling your team…</p>
            </motion.div>
          )}

          {step === 'installing' && (
            <motion.div
              key="installing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <Loader2 size={28} className="text-panel-accent animate-spin mb-4" />
              <p className="text-white/60 text-sm">Setting up your office…</p>
            </motion.div>
          )}

          {step === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Check size={14} className="text-emerald-400" />
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">Recommended team</span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-2">
                Here's your office.
              </h1>
              <p className="text-white/40 text-sm mb-6 leading-relaxed">
                {team.length} agent{team.length === 1 ? '' : 's'}, each with a first job already lined up.
              </p>

              <div className="space-y-2 mb-6">
                {team.map((a, i) => (
                  <motion.div
                    key={a.role + i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/8 px-4 py-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-panel-accent/30 to-purple-500/20 border border-panel-accent/30 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{a.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-semibold">{a.name}</p>
                        <span className="text-white/30 text-xs">·</span>
                        <p className="text-white/60 text-xs">{ROLE_LABELS[a.role] ?? a.role}</p>
                      </div>
                      <p className="text-white/45 text-xs mt-1 leading-relaxed">
                        First job: {a.firstTask}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {error && (
                <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-white/40 hover:text-white text-xs transition-colors"
                >
                  ← Revise my answers
                </button>
                <button
                  onClick={goToIntegrations}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    'bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white',
                  )}
                >
                  Next: connect their tools <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'integrations' && (
            <motion.div
              key="integrations"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Plug size={14} className="text-panel-accent" />
                <span className="text-[10px] uppercase tracking-widest text-panel-accent font-semibold">
                  Final step — connect your tools
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-2">
                Hook them up to the apps you already use.
              </h1>
              <p className="text-white/40 text-sm mb-6 leading-relaxed">
                We picked a few based on what you told us. One tap each — your agents will ask before doing anything risky. You can do this later if you'd rather.
              </p>

              {loadingSuggest ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="text-panel-accent animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 mb-6">
                  {suggestedApps.map((appId) => {
                    const meta = findCatalogApp(appId)
                    if (!meta) return null
                    const isConnected = connectedApps.has(appId)
                    const isConnecting = connectingApp === appId
                    return (
                      <button
                        key={appId}
                        onClick={() => !isConnected && connectApp(appId)}
                        disabled={isConnected || !!connectingApp}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all',
                          isConnected
                            ? 'bg-emerald-400/10 border-emerald-400/30'
                            : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-panel-accent/30',
                          (!isConnected && connectingApp) && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        <span className="text-xl shrink-0 leading-none">{meta.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[13px] font-semibold truncate">{meta.label}</p>
                          <p className="text-white/40 text-[10px] truncate">{meta.description}</p>
                        </div>
                        {isConnected ? (
                          <Check size={14} className="text-emerald-400 shrink-0" />
                        ) : isConnecting ? (
                          <Loader2 size={14} className="text-panel-accent animate-spin shrink-0" />
                        ) : (
                          <span className="text-white/30 text-[11px] shrink-0">Connect →</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('preview')}
                  className="text-white/40 hover:text-white text-xs transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={installAndComplete}
                  disabled={!!connectingApp}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    'bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white disabled:opacity-50',
                  )}
                >
                  {connectedApps.size > 0 ? 'Take me to the office' : 'Skip and take me to the office'} <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
