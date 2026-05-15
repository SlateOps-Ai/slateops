'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mic, X, Calendar, Loader2, Sparkles } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import type { ChatMessage } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { AgentActionsHeader } from '@/components/ui/AgentActionsHeader'
import { cn } from '@/lib/utils'
import { AGENT_ROLE_LABELS } from '@agentcity/types'

const MARKETING_ROLES = new Set(['CONTENT_WRITER', 'MARKETING_STRATEGIST', 'SALES_PROSPECTOR'])

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null

export function OfficeChatInput() {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const agents              = useAgentsStore((s) => s.agents)
  const activeChatAgentId   = useAgentsStore((s) => s.activeChatAgentId)
  const appendThreadMessage = useAgentsStore((s) => s.appendThreadMessage)
  const setLastTaskId       = useAgentsStore((s) => s.setLastTaskId)
  const upsertTask          = useAgentsStore((s) => s.upsertTask)
  const pendingFirstTask    = useAgentsStore((s) => s.pendingFirstTask)
  const setPendingFirstTask = useAgentsStore((s) => s.setPendingFirstTask)
  const openScheduler       = useAgentsStore((s) => s.openScheduler)

  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [listening, setListening] = useState(false)
  const [pulseSend, setPulseSend] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<any>(null)

  const activeAgent = agents.find((a) => a.id === activeChatAgentId)
  const isCeoMode   = !activeAgent
  const role = activeAgent
    ? (AGENT_ROLE_LABELS[activeAgent.role as keyof typeof AGENT_ROLE_LABELS] ?? activeAgent.role)
    : ''

  // Re-focus when active agent changes
  useEffect(() => {
    setInput('')
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [activeChatAgentId])

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  // Pre-fill from onboarding first-task suggestion
  useEffect(() => {
    if (!pendingFirstTask) return
    if (pendingFirstTask.agentId !== activeChatAgentId) return
    setInput(pendingFirstTask.taskText)
    setPulseSend(true)
    setPendingFirstTask(null)
  }, [pendingFirstTask, activeChatAgentId, setPendingFirstTask])

  function toggleVoice() {
    if (!SpeechRecognitionAPI) return
    if (listening) { recognizerRef.current?.stop(); setListening(false); return }
    const rec = new SpeechRecognitionAPI()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript ?? ''
      if (t) setInput((p) => (p ? `${p} ${t}` : t))
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    rec.start(); recognizerRef.current = rec; setListening(true)
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    setPulseSend(false)
    setSending(true)

    if (isCeoMode) {
      // CEO broadcast — route via /api/tasks
      try {
        const res = await authFetch(`${API}/api/tasks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rawCommand: text }),
        })
        const data = await res.json()
        if (res.status === 402) {
          setError(data?.detail ?? 'No credits remaining.')
          setSending(false)
          return
        }
        if (!res.ok) {
          setError(data?.error ?? 'Could not route command.')
          setSending(false)
          return
        }
        if (data.task) upsertTask({ id: data.task.id, agentId: data.task.agentId, title: data.task.title, status: 'IN_PROGRESS' })
        setInput('')
      } catch {
        setError('Could not reach the server.')
      }
      setSending(false)
      return
    }

    // 1:1 agent chat
    const agentId = activeAgent!.id
    const userMsg: ChatMessage = { role: 'user', content: text }
    appendThreadMessage(agentId, userMsg)
    setInput('')

    try {
      const threads = useAgentsStore.getState().threads
      const history = (threads[agentId] ?? []).slice(-10)
      const res = await authFetch(`${API}/api/agents/${agentId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history }),
      })
      const data = await res.json()
      const reply: ChatMessage = {
        role:      'assistant',
        content:   data.reply ?? 'No response.',
        draftPost: data.draftPost ?? null,
      }
      appendThreadMessage(agentId, reply)
      if (data.taskId) setLastTaskId(agentId, data.taskId)
    } catch {
      appendThreadMessage(agentId, { role: 'assistant', content: 'Something went wrong. Please try again.' })
    }
    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const placeholder = sending
    ? (isCeoMode ? 'Routing to your team…' : `Asking ${activeAgent?.name}…`)
    : (isCeoMode ? 'Tell your team what to do…' : `Message ${activeAgent?.name}…`)

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-[720px] pointer-events-auto">
      {/* Selected-agent header strip */}
      <AnimatePresence>
        {activeAgent && (
          <motion.div
            key={activeAgent.id + '-header'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 px-3 py-1.5 mb-1.5 rounded-xl bg-panel-bg/90 border border-white/10 backdrop-blur-sm shadow-xl"
          >
            <img src={activeAgent.avatarUrl} alt={activeAgent.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-tight">{activeAgent.name}</p>
              <p className="text-panel-muted text-[10px] truncate leading-tight">{role}</p>
            </div>
            <AgentActionsHeader agentId={activeAgent.id} agentName={activeAgent.name} isPublic={activeAgent.isPublic ?? false} />
            {MARKETING_ROLES.has(activeAgent.role) && (
              <button
                onClick={() => openScheduler(activeAgent.id)}
                className="p-1.5 rounded-md border border-panel-accent/30 bg-panel-accent/10 text-panel-accent hover:bg-panel-accent/15 transition-colors shrink-0"
                title="Schedule a post"
              >
                <Calendar size={11} />
              </button>
            )}
            <button
              onClick={() => useAgentsStore.getState().setActiveChatAgent(null)}
              className="p-1 rounded-md text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Back to broadcast"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CEO mode hint */}
      {isCeoMode && (
        <div className="flex items-center justify-center gap-1.5 mb-1.5">
          <Sparkles size={10} className="text-panel-accent/60" />
          <span className="text-[10px] text-panel-muted">Routes to the best agent automatically. Click an agent to message them directly.</span>
        </div>
      )}

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-start gap-2 px-3 py-2 mb-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]"
          >
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-300/60 hover:text-red-300">
              <X size={10} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input strip */}
      <div className={cn(
        'flex items-end gap-2 rounded-2xl border bg-panel-bg/95 backdrop-blur-md shadow-2xl px-3 py-2 transition-colors',
        sending ? 'border-panel-accent/40' : 'border-white/10',
      )}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => { setInput(e.target.value); if (pulseSend) setPulseSend(false) }}
          onKeyDown={handleKey}
          disabled={sending}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-panel-muted outline-none disabled:opacity-60 px-1 py-1"
          style={{ lineHeight: '1.5', minHeight: '1.5rem', maxHeight: '120px' }}
        />
        <button
          onClick={toggleVoice}
          disabled={!SpeechRecognitionAPI || sending}
          className={cn(
            'p-2 rounded-lg transition-colors shrink-0',
            listening ? 'text-lamp-blocked bg-lamp-blocked/10 animate-pulse'
                       : 'text-panel-muted hover:text-white hover:bg-white/10 disabled:opacity-30',
          )}
          title="Voice input"
        >
          <Mic size={14} />
        </button>
        <button
          onClick={() => { setPulseSend(false); send() }}
          disabled={!input.trim() || sending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shrink-0',
            input.trim() && !sending
              ? 'bg-panel-accent text-white hover:bg-panel-accent/85'
              : 'bg-white/5 text-panel-muted/50 cursor-not-allowed',
            pulseSend && input.trim() && !sending && 'ring-2 ring-panel-accent/60 animate-pulse',
          )}
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <><Send size={13} /> Send</>}
        </button>
      </div>
    </div>
  )
}
