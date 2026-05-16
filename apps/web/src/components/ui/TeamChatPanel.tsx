'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Send, ThumbsUp, ThumbsDown, Copy, Check,
  Pencil, RotateCw, Mic, Sparkles, MessageSquare, Home, Calendar,
} from 'lucide-react'

const MARKETING_ROLES = new Set(['CONTENT_WRITER', 'MARKETING_STRATEGIST', 'SALES_PROSPECTOR'])
import { useUser } from '@clerk/nextjs'
import { useAgentsStore } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'
import { AgentActionsHeader } from '@/components/ui/AgentActionsHeader'
import { SlateText } from '@/components/ui/SlateText'
import { SlateCaretLogo } from '@/components/branding/SlateCaretLogo'
import { AGENT_ROLE_LABELS, findCatalogApp, canRoleUseApp } from '@agentcity/types'
import type { AgentStatus, AgentRole } from '@agentcity/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DraftPost { content: string; platform: string; suggestedAt?: string }
interface Message { role: 'user' | 'assistant'; content: string; draftPost?: DraftPost | null }
interface PromptSuggestion { command: string; rationale: string }
interface CreditError {
  error: string; detail: string; byok: boolean
  actions: { label: string; url: string; primary: boolean }[]
}
type ThreadMap = Record<string, Message[]>
type TaskIdMap = Record<string, string>
type RatedMap  = Record<string, boolean>
type CmdState  = 'idle' | 'loading' | 'clarifying' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_DOT: Record<AgentStatus, string> = {
  IDLE: 'bg-lamp-idle', WORKING: 'bg-lamp-working',
  BLOCKED: 'bg-lamp-blocked', OFFLINE: 'bg-white/20',
}
const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE: 'Idle', WORKING: 'Working…',
  BLOCKED: 'Needs input', OFFLINE: 'Offline',
}
const THINKING_STEPS = ['Routing', 'Analysing', 'Delegating', 'Orchestrating', 'Dispatching']

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCopy() {
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const copy = useCallback((text: string, id: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
    }).catch(() => {})
  }, [])
  return { copiedId, copy }
}

