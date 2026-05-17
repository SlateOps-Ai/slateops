'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Send, Mic } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'

type SubmitState = 'idle' | 'loading' | 'clarifying' | 'error'

interface CreditError {
  error:   string
  detail:  string
  byok:    boolean
  actions: { label: string; url: string; primary: boolean }[]
}

// Browser SpeechRecognition — not in all TS lib sets
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 5)  return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Working late'
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now  = Date.now()
  const diff = Math.max(0, now - then)
  const min  = Math.floor(diff / 60_000)
  if (min < 1)        return 'just now'
  if (min < 60)       return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)        return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

const EXAMPLE_PROMPTS = [
  'Draft a follow-up to my Tuesday meeting and send it',
  'Research our top three competitors and summarise in 5 bullets',
  'Write a LinkedIn post about our latest feature launch',
]

export function CockpitHero() {
  const router     = useRouter()
  const { user }   = useUser()
  const authFetch  = useAuthFetch()
  const agents     = useAgentsStore((s) => s.agents)
  const tasks      = useAgentsStore((s) => s.tasks)
  const upsertTask = useAgentsStore((s) => s.upsertTask)

  const [value, setValue]         = useState('')
  const [state, setState]         = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg]   = useState('')
  const [question, setQuestion]   = useState('')
  const [creditError, setCreditError] = useState<CreditError | null>(null)
  const [listening, setListening] = useState(false)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<any>(null)
  useEffect(() => () => { recognizerRef.current?.abort() }, [])

  // ── Situation line inputs ─────────────────────────────────────────
  const idleAgents = agents.filter((a) => a.status === 'IDLE').length
  const totalAgents = agents.length
  const workingAgents = agents.filter((a) => a.status === 'WORKING').length

  const recentCompleted = tasks
    .filter((t) => t.status === 'COMPLETE' && t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]

  const firstName = user?.firstName?.trim() || user?.fullName?.split(' ')[0] || 'there'
  const greet     = greeting(new Date())

  // Two visual states only — no artificial loading grace, because in dev
  // mode (Next.js Fast Refresh + StrictMode) the timer was unreliable and
  // left users staring at "Loading…" indefinitely. Better to show "empty +
  // Hire button" immediately on zero agents: if the fetch comes back with
  // agents, they replace the empty state in one render.
  const isEmpty = totalAgents === 0

  const situation = (() => {
    if (isEmpty) return 'Your office is empty — hire your first agent to get started.'
    if (workingAgents > 0) {
      const names = agents.filter((a) => a.status === 'WORKING').slice(0, 2).map((a) => a.name).join(' and ')
      return `${workingAgents} agent${workingAgents > 1 ? 's' : ''} working${names ? ` (${names})` : ''} · ${idleAgents} idle.`
    }
    if (recentCompleted?.completedAt) {
      const who = agents.find((a) => a.id === recentCompleted.agentId)?.name ?? 'Your team'
      return `${idleAgents} agent${idleAgents === 1 ? '' : 's'} idle. ${who} finished "${recentCompleted.title.slice(0, 60)}" ${relativeTime(recentCompleted.completedAt)}.`
    }
    return `${idleAgents} agent${idleAgents === 1 ? '' : 's'} idle, waiting for a task.`
  })()

  // ── Submit ───────────────────────────────────────────────────────
  async function submit(cmd = value.trim()) {
    if (!cmd || state === 'loading') return
    setValue('')
    setState('loading')
    setErrorMsg('')
    setQuestion('')
    setCreditError(null)

    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks`, {
        method: 'POST',
        body:   JSON.stringify({ rawCommand: cmd }),
      })

      if (res.status === 402) {
        const body = await res.json().catch(() => null)
        if (body?.code === 'NO_CREDITS' && body.actions) {
          setCreditError(body as CreditError)
        } else {
          setErrorMsg('No credits remaining.')
        }
        setState('error')
        return
      }

      const data = await res.json()

      if (data.clarification) {
        setQuestion(data.question ?? 'Can you clarify?')
        setState('clarifying')
        return
      }

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong.')
        setState('error')
        return
      }

      if (data.task) {
        upsertTask({ id: data.task.id, agentId: data.task.agentId, title: data.task.title, status: 'IN_PROGRESS' })
      }
      setState('idle')
    } catch {
      setErrorMsg('Could not reach the server.')
      setState('error')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'Escape') {
      setState('idle'); setQuestion(''); setErrorMsg(''); setCreditError(null)
    }
  }

  const toggleVoice = useCallback(() => {
    if (!SpeechRecognitionAPI) return
    if (listening) { recognizerRef.current?.stop(); setListening(false); return }
    const rec = new SpeechRecognitionAPI()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript ?? ''
      if (t) setValue((p) => (p ? `${p} ${t}` : t))
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    rec.start()
    recognizerRef.current = rec
    setListening(true)
  }, [listening])

  const busy = state === 'loading'

  // ── Render ────────────────────────────────────────────────────────
  // Positioned in the same canvas region the old hero occupied, but
  // dramatically more compact — situation line + command + 3 example pills
  // instead of a giant wordmark + tagline + decorative legend.
  return (
    <div className="absolute left-[184px] right-0 top-0 z-20 flex justify-center pt-12 px-4 pointer-events-none">
      <div className="w-full max-w-[640px] flex flex-col items-stretch gap-3 pointer-events-auto">

        {/* Greeting + situation */}
        <div className="text-center select-none">
          <p className="text-[13px] tracking-[0.18em] uppercase text-amber-400/80 font-semibold mb-1">
            {greet}, {firstName}
          </p>
          <p className="text-[15px] text-white/65 leading-snug">
            {situation}
          </p>
        </div>

        {/* Clarification banner */}
        <AnimatePresence>
          {state === 'clarifying' && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-3 rounded-xl bg-panel-bg/90 border border-panel-accent/40 px-4 py-3 backdrop-blur-sm"
            >
              <span className="text-panel-accent text-xs mt-0.5">?</span>
              <p className="text-white text-sm flex-1">{question}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={cn(
                'rounded-xl bg-panel-bg/90 border backdrop-blur-sm px-4 py-3',
                creditError ? 'border-amber-400/30' : 'border-lamp-blocked/40',
              )}
            >
              {creditError ? (
                <div className="flex flex-col gap-2">
                  <p className="text-white text-sm font-medium">{creditError.error}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{creditError.detail}</p>
                  <div className="flex gap-2 mt-1">
                    {creditError.actions.map((action) => (
                      <a
                        key={action.label}
                        href={action.url}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                          action.primary
                            ? 'bg-[#4d7fff] text-white hover:bg-[#3d6fee]'
                            : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10',
                        )}
                      >
                        {action.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-lamp-blocked text-sm">{errorMsg}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty-office CTA — replaces the command input when there are no
            agents yet. Sending a task into a zero-agent office would always
            error, so we route to onboarding instead. */}
        {isEmpty && (
          <button
            onClick={() => router.push('/onboarding')}
            className="mt-2 w-full px-5 py-4 rounded-2xl bg-panel-accent text-white text-[15px] font-semibold hover:bg-panel-accent/85 transition-colors shadow-2xl shadow-black/40"
          >
            Hire your first agent →
          </button>
        )}

        {/* Command input — hidden when empty so we don't tempt the user
            into typing a command with no agent to run it. */}
        {!isEmpty && (
        <div className={cn(
          'flex items-end rounded-2xl border bg-panel-bg/95 backdrop-blur-md shadow-2xl shadow-black/40 transition-colors',
          busy             ? 'border-panel-accent/60' : 'border-white/10 hover:border-white/20 focus-within:border-panel-accent/60',
          state === 'error' && 'border-lamp-blocked/40',
        )}>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              state === 'clarifying'
                ? 'Reply to clarify…'
                : busy
                ? 'Routing to your team…'
                : 'Tell your team what to do — Enter to send'
            }
            disabled={busy}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-white/30 text-[15px] outline-none disabled:opacity-60 resize-none px-5 py-4 min-h-[56px] max-h-[200px] leading-relaxed"
          />
          <div className="flex items-center gap-1 pr-2 pb-2 pl-1">
            <button
              onClick={toggleVoice}
              title={SpeechRecognitionAPI ? (listening ? 'Stop recording' : 'Speak command') : 'Voice input not supported'}
              disabled={!SpeechRecognitionAPI}
              className={cn(
                'p-2 rounded-lg transition-colors shrink-0',
                listening
                  ? 'text-lamp-blocked bg-lamp-blocked/10 animate-pulse'
                  : 'text-panel-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <Mic size={16} />
            </button>
            <button
              onClick={() => submit()}
              disabled={!value.trim() || busy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors shrink-0',
                value.trim() && !busy
                  ? 'bg-panel-accent text-white hover:bg-panel-accent/85'
                  : 'bg-white/5 text-panel-muted cursor-not-allowed',
              )}
            >
              <Send size={14} />
              Send
            </button>
          </div>
        </div>
        )}

        {/* Example prompts — hidden once the user has any task history,
            during loading, or when there are zero agents to route to. */}
        {!isEmpty && tasks.length === 0 && state === 'idle' && (
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => submit(p)}
                className="px-3 py-1.5 rounded-full text-[12px] text-white/55 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/85 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
