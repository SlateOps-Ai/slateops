'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface AgentInfo {
  name:        string
  avatarUrl:   string
  role:        string
  personality: string | null
  contextBrief: string | null
}

export default function WidgetPage({ params }: { params: { agentId: string } }) {
  const { agentId } = params
  const API = process.env.NEXT_PUBLIC_API_URL

  const [agent,    setAgent]    = useState<AgentInfo | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`${API}/api/public-chat/${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.agent) setAgent(d.agent)
        else setError('This agent is not available.')
      })
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
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Rate limit reached. Please try again later.' }])
        return
      }
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f] text-white">
        <p className="text-sm text-white/50">{error}</p>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
        <Loader2 className="animate-spin text-white/30" size={20} />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f] text-white font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <img src={agent.avatarUrl} alt={agent.name} className="w-8 h-8 rounded-full object-cover" />
        <div>
          <p className="text-sm font-medium text-white">{agent.name}</p>
          <p className="text-[10px] text-white/40 capitalize">{agent.role.replace(/_/g, ' ').toLowerCase()}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-white/40">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-8 gap-3">
            <img src={agent.avatarUrl} alt={agent.name} className="w-14 h-14 rounded-full object-cover opacity-80" />
            <p className="text-white/40 text-sm text-center">
              Hi, I&apos;m {agent.name}. How can I help you today?
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <img src={agent.avatarUrl} alt={agent.name} className="w-6 h-6 rounded-full object-cover mr-2 mt-0.5 shrink-0" />
            )}
            <div className={cn(
              'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              m.role === 'user'
                ? 'bg-white/10 text-white rounded-br-sm'
                : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-sm',
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start items-end gap-2">
            <img src={agent.avatarUrl} alt={agent.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/10 shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${agent.name} something…`}
            className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-white/30 outline-none max-h-28"
            style={{ lineHeight: '1.5' }}
            autoFocus
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-center text-[10px] text-white/20 mt-2">
          Powered by <span className="text-white/40">SlateOps</span>
        </p>
      </div>
    </div>
  )
}
