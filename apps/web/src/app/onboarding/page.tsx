'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import type { AgentRole, AvatarStyle, AvatarPresentation } from '@agentcity/types'
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_DESCRIPTIONS,
  GIFT_TASKS,
} from '@agentcity/types'

type Step = 'role' | 'identity' | 'connect' | 'gift' | 'result'

interface OnboardingState {
  role: AgentRole | null
  name: string
  contextBrief: string
  avatarStyle: AvatarStyle
  presentation: AvatarPresentation
  avatarUrl: string | null
  agentId: string | null
  taskId: string | null
  taskResult: unknown
  connectedProvider?: string
}

const ROLES: AgentRole[] = [
  'EXEC_ASSISTANT',
  'RESEARCH_ANALYST',
  'CONTENT_WRITER',
  'SALES_PROSPECTOR',
  'OPS_COORDINATOR',
]

const AVATAR_STYLES: AvatarStyle[] = ['PROFESSIONAL', 'CREATIVE', 'CASUAL', 'EXECUTIVE']

const SLIDE = {
  initial:   { opacity: 0, x: 40 },
  animate:   { opacity: 1, x: 0 },
  exit:      { opacity: 0, x: -40 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
}

const ROLE_INTEGRATIONS: Partial<Record<AgentRole, string[]>> = {
  EXEC_ASSISTANT:   ['GMAIL', 'GOOGLE_CALENDAR'],
  OPS_COORDINATOR:  ['GMAIL', 'GOOGLE_CALENDAR'],
  SALES_PROSPECTOR: ['GMAIL'],
}

const INTEGRATION_LABELS: Record<string, { title: string; subtitle: string }> = {
  GMAIL:           { title: 'Connect Gmail',            subtitle: 'Send emails on your behalf' },
  GOOGLE_CALENDAR: { title: 'Connect Google Calendar',  subtitle: 'Read and create calendar events' },
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
    if (connected) handleCallback(connected)
  }, [searchParams, handleCallback])

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
    } catch {
      setConnecting(null)
    }
  }

  return (
    <motion.div key="connect" {...SLIDE} className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-semibold mb-1">
          Give {agentName} superpowers.
        </h1>
        <p className="text-[#8892b0] text-sm">
          Connect your tools so {agentName} can act on your behalf.
        </p>
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
                <span className="text-[#4d7fff] text-sm">
                  {connecting === provider ? '…' : '→'}
                </span>
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

      <button
        onClick={onSkip}
        className="w-full text-center text-[#8892b0] text-sm hover:text-white transition-colors py-2"
      >
        Skip for now →
      </button>
    </motion.div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const [step, setStep] = useState<Step>('role')
  const [generating, setGenerating] = useState(false)
  const [state, setState] = useState<OnboardingState>({
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
        body: JSON.stringify({ style: state.avatarStyle, seed: state.name }),
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
      }),
    })
    const data = await res.json()
    patch({ agentId: data.agent.id })
    setStep('connect')
  }

  async function runGiftTask(agentId: string) {
    setStep('gift')
    const command = GIFT_TASKS[state.role!].withoutIntegration

    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ agentId, rawCommand: command }),
    })
    const data = await res.json()
    patch({ taskId: data.task.id })

    await pollTask(data.task.id)
  }

  async function pollTask(taskId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks/${taskId}`)
      const data = await res.json()
      if (data.task.status === 'COMPLETE' || data.task.status === 'FAILED') {
        patch({ taskResult: data.task.result })
        setStep('result')
        return
      }
    }
    setStep('result')
  }

  return (
    <div className="min-h-screen bg-[#12172b] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">

          {/* ── STEP: Role ─────────────────────────────────────── */}
          {step === 'role' && (
            <motion.div key="role" {...SLIDE}>
              <h1 className="text-white text-2xl font-semibold mb-2">
                Your office is quiet.
              </h1>
              <p className="text-[#8892b0] mb-8">Who do you want to hire first?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => { patch({ role }); setStep('identity') }}
                    className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#4d7fff]/50 p-4 transition-all"
                  >
                    <p className="text-white font-medium text-sm">{AGENT_ROLE_LABELS[role]}</p>
                    <p className="text-[#8892b0] text-xs mt-1">{AGENT_ROLE_DESCRIPTIONS[role]}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── STEP: Identity ─────────────────────────────────── */}
          {step === 'identity' && (
            <motion.div key="identity" {...SLIDE} className="space-y-6">
              <div>
                <h1 className="text-white text-2xl font-semibold mb-1">Give them a name.</h1>
                <p className="text-[#8892b0] text-sm">And a face.</p>
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
                  Tell {state.name || 'them'} about your work
                </p>
                <textarea
                  value={state.contextBrief}
                  onChange={(e) => patch({ contextBrief: e.target.value })}
                  placeholder={`e.g. "We're a B2B SaaS for HR teams. Our audience is People Ops leads at companies with 50–500 employees. Keep the tone direct and data-forward."`}
                  rows={3}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-[#8892b0] text-xs outline-none focus:border-[#4d7fff] transition-colors resize-none"
                />
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

          {/* ── STEP: Connect ──────────────────────────────────── */}
          {step === 'connect' && state.agentId && (
            <ConnectStep
              agentName={state.name}
              agentId={state.agentId}
              role={state.role!}
              getToken={getToken}
              onSkip={() => runGiftTask(state.agentId!)}
              onConnected={(provider: string) => {
                patch({ connectedProvider: provider })
                runGiftTask(state.agentId!)
              }}
            />
          )}

          {/* ── STEP: Gift task ────────────────────────────────── */}
          {step === 'gift' && (
            <motion.div key="gift" {...SLIDE} className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-[#4d7fff]/20 flex items-center justify-center mx-auto">
                <div className="w-8 h-8 rounded-full bg-[#4d7fff] animate-pulse" />
              </div>
              <h1 className="text-white text-2xl font-semibold">
                {state.name} is working…
              </h1>
              <p className="text-[#8892b0] text-sm">
                {GIFT_TASKS[state.role!].withoutIntegration}
              </p>
            </motion.div>
          )}

          {/* ── STEP: Result ───────────────────────────────────── */}
          {step === 'result' && (
            <motion.div key="result" {...SLIDE} className="space-y-6">
              <div>
                <p className="text-[#4dffa0] text-xs font-medium uppercase tracking-widest mb-1">
                  First task complete
                </p>
                <h1 className="text-white text-2xl font-semibold">
                  {state.name} is ready.
                </h1>
              </div>

              {state.taskResult != null && (
                <pre className="bg-white/5 border border-white/10 rounded-xl p-4 text-[#8892b0] text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(state.taskResult, null, 2)}
                </pre>
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
    </div>
  )
}
