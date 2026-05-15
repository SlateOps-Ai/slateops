'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, Pencil, ThumbsUp, ThumbsDown, Calendar } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import type { ChatMessage } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

interface Props {
  message:        ChatMessage
  messageIndex:   number
  agentId:        string
  agentName:      string
}

export function MessageBubble({ message, messageIndex, agentId, agentName }: Props) {
  const authFetch          = useAuthFetch()
  const API                = process.env.NEXT_PUBLIC_API_URL
  const setInputDraftText  = useAgentsStore((s) => s.setInputDraftText)
  const setPendingDraft    = useAgentsStore((s) => s.setPendingDraft)
  const openScheduler      = useAgentsStore((s) => s.openScheduler)
  const updateThreadMessage = useAgentsStore((s) => s.updateThreadMessage)

  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  function edit() {
    setInputDraftText(message.content)
  }

  async function rate(rating: 'POSITIVE' | 'NEGATIVE') {
    if (!message.taskId || message.rating) return
    updateThreadMessage(agentId, messageIndex, { rating })
    try {
      await authFetch(`${API}/api/tasks/${message.taskId}/feedback`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating }),
      })
    } catch {
      // Revert on failure
      updateThreadMessage(agentId, messageIndex, { rating: null })
    }
  }

  function scheduleDraft() {
    if (!message.draftPost) return
    setPendingDraft({
      content:     message.draftPost.content,
      platform:    message.draftPost.platform,
      suggestedAt: message.draftPost.suggestedAt,
    })
    openScheduler(agentId)
  }

  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'pointer-events-auto group relative rounded-xl border shadow-2xl backdrop-blur-sm cursor-default',
        isUser
          ? 'w-[220px] border-panel-accent/30 bg-panel-accent/[0.10]'
          : 'w-[280px] border-white/10 bg-panel-bg',
      )}
    >
      <div className="px-3 py-2">
        <p className={cn(
          'text-[8px] uppercase tracking-widest font-semibold mb-1',
          isUser ? 'text-panel-accent/80 text-right' : 'text-panel-accent',
        )}>
          {isUser ? 'You' : `${agentName} says`}
        </p>

        {message.draftPost ? (
          <div className="space-y-2">
            <p className="text-white/85 text-[11px] leading-relaxed whitespace-pre-wrap">{message.draftPost.content}</p>
            <button
              onClick={scheduleDraft}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel-accent text-white text-[10px] font-semibold hover:bg-panel-accent/85 transition-colors"
            >
              <Calendar size={10} />
              Schedule on {message.draftPost.platform}
            </button>
          </div>
        ) : (
          <p className={cn(
            'text-[11px] leading-snug whitespace-pre-wrap',
            isUser ? 'text-white/90 text-right' : 'text-white',
          )}>
            {message.content.length > 320 ? message.content.slice(0, 320) + '…' : message.content}
          </p>
        )}
      </div>

      {/* Action row — fades in on hover */}
      <div className={cn(
        'flex items-center gap-1 px-2 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity',
        isUser ? 'justify-end' : 'justify-start',
      )}>
        <button
          onClick={copy}
          title="Copy"
          className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          {copied ? <Check size={10} className="text-lamp-done" /> : <Copy size={10} />}
        </button>
        {isUser && (
          <button
            onClick={edit}
            title="Edit"
            className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
          >
            <Pencil size={10} />
          </button>
        )}
        {!isUser && message.taskId && (
          <>
            <button
              onClick={() => rate('POSITIVE')}
              disabled={!!message.rating}
              title="Good response"
              className={cn(
                'p-1 rounded transition-colors',
                message.rating === 'POSITIVE'
                  ? 'text-lamp-done bg-lamp-done/15'
                  : 'text-panel-muted hover:text-lamp-done hover:bg-white/10 disabled:opacity-40',
              )}
            >
              <ThumbsUp size={10} />
            </button>
            <button
              onClick={() => rate('NEGATIVE')}
              disabled={!!message.rating}
              title="Poor response"
              className={cn(
                'p-1 rounded transition-colors',
                message.rating === 'NEGATIVE'
                  ? 'text-lamp-blocked bg-lamp-blocked/15'
                  : 'text-panel-muted hover:text-lamp-blocked hover:bg-white/10 disabled:opacity-40',
              )}
            >
              <ThumbsDown size={10} />
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
