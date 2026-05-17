'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Star, Sparkles, ArrowLeft } from 'lucide-react'
import type { AgentRole, AvatarStyle, AvatarPresentation } from '@agentcity/types'
import { GIFT_TASKS } from '@agentcity/types'
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES, type AgentTemplate } from '@/lib/agent-templates'

type Step = 'role' | 'identity' | 'connect' | 'gift' | 'result'

interface OnboardingState {
  template:     AgentTemplate | null
  role:         AgentRole | null
  name:         string
  contextBrief: string
  avatarStyle:  AvatarStyle
  presentation: AvatarPresentation
  avatarUrl:    string | null
  agentId:      string | null
  taskId:       string | null
  taskResult:   unknown
  connectedProvider?: string
}

const AVATAR_STYLES: AvatarStyle[] = ['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']

const SLIDE = {
  initial:    { opacity: 0, x: 40 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -40 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
}

const ROLE_INTEGRATIONS: Partial<Record<AgentRole, string[]>> = {
  EXEC_ASSISTANT:   ['GMAIL', 'GOOGLE_CALENDAR'],
  OPS_COORDINATOR:  ['GMAIL', 'GOOGLE_CALENDAR'],
  SALES_PROSPECTOR: ['GMAIL'],
}

const INTEGRATION_LABELS: Record<string, { title: string; subtitle: string }> = {
  GMAIL:           { title: 'Connect Gmail',           subtitle: 'Send emails on your behalf'      },
  GOOGLE_CALENDAR: { title: 'Connect Google Calendar', subtitle: 'Read and create calendar events' },
}

function ResultCard({ result, agentName }: { result: unknown; agentName: string }) {
  const [copied, setCopied] = useState(false)
  const res     = result as Record<string, unknown>
  const title   = typeof res?.title   === 'string' ? res.title   : null
  const content =
    typeof res?.content === 'string' ? res.content
    : typeof res?.output  === 'string' ? res.output
    : typeof res?.result  === 'string' ? res.result
    : typeof result       === 'string' ? result
    : JSON.stringify(result, null, 2)

  async function copy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-white text-sm font-medium">{title ?? `${agentName}'s first output`}</span>
        <button onClick={copy} className="text-[#8892b0] hover:text-white text-xs transition-colors">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-auto">
        <p className="text-[#8892b0] text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  )
}

interface ConnectStepProps {
  agentName:   string
  agentId:     string
  role:        AgentRole
  getToken:    () => Promise<string | null>
  onSkip:      () => void
  onConnected: (provider: string) => void
}

function ConnectStep({ agentName, agentId, role, getToken, onSkip, onConnected }: ConnectStepProps) {
  const searchParams = useSearchParams()
  const [connecting, setConnecting] = useState<string | null>(null)
  const integrations = ROLE_INTEGRATIONS[role] ?? []

  const handleCallback = useCallback(async (provider: string) => {
    const token = await getToken()
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/callback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ provider, agentId }),
    })
    onConnected(provider)
  }, [agentId, getToken, onConnected])

  useEffect(() => {
    const connected = searchParams.get('connected')
    if (!connected) return
    // Allow-list against the integrations actually offered for this role —
    // never POST the callback for an arbitrary attacker-supplied string.
    if (!integrations.includes(connected)) return
    handleCallback(connected)
  }, [searchParams, handleCallback, integrations])

  async function connect(provider: string) {
    setConnecting(provider)
    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/integrations/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ provider, agentId }),
      })
      const data = await res.json()
      if (data.redirectUrl) window.location.href = data.redirectUrl
    } catch { setConnecting(null) }
  }

  return (
    <motion.div key="connect" {...SLIDE} className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-semibold mb-1">Give {agentName} superpowers.</h1>
        <p className="text-[#8892b0] text-sm">Connect your tools so {agentName} can act on your behalf.</p>
      </div>

      {integrations.length > 0 ? (
        <div className="space-y-3">
          {integrations.map((provider) => {
            const meta = INTEGRATION_LABELS[provider]
            return (
              <button
                key={provider}
                onClick={() => connect(provider)}
                disabled={!!connecting}
                className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 text-left transition-all disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-lg bg-[#4d7fff]/20 flex items-center justify-center text-xs font-bold text-[#4d7fff]">
                  {provider[0]}
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{meta.title}</p>
                  <p className="text-[#8892b0] text-xs">{meta.subtitle}</p>
                </div>
                <span className="text-[#4d7fff] text-sm">{connecting === provider ? '…' : '→'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-[#8892b0] text-sm">
            {agentName} works with internal data — no external connections needed right now.
          </p>
        </div>
      )}

      <button onClick={onSkip} className="w-full text-center text-[#8892b0] text-sm hover:text-white transition-colors py-2">
        Skip for now →
      </button>
    </motion.div>
  )
}

export default function OnboardingPage() {
  const router       = useRouter()
  const { getToken } = useAuth()

  const [step,      setStep]      = useState<Step>('role')
  const [search,    setSearch]    = useState('')
  const [category,  setCategory]  = useState('All')
  const [generating, setGenerating] = useState(false)
  const [state, setState] = useState<OnboardingState>({
    template:     null,
    role:         null,
    name:         '',
    contextBrief: '',
    avatarStyle:  'PROFESSIONAL',
    presentation: 'NEUTRAL',
    avatarUrl:    null,
    agentId:      null,
    taskId:       null,
    taskResult:   null,
  })

  function patch(partial: Partial<OnboardingState>) {
    setState((s) => ({ ...s, ...partial }))
  }

  function selectTemplate(t: AgentTemplate) {
    patch({
      template:     t,
      role:         t.role as AgentRole,
      contextBrief: t.prompt,
    })
    setStep('identity')
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const token = await getToken()
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) },
    })
  }

  async function generateAvatar() {
    if (!state.name || !state.role) return
    setGenerating(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents/avatar`, {
        method: 'POST',
        body: JSON.stringify({ style: state.avatarStyle, seed: state.name, presentation: state.presentation }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      patch({ avatarUrl: data.url })
    } catch (err) {
      console.error('Avatar generation failed:', err)
      alert(`Could not generate avatar: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  async function createAgent() {
    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name:         state.name,
        role:         state.role,
        avatarStyle:  state.avatarStyle,
        presentation: state.presentation,
        avatarUrl:    state.avatarUrl,
        contextBrief: state.contextBrief.trim() || undefined,
        memorySeedEntries: state.template?.memory,
      }),
    })
    const data = await res.json()
    patch({ agentId: data.agent.id })
    setStep('connect')
  }

  async function runGiftTask(agentId: string) {
    setStep('gift')
    try {
      const command = GIFT_TASKS[state.role!].withoutIntegration
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({ agentId, rawCommand: command }),
      })
      const data = await res.json()
      if (!data.task?.id) {
        patch({ taskResult: { type: 'text', title: 'Note', content: data.error ?? 'Task could not be started.' } })
        setStep('result')
        return
      }
      patch({ taskId: data.task.id })
      await pollTask(data.task.id)
    } catch { setStep('result') }
  }

  async function pollTask(taskId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks/${taskId}`)
        const data = await res.json()
        if (data.task?.status === 'COMPLETE' || data.task?.status === 'FAILED') {
          patch({ taskResult: data.task.result })
          setStep('result')
          return
        }
      } catch { /* keep polling */ }
    }
    setStep('result')
  }

  const filteredTemplates = AGENT_TEMPLATES.filter((t) => {
    const matchCat    = category === 'All' || t.category === category
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">

      <AnimatePresence mode="wait">

        {/* ── STEP: Template Marketplace ─────────────────────────────── */}
        {step === 'role' && (
          <motion.div
            key="role"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            {/* Top bar */}
            <div className="border-b border-white/[0.06] px-8 py-5 flex items-end justify-between">
              <div>
                <h1 className="text-white text-2xl font-bold tracking-tight">
                  Hire your first agent.
                </h1>
                <p className="text-[#8892b0] text-sm mt-1">
                  Choose a pre-configured specialist. Takes 90 seconds.
                </p>
              </div>
              <p className="text-white/20 text-xs pb-0.5">{AGENT_TEMPLATES.length} agents available</p>
            </div>

            {/* Search + filters */}
            <div className="px-8 py-4 border-b border-white/[0.05] flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 flex-1 max-w-sm">
                <Search size={13} className="text-[#8892b0] shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents…"
                  className="flex-1 bg-transparent text-white text-sm placeholder-[#8892b0]/50 outline-none"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      category === cat
                        ? 'bg-[#4d7fff] border-[#4d7fff] text-white'
                        : 'bg-white/[0.03] border-white/[0.07] text-white/40 hover:text-white/70 hover:border-white/15'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Template grid */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                  <Search size={32} className="text-white/10" />
                  <p className="text-white/30 text-sm">No agents match your search</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
                  {filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className="group text-left rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#4d7fff]/40 transition-all p-5 flex flex-col gap-3"
                    >
                      {/* Emoji + name */}
                      <div className="flex items-start gap-3">
                        <span className="text-3xl shrink-0 leading-none">{t.avatarEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm leading-snug group-hover:text-[#4d7fff] transition-colors">
                            {t.name}
                          </p>
                          <span className="text-[#8892b0]/60 text-[10px] font-medium uppercase tracking-wide">
                            {t.category}
                          </span>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-[#8892b0] text-xs leading-relaxed flex-1 line-clamp-2">
                        {t.description}
                      </p>

                      {/* Footer: rating + installs + tags */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                        <div className="flex items-center gap-1">
                          <Star size={10} className="text-amber-400 fill-amber-400" />
                          <span className="text-amber-400 text-[10px] font-semibold">{t.rating}</span>
                        </div>
                        <span className="text-white/20 text-[10px]">·</span>
                        <span className="text-white/25 text-[10px]">{t.installs.toLocaleString()} installs</span>
                        <div className="flex gap-1 ml-auto">
                          {t.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-full bg-[#4d7fff]/10 border border-[#4d7fff]/15 text-[#4d7fff] text-[9px] font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Non-role steps (centered, narrower) ─────────────────────── */}
        {step !== 'role' && (
          <motion.div
            key="inner"
            className="flex-1 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-2xl">
              <AnimatePresence mode="wait">

                {/* ── STEP: Identity ──────────────────────────────────── */}
                {step === 'identity' && (
                  <motion.div key="identity" {...SLIDE} className="space-y-6">
                    {/* Back + template badge */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setStep('role')}
                        className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition-colors text-sm"
                      >
                        <ArrowLeft size={14} />
                        Back
                      </button>
                      {state.template && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4d7fff]/10 border border-[#4d7fff]/20">
                          <span className="text-sm leading-none">{state.template.avatarEmoji}</span>
                          <span className="text-[#4d7fff] text-xs font-semibold">{state.template.name}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <h1 className="text-white text-2xl font-semibold mb-1">Give them a name.</h1>
                      <p className="text-[#8892b0] text-sm">And a face. Make them yours.</p>
                    </div>

                    <input
                      autoFocus
                      value={state.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="Alex, Jordan, Maya…"
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-[#8892b0] outline-none focus:border-[#4d7fff] transition-colors"
                    />

                    <div>
                      <p className="text-[#8892b0] text-xs mb-2">
                        Context brief — what {state.name || 'they'} should know about your business
                      </p>
                      <textarea
                        value={state.contextBrief}
                        onChange={(e) => patch({ contextBrief: e.target.value })}
                        rows={4}
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-xs outline-none focus:border-[#4d7fff] transition-colors resize-none leading-relaxed"
                      />
                      {state.template && (
                        <p className="text-white/25 text-[10px] mt-1.5 flex items-center gap-1">
                          <Sparkles size={9} />
                          Pre-filled from {state.template.name} template — edit freely
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[#8892b0] text-xs mb-2">Avatar style</p>
                      <div className="flex gap-2">
                        {AVATAR_STYLES.map((s) => (
                          <button
                            key={s}
                            onClick={() => patch({ avatarStyle: s })}
                            className={`flex-1 rounded-lg py-2 text-xs transition-all border ${
                              state.avatarStyle === s
                                ? 'bg-[#4d7fff] border-[#4d7fff] text-white'
                                : 'bg-white/5 border-white/10 text-[#8892b0] hover:bg-white/10'
                            }`}
                          >
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[#8892b0] text-xs mb-2">Presentation</p>
                      <div className="flex gap-2">
                        {(['FEMININE', 'MASCULINE', 'NEUTRAL'] as AvatarPresentation[]).map((p) => (
                          <button
                            key={p}
                            onClick={() => patch({ presentation: p })}
                            className={`flex-1 rounded-lg py-2 text-xs transition-all border ${
                              state.presentation === p
                                ? 'bg-[#4d7fff] border-[#4d7fff] text-white'
                                : 'bg-white/5 border-white/10 text-[#8892b0] hover:bg-white/10'
                            }`}
                          >
                            {p.charAt(0) + p.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {state.avatarUrl ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={state.avatarUrl}
                          alt={state.name}
                          className="w-20 h-20 rounded-xl object-cover border border-white/10"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={generateAvatar}
                            className="text-sm text-[#8892b0] hover:text-white transition-colors"
                          >
                            Try again
                          </button>
                          <button
                            onClick={createAgent}
                            disabled={!state.name.trim()}
                            className="px-4 py-2 rounded-lg bg-[#4d7fff] text-white text-sm font-medium disabled:opacity-50"
                          >
                            Perfect →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={generateAvatar}
                        disabled={!state.name.trim() || generating}
                        className="w-full py-3 rounded-xl bg-[#4d7fff] text-white font-medium text-sm disabled:opacity-50 transition-opacity"
                      >
                        {generating ? 'Creating…' : `Generate ${state.name || 'avatar'} →`}
                      </button>
                    )}
                  </motion.div>
                )}

                {/* ── STEP: Connect ────────────────────────────────────── */}
                {step === 'connect' && state.agentId && (
                  <Suspense fallback={null}>
                    <ConnectStep
                      agentName={state.name}
                      agentId={state.agentId}
                      role={state.role!}
                      getToken={getToken}
                      onSkip={() => runGiftTask(state.agentId!)}
                      onConnected={(provider) => {
                        patch({ connectedProvider: provider })
                        runGiftTask(state.agentId!)
                      }}
                    />
                  </Suspense>
                )}

                {/* ── STEP: Gift task ──────────────────────────────────── */}
                {step === 'gift' && (
                  <motion.div key="gift" {...SLIDE} className="space-y-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#4d7fff]/20 flex items-center justify-center mx-auto">
                      {state.template ? (
                        <span className="text-3xl">{state.template.avatarEmoji}</span>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#4d7fff] animate-pulse" />
                      )}
                    </div>
                    <h1 className="text-white text-2xl font-semibold">
                      {state.name} is doing your first task.
                    </h1>
                    <p className="text-[#8892b0] text-sm">
                      {GIFT_TASKS[state.role!].withoutIntegration}
                    </p>
                  </motion.div>
                )}

                {/* ── STEP: Result ─────────────────────────────────────── */}
                {step === 'result' && (
                  <motion.div key="result" {...SLIDE} className="space-y-6">
                    <div>
                      <p className="text-[#4dffa0] text-xs font-medium uppercase tracking-widest mb-1">Done.</p>
                      <h1 className="text-white text-2xl font-semibold">
                        {state.name} delivered. Here's what they produced.
                      </h1>
                    </div>

                    {state.taskResult != null ? (
                      <ResultCard result={state.taskResult} agentName={state.name} />
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[#8892b0] text-sm">
                          Task ran but no output was captured. Your agent is ready to work.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => router.push('/office')}
                        className="flex-1 py-3 rounded-xl bg-[#4d7fff] text-white font-medium text-sm"
                      >
                        Go to your office →
                      </button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
