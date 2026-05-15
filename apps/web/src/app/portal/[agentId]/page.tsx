'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface AgentInfo {
  name:         string
  avatarUrl:    string
  role:         string
  personality:  string | null
  contextBrief: string | null
}

export default function PortalPage({ params }: { params: { agentId: string } }) {
  const { agentId } = params
  const API = process.env.NEXT_PUBLIC_API_URL

  const [agent,    setAgent]    = useState<AgentInfo | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/api/public-chat/${agentId}`)
      .then((r) => r.json())
      .then((d) => { if (d.agent) setAgent(d.agent); else setError('This agent is not available.') })
      .catch(() => setError('Could not load agent.'))
  }, [agentId, API])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading || !agent) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/public-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, message: userMsg, history: messages.slice(-10) }),
      })
      if (res.status === 429) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Rate limit reached. Please try again in a few minutes.' }])
        return
      }
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center">
        <p className="text-sm text-white/40">{error}</p>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={20} />
      </div>
    )
  }

  const roleLabel = agent.role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="min-h-screen bg-[#0b0d14] flex flex-col font-sans">
      {/* Hero / agent card */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#0d0f1a]">
        <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col items-center text-center gap-4">
          <div className="relative">
            <img
              src={agent.avatarUrl}
              alt={agent.name}
              className="w-20 h-20 rounded-3xl object-cover border border-white/10 shadow-2xl"
            />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-[#0d0f1a] flex items-center justify-center">
              <Sparkles size={9} className="text-emerald-900" />
            </span>
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-white/40 text-sm mt-1">{roleLabel}</p>
          </div>
          {agent.contextBrief && (
            <p className="text-white/50 text-sm leading-relaxed max-w-md">{agent.contextBrief}</p>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[11px] font-medium">Available now</span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <p className="text-white/30 text-sm">
              Start a conversation with {agent.name}
            </p>
            {agent.personality && (
              <p className="text-white/20 text-xs max-w-xs">{agent.personality}</p>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <img src={agent.avatarUrl} alt={agent.name} className="w-8 h-8 rounded-xl object-cover shrink-0 mt-0.5" />
            )}
            <div className={cn(
              'max-w-[75%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
              m.role === 'user'
                ? 'bg-[#4d7fff] text-white rounded-br-sm'
                : 'bg-white/[0.04] border border-white/[0.08] text-white/90 rounded-bl-sm',
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <img src={agent.avatarUrl} alt={agent.name} className="w-8 h-8 rounded-xl object-cover shrink-0" />
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#0d0f1a]">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus-within:border-white/20 transition-colors">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message ${agent.name}…`}
              className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-white/25 outline-none max-h-32"
              style={{ lineHeight: '1.6' }}
              autoFocus
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-[#4d7fff] text-white hover:bg-[#3a6aee] disabled:opacity-30 transition-colors shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="text-center text-[10px] text-white/15 mt-2.5">
            Powered by <span className="text-white/25 font-medium">SlateOps</span>
          </p>
        </div>
      </div>
    </div>
  )
}
