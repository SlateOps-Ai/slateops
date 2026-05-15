'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, ThumbsUp, ThumbsDown, Calendar } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Props {
  agentId:   string
  agentName: string
  avatarUrl: string
  onClose:   () => void
}

export function ThreadHistoryModal({ agentId, agentName, avatarUrl, onClose }: Props) {
  const authFetch           = useAuthFetch()
  const API                 = process.env.NEXT_PUBLIC_API_URL
  const threads             = useAgentsStore((s) => s.threads)
  const updateThreadMessage = useAgentsStore((s) => s.updateThreadMessage)
  const setPendingDraft     = useAgentsStore((s) => s.setPendingDraft)
  const openScheduler       = useAgentsStore((s) => s.openScheduler)

  const [mounted, setMounted] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const messages = threads[agentId] ?? []

  function copy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800)
    }).catch(() => {})
  }

  async function rate(messageIndex: number, taskId: string, rating: 'POSITIVE' | 'NEGATIVE') {
    updateThreadMessage(agentId, messageIndex, { rating })
    try {
      await authFetch(`${API}/api/tasks/${taskId}/feedback`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating }),
      })
    } catch {
      updateThreadMessage(agentId, messageIndex, { rating: null })
    }
  }

  function scheduleDraft(draft: { content: string; platform: string; suggestedAt?: string }) {
    setPendingDraft({ content: draft.content, platform: draft.platform, suggestedAt: draft.suggestedAt })
    openScheduler(agentId)
    onClose()
  }

  if (!mounted) return null

  const body = (
    <AnimatePresence>
      <motion.div
        key="thread-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        key="thread-modal"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[min(640px,calc(100vw-2rem))] max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <img src={avatarUrl} alt={agentName} className="w-8 h-8 rounded-full object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{agentName}</p>
            <p className="text-panel-muted text-[11px]">{messages.length} message{messages.length === 1 ? '' : 's'} in this thread</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-panel-muted/60 text-xs text-center py-12 italic">No messages yet.</p>
          ) : messages.map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div key={i} className={cn('group flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
                {!isUser && <img src={avatarUrl} alt={agentName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />}
                <div className={cn('flex flex-col gap-1 max-w-[78%]', isUser ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
                    isUser
                      ? 'bg-panel-accent/20 text-white rounded-br-sm'
                      : 'bg-white/5 border border-white/10 text-white rounded-bl-sm',
                  )}>
                    {m.draftPost ? (
                      <div className="space-y-2">
                        <p className="whitespace-pre-wrap">{m.draftPost.content}</p>
                        <button
                          onClick={() => scheduleDraft(m.draftPost!)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel-accent text-white text-[11px] font-semibold hover:bg-panel-accent/85 transition-colors"
                        >
                          <Calendar size={11} />
                          Schedule on {m.draftPost.platform}
                        </button>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {/* Actions row */}
                  <div className={cn(
                    'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
                    isUser ? 'flex-row-reverse' : 'flex-row',
                  )}>
                    <button
                      onClick={() => copy(m.content, i)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-panel-muted hover:text-white hover:bg-white/10 transition-all text-[10px]"
                    >
                      {copiedIdx === i ? <><Check size={10} className="text-lamp-done" /> Copied</> : <><Copy size={10} /> Copy</>}
                    </button>
                    {!isUser && m.taskId && (
                      <>
                        <button
                          onClick={() => rate(i, m.taskId!, 'POSITIVE')}
                          disabled={!!m.rating}
                          className={cn(
                            'p-1 rounded transition-colors',
                            m.rating === 'POSITIVE'
                              ? 'text-lamp-done bg-lamp-done/15'
                              : 'text-panel-muted hover:text-lamp-done hover:bg-white/10 disabled:opacity-40',
                          )}
                        >
                          <ThumbsUp size={10} />
                        </button>
                        <button
                          onClick={() => rate(i, m.taskId!, 'NEGATIVE')}
                          disabled={!!m.rating}
                          className={cn(
                            'p-1 rounded transition-colors',
                            m.rating === 'NEGATIVE'
                              ? 'text-lamp-blocked bg-lamp-blocked/15'
                              : 'text-panel-muted hover:text-lamp-blocked hover:bg-white/10 disabled:opacity-40',
                          )}
                        >
                          <ThumbsDown size={10} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(body, document.body)
}
