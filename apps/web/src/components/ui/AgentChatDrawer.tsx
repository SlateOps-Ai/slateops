'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, ThumbsUp, ThumbsDown, Copy, Check, Pencil, RotateCw } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface PromptSuggestion {
  command:   string
  rationale: string
}

function useCopy() {
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const copy = useCallback((text: string, id: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
    }).catch(() => {})
  }, [])
  return { copiedId, copy }
}

function useAgentPrompts(agentId: string | null) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [prompts,   setPrompts]   = useState<PromptSuggestion[]>([])
  const [loading,   setLoading]   = useState(false)
  const [spinning,  setSpinning]  = useState(false)

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

  useEffect(() => {
    setPrompts([])
    if (agentId) load()
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { prompts, loading, spinning, refresh: () => load(true) }
}

export function AgentChatDrawer() {
  const activeChatAgentId  = useAgentsStore((s) => s.activeChatAgentId)
  const setActiveChatAgent = useAgentsStore((s) => s.setActiveChatAgent)
  const agents             = useAgentsStore((s) => s.agents)
  const authFetch          = useAuthFetch()
  const API                = process.env.NEXT_PUBLIC_API_URL

  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [lastTaskId,  setLastTaskId]  = useState<string | null>(null)
  const [showRating,  setShowRating]  = useState(false)
  const [rated,       setRated]       = useState(false)
  const { copiedId, copy } = useCopy()
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const agent = agents.find((a) => a.id === activeChatAgentId)
  const { prompts, loading: promptsLoading, spinning: promptsSpinning, refresh: refreshPrompts } =
    useAgentPrompts(activeChatAgentId)

  // Reset when a new agent is opened
  useEffect(() => {
    if (activeChatAgentId) {
      setMessages([])
      setInput('')
      setLastTaskId(null)
      setShowRating(false)
      setRated(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeChatAgentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading || !activeChatAgentId) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res  = await authFetch(`${API}/api/agents/${activeChatAgentId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userMsg, history: messages.slice(-10) }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }])
      if (data.taskId) setLastTaskId(data.taskId)
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Called when user clicks X — show rating prompt if there are messages to rate
  function handleClose() {
    if (messages.length > 0 && lastTaskId && !rated) {
      setShowRating(true)
    } else {
      setActiveChatAgent(null)
    }
  }

  async function submitRating(rating: 'POSITIVE' | 'NEGATIVE') {
    if (!lastTaskId) return
    setRated(true)
    setShowRating(false)
    authFetch(`${API}/api/tasks/${lastTaskId}/feedback`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rating }),
    }).catch(() => {})
    setActiveChatAgent(null)
  }

  function skipRating() {
    setShowRating(false)
    setActiveChatAgent(null)
  }

  return (
    <AnimatePresence>
      {activeChatAgentId && agent && (
        <>
          {/* Backdrop */}
          <motion.div
            key="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
            onClick={handleClose}
          />

          {/* Chat panel — centered horizontally, bottom aligned with canvas bar */}
          <motion.div
            key="agent-chat-drawer"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-[560px] h-[640px] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
          >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
            <img src={agent.avatarUrl} alt={agent.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-base font-semibold truncate">{agent.name}</p>
              <p className="text-panel-muted text-xs truncate">
                {agent.role.toLowerCase().replace(/_/g, ' ')}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Rating overlay */}
          <AnimatePresence>
            {showRating && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-x-0 bottom-0 z-10 px-4 py-5 bg-panel-bg border-t border-white/[0.08] flex flex-col items-center gap-3"
              >
                <p className="text-white text-sm font-medium text-center">
                  How did {agent.name} do?
                </p>
                <p className="text-panel-muted text-[11px] text-center -mt-1">
                  Your rating helps improve agent performance
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <button
                    onClick={() => submitRating('POSITIVE')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lamp-done/15 border border-lamp-done/30 text-lamp-done hover:bg-lamp-done/25 transition-all text-sm font-medium"
                  >
                    <ThumbsUp size={15} />
                    Good
                  </button>
                  <button
                    onClick={() => submitRating('NEGATIVE')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lamp-blocked/15 border border-lamp-blocked/30 text-lamp-blocked hover:bg-lamp-blocked/25 transition-all text-sm font-medium"
                  >
                    <ThumbsDown size={15} />
                    Poor
                  </button>
                </div>
                <button
                  onClick={skipRating}
                  className="text-panel-muted/60 hover:text-panel-muted text-[11px] transition-colors"
                >
                  Skip
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className={cn('flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none', showRating && 'pb-48')}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center h-full pt-8 pb-4 gap-5">
                {/* Avatar + intro */}
                <div className="flex flex-col items-center gap-2">
                  <img src={agent.avatarUrl} alt={agent.name} className="w-12 h-12 rounded-full object-cover opacity-70" />
                  <p className="text-panel-muted text-sm">Ask {agent.name} anything</p>
                  <p className="text-panel-muted/40 text-[11px]">Shift+Enter for new line · Enter to send</p>
                </div>

                {/* Suggested prompts */}
                <div className="w-full">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-panel-muted/50 text-[10px] uppercase tracking-widest">Suggested</p>
                    <button
                      onClick={refreshPrompts}
                      title="Refresh suggestions"
                      className="p-1 text-panel-muted/40 hover:text-panel-muted transition-colors"
                    >
                      <RotateCw
                        size={11}
                        className={cn('transition-transform duration-500', promptsSpinning && 'animate-spin')}
                      />
                    </button>
                  </div>

                  {promptsLoading && prompts.length === 0 ? (
                    <div className="flex flex-col gap-2">
                      {[1,2,3,4,5].map((i) => (
                        <div key={i} className="h-9 rounded-xl bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {prompts.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(p.command)
                            setTimeout(() => {
                              inputRef.current?.focus()
                              const el = inputRef.current
                              if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px` }
                            }, 0)
                          }}
                          title={p.rationale}
                          className="w-full text-left rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] hover:border-panel-accent/30 px-4 py-2.5 text-white/80 hover:text-white text-[13px] leading-snug transition-all"
                        >
                          {p.command}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('group flex gap-3 items-end', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' && (
                  <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0 mb-0.5" />
                )}

                <div className={cn('flex flex-col gap-1', m.role === 'user' ? 'items-end' : 'items-start')}>
                  {/* Bubble */}
                  <div
                    className={cn(
                      'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
                      m.role === 'user'
                        ? 'bg-panel-accent/20 text-white rounded-br-sm'
                        : 'bg-white/5 border border-white/10 text-white rounded-bl-sm',
                    )}
                  >
                    {m.content}
                  </div>

                  {/* Action buttons — visible on hover */}
                  <div className={cn(
                    'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                    m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}>
                    {/* Copy */}
                    <button
                      onClick={() => copy(m.content, i)}
                      title="Copy"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-panel-muted hover:text-white hover:bg-white/10 transition-all text-[10px]"
                    >
                      {copiedId === i
                        ? <><Check size={10} className="text-lamp-done" /> Copied</>
                        : <><Copy size={10} /> Copy</>}
                    </button>

                    {/* Edit — user messages only */}
                    {m.role === 'user' && (
                      <button
                        onClick={() => {
                          setInput(m.content)
                          setTimeout(() => {
                            inputRef.current?.focus()
                            const el = inputRef.current
                            if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px` }
                          }, 0)
                        }}
                        title="Edit and resend"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-panel-muted hover:text-white hover:bg-white/10 transition-all text-[10px]"
                      >
                        <Pencil size={10} /> Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start gap-3">
                <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3.5 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-panel-muted block"
                      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-3 border-t border-white/10 shrink-0">
            <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 focus-within:border-panel-accent/40 transition-colors">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agent.name}…`}
                className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-panel-muted outline-none scrollbar-none"
                style={{ lineHeight: '1.6', minHeight: '2.4rem' }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className={cn(
                  'p-2 rounded-xl transition-all shrink-0 mb-0.5',
                  input.trim() && !loading
                    ? 'bg-panel-accent text-white hover:bg-panel-accent/80'
                    : 'text-panel-muted/40 cursor-not-allowed'
                )}
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-panel-muted/40 text-[10px] mt-1.5 text-right">Enter to send · Shift+Enter for new line</p>
          </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