function useAgentPrompts(agentId: string | null) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [prompts,  setPrompts]  = useState<PromptSuggestion[]>([])
  const [loading,  setLoading]  = useState(false)
  const [spinning, setSpinning] = useState(false)

  const load = useCallback(async (manual = false) => {
    if (!agentId) return
    if (manual) setSpinning(true)
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/agents/${agentId}/suggestions?count=5`)
      const data = await res.json()
      if (Array.isArray(data.suggestions)) setPrompts(data.suggestions)
    } catch { /* silent */ } finally {
      setLoading(false)
      if (manual) setTimeout(() => setSpinning(false), 600)
    }
  }, [agentId, API, authFetch])

  useEffect(() => { setPrompts([]); if (agentId) load() }, [agentId]) // eslint-disable-line
  return { prompts, loading, spinning, refresh: () => load(true) }
}

// ── CEO Command Panel (replaces CommandBar) ───────────────────────────────────
function CeoCommandPanel({ onHeaderMouseDown: _onHeaderMouseDown }: { onSelectAgent?: (id: string) => void; onHeaderMouseDown?: (e: React.MouseEvent) => void }) {
  const upsertTask = useAgentsStore((s) => s.upsertTask)
  const authFetch  = useAuthFetch()
  const API        = process.env.NEXT_PUBLIC_API_URL

  const [value,       setValue]       = useState('')
  const [cmdState,    setCmdState]    = useState<CmdState>('idle')
  const [question,    setQuestion]    = useState('')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [creditError, setCreditError] = useState<CreditError | null>(null)
  const [listening,   setListening]   = useState(false)
  const [visibleSteps,setVisibleSteps]= useState<number[]>([])
  const [activeStep,  setActiveStep]  = useState(0)

  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<any>(null)

  useEffect(() => () => { recognizerRef.current?.abort() }, [])

  useEffect(() => {
    if (cmdState !== 'loading') { setVisibleSteps([]); setActiveStep(0); return }
    setVisibleSteps([0]); setActiveStep(0)
    const timers = THINKING_STEPS.slice(1).map((_, i) =>
      setTimeout(() => { setVisibleSteps((p) => [...p, i + 1]); setActiveStep(i + 1) }, (i + 1) * 900)
    )
    return () => timers.forEach(clearTimeout)
  }, [cmdState])

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
    rec.start(); recognizerRef.current = rec; setListening(true)
  }, [listening])

  async function submit(cmd = value.trim()) {
    if (!cmd || cmdState === 'loading') return
    setValue(''); setCmdState('loading'); setQuestion(''); setErrorMsg(''); setCreditError(null)
    try {
      const res = await authFetch(`${API}/api/tasks`, {
        method: 'POST', body: JSON.stringify({ rawCommand: cmd }),
      })
      if (res.status === 402) {
        const body = await res.json().catch(() => null)
        if (body?.code === 'NO_CREDITS' && body.actions) setCreditError(body as CreditError)
        else setErrorMsg('No credits remaining.')
        setCmdState('error'); return
      }
      const data = await res.json()
      if (data.clarification) { setQuestion(data.question ?? 'Can you clarify?'); setCmdState('clarifying'); return }
      if (!res.ok) { setErrorMsg(data.error ?? 'Something went wrong.'); setCmdState('error'); return }
      if (data.task) upsertTask({ id: data.task.id, agentId: data.task.agentId, title: data.task.title, status: 'IN_PROGRESS' })
      setCmdState('idle')
    } catch { setErrorMsg('Could not reach the server.'); setCmdState('error') }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'Escape') { setCmdState('idle'); setQuestion(''); setErrorMsg('') }
  }

  function dismiss() { setCmdState('idle'); setQuestion(''); setErrorMsg(''); setCreditError(null) }

  const busy = cmdState === 'loading'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/[0.07] shrink-0 flex items-center gap-2">
        <Sparkles size={13} className="text-panel-accent shrink-0" />
        <p className="text-white text-sm font-semibold flex-1">Command Center</p>
        <p className="text-panel-muted text-[10px] truncate">Routes to the best agent</p>
      </div>

      {/* Scrollable middle */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-none">

        {/* Thinking bubbles */}
        <AnimatePresence>
          {visibleSteps.length > 0 && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-start gap-2"
            >
              {visibleSteps.map((idx) => {
                const isActive = idx === activeStep
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10, scale: 0.92 }}
                    animate={{ opacity: isActive ? 1 : 0.35, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.08]"
                  >
                    <span className={cn('text-sm font-medium', isActive ? 'text-white' : 'text-white/35')}>
                      {THINKING_STEPS[idx]}
                    </span>
                    {isActive
                      ? <span className="flex items-end gap-[3px] h-4">
                          {[0,1,2].map((i) => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-panel-accent animate-bounce"
                              style={{ animationDelay: `${i * 160}ms`, animationDuration: '0.9s' }} />
                          ))}
                        </span>
                      : <span className="text-white/20 text-xs tracking-widest">···</span>}
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clarification */}
        <AnimatePresence>
          {cmdState === 'clarifying' && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 rounded-xl bg-panel-bg border border-panel-accent/40 px-4 py-3">
              <span className="text-panel-accent text-xs mt-0.5">?</span>
              <p className="text-white text-sm flex-1">{question}</p>
              <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {cmdState === 'error' && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className={cn('rounded-xl bg-panel-bg border px-4 py-3', creditError ? 'border-amber-400/30' : 'border-lamp-blocked/40')}>
              {creditError ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{creditError.error}</p>
                      <p className="text-white/45 text-xs mt-0.5 leading-relaxed">{creditError.detail}</p>
                    </div>
                    <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors shrink-0"><X size={14} /></button>
                  </div>
                  <div className="flex gap-2 pl-4">
                    {creditError.actions.map((a) => (
                      <a key={a.label} href={a.url} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        a.primary ? 'bg-[#4d7fff] text-white hover:bg-[#3d6fee]' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white')}>
                        {a.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-lamp-blocked shrink-0" />
                  <p className="text-lamp-blocked text-sm flex-1">{errorMsg}</p>
                  <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors"><X size={14} /></button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle empty state with subtle brand watermark */}
        {cmdState === 'idle' && visibleSteps.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-8 text-center">
            <div className="opacity-[0.12] hover:opacity-[0.18] transition-opacity duration-700">
              <SlateCaretLogo size={96} variant="amber" animate={false} />
            </div>
            <p className="text-panel-muted/60 text-xs leading-relaxed max-w-xs">
              Type a command and it will be routed to the right agent automatically.<br />
              Or click an agent on the left to chat directly.
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/[0.07] shrink-0">
        <div className={cn(
          'flex flex-col rounded-xl border transition-colors',
          busy ? 'border-panel-accent/60 bg-white/[0.03]' : 'border-white/10 bg-white/[0.02]',
        )}>
          {busy && <span className="w-1.5 h-1.5 rounded-full bg-panel-accent animate-pulse mx-4 mt-3" />}
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={busy ? 'Routing to your team…' : cmdState === 'clarifying' ? 'Reply to clarify…' : 'Tell your team what to do…'}
            disabled={busy}
            rows={4}
            className="flex-1 bg-transparent text-white placeholder-panel-muted text-sm outline-none disabled:opacity-60 resize-none px-4 pt-3 pb-2"
          />
          <div className="flex items-center justify-end gap-1 px-3 pb-3">
            <button onClick={toggleVoice}
              disabled={!SpeechRecognitionAPI}
              className={cn('p-1.5 rounded-lg transition-colors',
                listening ? 'text-lamp-blocked bg-lamp-blocked/10 animate-pulse' : 'text-panel-muted hover:text-white hover:bg-white/10 disabled:opacity-30')}>
              <Mic size={15} />
            </button>
            <button onClick={() => submit()}
              disabled={!value.trim() || busy}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                value.trim() && !busy ? 'bg-panel-accent text-white hover:bg-panel-accent/80' : 'bg-white/5 text-panel-muted cursor-not-allowed')}>
              <Send size={13} /> Send
            </button>
          </div>
        </div>
        <p className="text-panel-muted/35 text-[10px] mt-1.5 text-right">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// ── Direct agent chat panel ────────────────────────────────────────────────────
function AgentChatArea({
  agentId,
  threads,
  addMessage,
  lastTaskIds,
  setLastTaskIds,
  rated,
  setRated,
  onHeaderMouseDown,
}: {
  agentId:       string
  threads:       ThreadMap
  addMessage:    (id: string, m: Message) => void
  lastTaskIds:   TaskIdMap
  setLastTaskIds:(fn: (p: TaskIdMap) => TaskIdMap) => void
  rated:         RatedMap
  setRated:      (fn: (p: RatedMap) => RatedMap) => void
  onHeaderMouseDown?: (e: React.MouseEvent) => void
}) {
  const agents              = useAgentsStore((s) => s.agents)
  const pendingFirstTask    = useAgentsStore((s) => s.pendingFirstTask)
  const setPendingFirstTask = useAgentsStore((s) => s.setPendingFirstTask)
  const authFetch           = useAuthFetch()
  const API                 = process.env.NEXT_PUBLIC_API_URL

  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [showRating,    setShowRating]    = useState(false)
  const [pulseSend,     setPulseSend]     = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const { copiedId, copy } = useCopy()
  const { prompts, loading: promptsLoading, spinning: promptsSpinning, refresh: refreshPrompts } =
    useAgentPrompts(agentId)

  const agent    = agents.find((a) => a.id === agentId)
  const messages = threads[agentId] ?? []
  const role     = agent
    ? (AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role)
    : ''

  useEffect(() => { setInput(''); setShowRating(false); setTimeout(() => inputRef.current?.focus(), 80) }, [agentId])
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` }, [input])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, agentId])

  // Pre-fill input from onboarding's first-task suggestion (chunk 5)
  useEffect(() => {
    if (pendingFirstTask && pendingFirstTask.agentId === agentId) {
      setInput(pendingFirstTask.taskText)
      setPulseSend(true)
      setPendingFirstTask(null)
    }
  }, [pendingFirstTask, agentId, setPendingFirstTask])

  if (!agent) return null

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    addMessage(agentId, { role: 'user', content: userMsg })
    setLoading(true); setShowRating(false)
    try {
      const res  = await authFetch(`${API}/api/agents/${agentId}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: (threads[agentId] ?? []).slice(-10) }),
      })
      const data = await res.json()
      addMessage(agentId, { role: 'assistant', content: data.reply ?? 'No response.', draftPost: data.draftPost ?? null })
      if (data.taskId) setLastTaskIds((p) => ({ ...p, [agentId]: data.taskId }))
    } catch {
      addMessage(agentId, { role: 'assistant', content: 'Something went wrong. Please try again.' })
    } finally { setLoading(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function submitRating(rating: 'POSITIVE' | 'NEGATIVE') {
    if (!lastTaskIds[agentId]) return
    setRated((p) => ({ ...p, [agentId]: true })); setShowRating(false)
    authFetch(`${API}/api/tasks/${lastTaskIds[agentId]}/feedback`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    }).catch(() => {})
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Compact action header — agent identity already shown in the top picker row */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-2 border-b border-white/[0.04] shrink-0">
        <AgentActionsHeader agentId={agent.id} agentName={agent.name} isPublic={agent.isPublic ?? false} />
        {MARKETING_ROLES.has(agent.role) && (
          <button
            onClick={() => useAgentsStore.getState().openScheduler(agent.id)}
            className="p-1.5 rounded-md border border-panel-accent/30 bg-panel-accent/10 text-panel-accent hover:bg-panel-accent/15 transition-colors shrink-0"
            title="Schedule a post"
          >
            <Calendar size={11} />
          </button>
        )}
      </div>

      {/* Rating overlay */}
      <AnimatePresence>
        {showRating && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-0 bottom-0 z-10 px-4 py-5 bg-panel-bg border-t border-white/[0.08] flex flex-col items-center gap-3">
            <p className="text-white text-sm font-medium">How did {agent.name} do?</p>
            <p className="text-panel-muted text-[11px] -mt-1">Your rating helps improve agent performance</p>
            <div className="flex gap-3 mt-1">
              <button onClick={() => submitRating('POSITIVE')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lamp-done/15 border border-lamp-done/30 text-lamp-done hover:bg-lamp-done/25 transition-all text-sm font-medium">
                <ThumbsUp size={14} /> Good
              </button>
              <button onClick={() => submitRating('NEGATIVE')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lamp-blocked/15 border border-lamp-blocked/30 text-lamp-blocked hover:bg-lamp-blocked/25 transition-all text-sm font-medium">
                <ThumbsDown size={14} /> Poor
              </button>
            </div>
            <button onClick={() => setShowRating(false)} className="text-panel-muted/60 hover:text-panel-muted text-[11px] transition-colors">Skip</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className={cn('flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none', showRating && 'pb-48')}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center h-full pt-6 pb-4 gap-5">
            <div className="flex flex-col items-center gap-2">
              <img src={agent.avatarUrl} alt={agent.name} className="w-12 h-12 rounded-full object-cover opacity-70" />
              <p className="text-panel-muted text-sm">Ask {agent.name} anything</p>
              <p className="text-panel-muted/40 text-[11px]">Shift+Enter for new line · Enter to send</p>
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-panel-muted/50 text-[10px] uppercase tracking-widest">Suggested</p>
                <button onClick={refreshPrompts} className="p-1 text-panel-muted/40 hover:text-panel-muted transition-colors">
                  <RotateCw size={11} className={cn('transition-transform duration-500', promptsSpinning && 'animate-spin')} />
                </button>
              </div>
              {promptsLoading && prompts.length === 0
                ? <div className="flex flex-col gap-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-9 rounded-xl bg-white/5 animate-pulse" />)}</div>
                : <div className="flex flex-col gap-2">
                    {prompts.map((p, i) => (
                      <button key={i} onClick={() => { setInput(p.command); setTimeout(() => { inputRef.current?.focus(); const el = inputRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` } }, 0) }}
                        title={p.rationale}
                        className="w-full text-left rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] hover:border-panel-accent/30 px-4 py-2.5 text-white/80 hover:text-white text-[13px] leading-snug transition-all">
                        {p.command}
                      </button>
                    ))}
                  </div>
              }
            </div>
          </div>
        )}

        {(() => {
          // Last assistant message index — only that one gets the typewriter
          // effect so older replies don't re-animate on every panel mount.
          let lastAssistantIdx = -1
          for (let k = messages.length - 1; k >= 0; k--) {
            if (messages[k].role === 'assistant') { lastAssistantIdx = k; break }
          }
          return messages.map((m, i) => (
          <div key={i} className={cn('group flex gap-3 items-end', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0 mb-0.5" />}
            <div className={cn('flex flex-col gap-1', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div className={cn('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
                m.role === 'user' ? 'bg-panel-accent/20 text-white rounded-br-sm' : 'bg-white/5 border border-white/10 text-white rounded-bl-sm')}>
                {m.role === 'assistant' && i === lastAssistantIdx
                  ? <SlateText text={m.content} maxDurationMs={2200} />
                  : m.content}
              </div>

              {/* Inline draft-post card with one-click schedule */}
              {m.role === 'assistant' && m.draftPost && (
                <div className="max-w-[78%] mt-1 rounded-xl border border-panel-accent/30 bg-panel-accent/[0.06] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar size={11} className="text-panel-accent" />
                    <span className="text-[10px] uppercase tracking-widest text-panel-accent font-semibold">
                      Draft for {m.draftPost.platform}
                    </span>
                  </div>
                  <p className="text-white/85 text-[12px] leading-relaxed whitespace-pre-wrap">{m.draftPost.content}</p>
                  <button
                    onClick={() => {
                      useAgentsStore.getState().setPendingDraft({
                        content:     m.draftPost!.content,
                        platform:    m.draftPost!.platform,
                        suggestedAt: m.draftPost!.suggestedAt,
                      })
                      useAgentsStore.getState().openScheduler(agentId)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-accent text-white text-[11px] font-semibold hover:bg-panel-accent/85 transition-colors"
                  >
                    <Calendar size={11} />
                    Schedule post
                  </button>
                </div>
              )}
              <div className={cn('flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <button onClick={() => copy(m.content, i)} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-panel-muted hover:text-white hover:bg-white/10 transition-all text-[10px]">
                  {copiedId === i ? <><Check size={10} className="text-lamp-done" /> Copied</> : <><Copy size={10} /> Copy</>}
                </button>
                {m.role === 'user' && (
                  <button onClick={() => { setInput(m.content); setTimeout(() => { inputRef.current?.focus(); const el = inputRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` } }, 0) }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-panel-muted hover:text-white hover:bg-white/10 transition-all text-[10px]">
                    <Pencil size={10} /> Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
        })()}

        {loading && (
          <div className="flex justify-start gap-3">
            <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3.5 flex items-center gap-1.5">
              {[0,1,2].map((i) => (
                <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-panel-muted block"
                  animate={{ y: [0,-4,0], opacity: [0.4,1,0.4] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-3 border-t border-white/[0.07] shrink-0">
        <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 focus-within:border-panel-accent/40 transition-colors">
          <textarea ref={inputRef} rows={1} value={input} onChange={(e) => { setInput(e.target.value); if (pulseSend) setPulseSend(false) }} onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}…`}
            className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-panel-muted outline-none scrollbar-none"
            style={{ lineHeight: '1.6', minHeight: '1.6rem' }} />
          <button onClick={() => { setPulseSend(false); send() }} disabled={!input.trim() || loading}
            className={cn('p-2 rounded-xl transition-all shrink-0 mb-0.5',
              input.trim() && !loading ? 'bg-panel-accent text-white hover:bg-panel-accent/80' : 'text-panel-muted/40 cursor-not-allowed',
              pulseSend && input.trim() && !loading && 'ring-2 ring-panel-accent/60 animate-pulse')}>
            <Send size={15} />
          </button>
        </div>
        <p className="text-panel-muted/40 text-[10px] mt-1.5 text-right">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// ── Top-row agent picker ──────────────────────────────────────────────────────
function PickerCeoCard({
  ceoName, ceoAvatar, isSelected, onClick,
}: {
  ceoName: string; ceoAvatar: string | null; isSelected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all min-w-[88px]',
        isSelected ? 'bg-panel-accent/12' : 'hover:bg-white/[0.04]',
      )}
    >
      <div className={cn(
        'relative w-14 h-14 rounded-full border-2 transition-all overflow-hidden shrink-0',
        isSelected
          ? 'border-panel-accent shadow-md shadow-panel-accent/30'
          : 'border-white/20',
      )}>
        {ceoAvatar
          ? <img src={ceoAvatar} alt="CEO" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-panel-accent to-purple-500 text-white text-base font-black flex items-center justify-center">
              {(ceoName[0] ?? 'C').toUpperCase()}
            </div>
        }
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-panel-bg bg-emerald-400" />
      </div>
      <p className={cn('text-[12px] font-semibold whitespace-nowrap', isSelected ? 'text-white' : 'text-white/80')}>
        {ceoName.split(' ')[0]}
      </p>
      <p className="text-[9px] text-panel-accent whitespace-nowrap">Command Center</p>
    </button>
  )
}

function PickerAgentCard({
  agent, index, isSelected, onClick,
}: {
  agent: { id: string; name: string; role: string; avatarUrl: string; status: AgentStatus }
  index: number
  isSelected: boolean
  onClick: () => void
}) {
  const authFetch              = useAuthFetch()
  const API                    = process.env.NEXT_PUBLIC_API_URL
  const draggingAppName        = useAgentsStore((s) => s.draggingAppName)
  const pushAgentNotification  = useAgentsStore((s) => s.pushAgentNotification)
  const updateAgent            = useAgentsStore((s) => s.updateAgent)
  const [dropHover, setDropHover] = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [editValue, setEditValue] = useState(agent.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  async function saveName() {
    const next = editValue.trim()
    setEditing(false)
    if (!next || next === agent.name) {
      setEditValue(agent.name)
      return
    }
    // Optimistic local update — revert on API failure
    updateAgent(agent.id, { name: next })
    try {
      const res = await authFetch(`${API}/api/agents/${agent.id}`, {
        method: 'PATCH',
        body:   JSON.stringify({ name: next }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
    } catch {
      updateAgent(agent.id, { name: agent.name })
      setEditValue(agent.name)
    }
  }

  function cancelEdit() {
    setEditValue(agent.name)
    setEditing(false)
  }

  const draggedApp = draggingAppName ? findCatalogApp(draggingAppName) : null
  const dropFitOk  = !draggedApp || canRoleUseApp(agent.role as AgentRole, draggedApp)

  const role = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role

  async function handleDropGrant(composioAppName: string) {
    const cat = findCatalogApp(composioAppName)
    if (cat && !canRoleUseApp(agent.role as AgentRole, cat)) {
      pushAgentNotification(agent.id, {
        id:        `grant-rejected-${composioAppName}-${Date.now()}`,
        type:      'alert',
        headline:  `${cat.label} isn't really my thing.`,
        body:      `${role}s don't usually use ${cat.label}. Use the Connections panel to grant it anyway.`,
        createdAt: new Date().toISOString(),
      })
      return
    }
    try {
      await authFetch(`${API}/api/integrations/grants`, {
        method: 'POST',
        body:   JSON.stringify({ agentId: agent.id, composioAppName, mode: 'ALWAYS' }),
      })
      pushAgentNotification(agent.id, {
        id:        `granted-${composioAppName}-${Date.now()}`,
        type:      'opportunity',
        headline:  `Thanks — I can use ${cat?.label ?? composioAppName} now.`,
        createdAt: new Date().toISOString(),
      })
    } catch {
      pushAgentNotification(agent.id, {
        id:        `grant-failed-${Date.now()}`,
        type:      'alert',
        headline:  `Couldn't add ${cat?.label ?? composioAppName} — please try again.`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  return (
    <motion.button
      onClick={(e) => {
        // Don't navigate while the user is renaming this agent
        if (editing) { e.stopPropagation(); return }
        onClick()
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/composio-app')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'link'
          if (!dropHover) setDropHover(true)
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        const app = e.dataTransfer.getData('text/composio-app')
        setDropHover(false)
        if (app) {
          e.preventDefault()
          handleDropGrant(app)
        }
      }}
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-colors min-w-[88px] shrink-0',
        isSelected ? 'bg-panel-accent/12' : 'hover:bg-white/[0.04]',
      )}
    >
      {/* Inner motion handles the continuous bounce so it doesn't fight the entrance animation */}
      <motion.div
        className="relative shrink-0"
        animate={{ y: [0, -3, 0] }}
        transition={{
          duration: 2.4 + (index * 0.31) % 1.2,
          repeat:   Infinity,
          ease:     'easeInOut',
        }}
      >
        <div className={cn(
          'relative w-14 h-14 rounded-full border-2 transition-all overflow-hidden',
          dropHover && dropFitOk
            ? 'border-emerald-400 ring-4 ring-emerald-400/40 scale-110'
            : dropHover && !dropFitOk
            ? 'border-amber-400 ring-4 ring-amber-400/30 scale-105'
            : isSelected
            ? 'border-panel-accent shadow-md shadow-panel-accent/30'
            : 'border-white/20',
        )}>
          <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-panel-bg',
          STATUS_DOT[agent.status],
        )} />
        {agent.status === 'WORKING' && (
          <motion.span
            className="absolute inset-[-3px] rounded-full border border-lamp-working/60 pointer-events-none"
            animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        )}
      </motion.div>
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter')  { e.preventDefault(); saveName() }
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
          }}
          onBlur={saveName}
          maxLength={40}
          className="w-[96px] text-center text-[12px] font-semibold bg-white/[0.06] border border-panel-accent/40 rounded-md px-1.5 py-0.5 text-white outline-none focus:border-panel-accent"
        />
      ) : (
        <div className="relative flex items-center gap-1 group/name">
          <p className={cn('text-[12px] font-semibold whitespace-nowrap', isSelected ? 'text-white' : 'text-white/80')}>
            {agent.name}
          </p>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditValue(agent.name); setEditing(true) }}
            onMouseDown={(e) => e.stopPropagation()}
            className="opacity-0 group-hover/name:opacity-100 text-panel-muted hover:text-white transition-opacity cursor-pointer"
            title="Rename"
          >
            <Pencil size={9} />
          </span>
        </div>
      )}
      <p className="text-[10px] text-panel-muted/80 truncate max-w-[100px]">{role}</p>
      <p className={cn(
        'text-[9px] font-medium whitespace-nowrap',
        agent.status === 'WORKING' ? 'text-lamp-working' :
        agent.status === 'BLOCKED' ? 'text-lamp-blocked' :
        'text-white/40',
      )}>
        {STATUS_LABEL[agent.status]}
      </p>
    </motion.button>
  )
}

// ── Main TeamChatPanel ────────────────────────────────────────────────────────
export function TeamChatPanel() {
  const { user }           = useUser()
  const activeChatAgentId  = useAgentsStore((s) => s.activeChatAgentId)
  const setActiveChatAgent = useAgentsStore((s) => s.setActiveChatAgent)
  const agents             = useAgentsStore((s) => s.agents)
  const teamChatOpen       = useAgentsStore((s) => s.teamChatOpen)
  const setTeamChatOpen    = useAgentsStore((s) => s.setTeamChatOpen)

  const [threads,     setThreads]     = useState<ThreadMap>({})
  const [lastTaskIds, setLastTaskIds] = useState<TaskIdMap>({})
  const [rated,       setRated]       = useState<RatedMap>({})
  const [dragOffset,  setDragOffset]  = useState({ x: 0, y: 0 })

  const isCeoMode = activeChatAgentId === null
  const ceoName   = user?.firstName ?? user?.fullName ?? 'You'
  const ceoAvatar = user?.imageUrl ?? null

  function addMessage(agentId: string, msg: Message) {
    setThreads((prev) => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), msg] }))
  }

  function handleDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    const startX  = e.clientX
    const startY  = e.clientY
    const baseX   = dragOffset.x
    const baseY   = dragOffset.y
    const onMove  = (ev: MouseEvent) => setDragOffset({ x: baseX + (ev.clientX - startX), y: baseY + (ev.clientY - startY) })
    const onUp    = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  return (
    <AnimatePresence>
      {teamChatOpen && (
        <motion.div
          key="team-chat-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{
            transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
            width:     'min(1200px, calc(100vw - 240px))',
            height:    'calc(100vh - 80px)',
          }}
          className="fixed top-[60px] left-1/2 z-50 min-w-[560px] min-h-[400px] max-w-[calc(100vw-220px)] max-h-[calc(100vh-60px)] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl resize overflow-hidden"
        >
          {/* ── Panel-level drag strip + window controls ─────────────────── */}
          <div
            onMouseDown={handleDragStart}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04] shrink-0 cursor-move select-none"
          >
            {/* SlateOps brand lockup — top-left, persists across CEO + agent modes */}
            <div className="flex items-baseline gap-1.5 pr-1.5 mr-1 border-r border-white/[0.05]">
              <SlateCaretLogo size={16} variant="amber" animate={false} className="self-center" />
              <span className="text-[11px] font-bold text-white tracking-tight flex items-baseline antialiased">
                <span>slate</span>
                <span
                  aria-hidden
                  className="inline-block w-[1.5px] mx-[1.5px] bg-amber-400 rounded-[1px] animate-pulse"
                  style={{ animationDuration: '0.7s', height: '0.95em', transform: 'translateY(0.15em)' }}
                />
                <span>ops</span>
              </span>
            </div>
            <button
              onClick={() => setActiveChatAgent(null)}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] transition-colors',
                isCeoMode
                  ? 'bg-panel-accent/15 text-panel-accent'
                  : 'text-panel-muted hover:text-white hover:bg-white/[0.06]',
              )}
              title="Broadcast / Command Center"
            >
              {ceoAvatar
                ? <img src={ceoAvatar} alt="CEO" className="w-3.5 h-3.5 rounded-full object-cover" />
                : <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-panel-accent to-purple-500 text-white text-[8px] font-black flex items-center justify-center">{(ceoName[0] ?? 'C').toUpperCase()}</span>
              }
              <span className="font-medium">CEO chat</span>
            </button>
            <div className="flex-1" />
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setDragOffset({ x: 0, y: 0 })}
              className="p-1 rounded-md text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Reset position"
            >
              <Home size={11} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setTeamChatOpen(false)}
              className="p-1 rounded-md text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X size={11} />
            </button>
          </div>

          {/* ── Top-row agent picker ─────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-white/[0.07] shrink-0 flex items-start gap-2 overflow-x-auto scrollbar-none">
            <PickerCeoCard
              ceoName={ceoName}
              ceoAvatar={ceoAvatar}
              isSelected={isCeoMode}
              onClick={() => setActiveChatAgent(null)}
            />
            {agents.length > 0 && (
              <div className="w-px self-stretch bg-white/[0.06] mx-2 my-1" />
            )}
            {agents.map((agent, idx) => (
              <PickerAgentCard
                key={agent.id}
                agent={agent}
                index={idx}
                isSelected={activeChatAgentId === agent.id}
                onClick={() => setActiveChatAgent(agent.id)}
              />
            ))}
          </div>

          {/* ── Content area (CEO command or agent chat) ─────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {isCeoMode
              ? <CeoCommandPanel />
              : <AgentChatArea
                  agentId={activeChatAgentId!}
                  threads={threads}
                  addMessage={addMessage}
                  lastTaskIds={lastTaskIds}
                  setLastTaskIds={setLastTaskIds}
                  rated={rated}
                  setRated={setRated}
                />
            }
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Trigger button — replaces CommandBar in the canvas ────────────────────────
export function TeamChatTrigger() {
  const setTeamChatOpen    = useAgentsStore((s) => s.setTeamChatOpen)
  const setActiveChatAgent = useAgentsStore((s) => s.setActiveChatAgent)
  const agents             = useAgentsStore((s) => s.agents)
  const working            = agents.filter((a) => a.status === 'WORKING')

  function open() {
    setActiveChatAgent(null)   // default to CEO / broadcast mode
    setTeamChatOpen(true)
  }

  return (
    <div className="fixed bottom-3 left-0 right-0 z-20 flex justify-center pointer-events-none">
      <button
        onClick={open}
        className="flex items-center justify-center gap-2 w-[200px] h-[20px] rounded-full border border-white/10 bg-[#0d0f1a]/95 backdrop-blur-sm hover:border-panel-accent/40 hover:bg-panel-accent/[0.06] transition-all group pointer-events-auto"
      >
        <MessageSquare size={10} className="text-panel-accent shrink-0" />
        <span className="text-panel-muted group-hover:text-white/70 text-[10px] transition-colors truncate">
          Tell your team what to do…
        </span>
      </button>
    </div>
  )
}
