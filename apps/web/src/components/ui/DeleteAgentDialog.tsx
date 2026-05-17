'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

interface Props {
  agentId:   string
  agentName: string
  onClose:   () => void
  /** Called after the agent is successfully deleted (post-API + post-store update). */
  onDeleted?: () => void
}

/**
 * Typed-confirmation modal for deleting an agent. The user must type the
 * agent's name exactly before the destructive button enables — same pattern
 * GitHub uses for repo deletion. Hard to fire by accident, fully reversible
 * on the backend (soft-delete), but clear about what will and won't survive.
 */
export function DeleteAgentDialog({ agentId, agentName, onClose, onDeleted }: Props) {
  const authFetch   = useAuthFetch()
  const removeAgent = useAgentsStore((s) => s.removeAgent)
  const API         = process.env.NEXT_PUBLIC_API_URL

  const [typed, setTyped]     = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const inputRef              = useRef<HTMLInputElement | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const canDelete = typed.trim() === agentName.trim() && !busy

  async function handleDelete() {
    if (!canDelete) return
    setBusy(true)
    setError(null)
    try {
      const res  = await authFetch(`${API}/api/agents/${agentId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Delete failed (HTTP ${res.status}).`)
        return
      }
      removeAgent(agentId)
      onDeleted?.()
      onClose()
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="delete-agent-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{    opacity: 0 }}
        className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
        onClick={onClose}
      >
        <motion.div
          key="delete-agent-modal"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{    opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-panel-bg border border-lamp-blocked/30 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div className="w-8 h-8 rounded-full bg-lamp-blocked/15 border border-lamp-blocked/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={14} className="text-lamp-blocked" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-[15px]">Delete {agentName}?</h3>
              <p className="text-panel-muted text-[12px] mt-1 leading-relaxed">
                The agent will be removed from your office and any work they had scheduled — tasks
                in flight, scheduled posts, trigger rules, and recurring runs — will be cancelled.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5 text-[11px]">
              <p className="text-emerald-300/85"><span className="text-emerald-400/90">✓</span> Task history, audit logs, and billing records are preserved.</p>
              <p className="text-emerald-300/85"><span className="text-emerald-400/90">✓</span> The agent slot is freed — you can hire a replacement immediately.</p>
              <p className="text-lamp-blocked/85"><span className="text-lamp-blocked">✗</span> Memories and knowledge attached to this agent will be removed.</p>
              <p className="text-lamp-blocked/85"><span className="text-lamp-blocked">✗</span> Active integration grants will be revoked.</p>
            </div>

            <div>
              <label className="text-[11px] text-panel-muted block mb-1.5">
                Type <span className="text-white font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">{agentName}</span> to confirm
              </label>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canDelete) handleDelete() }}
                placeholder={agentName}
                disabled={busy}
                className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-white text-[13px] placeholder-panel-muted/40 outline-none focus:border-lamp-blocked/50 transition-colors disabled:opacity-60"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-lamp-blocked/30 bg-lamp-blocked/10 px-3 py-2 text-[11px] text-lamp-blocked">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete}
                className={cn(
                  'flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors flex items-center justify-center gap-2',
                  canDelete
                    ? 'bg-lamp-blocked text-white hover:bg-lamp-blocked/85'
                    : 'bg-white/[0.04] border border-white/[0.06] text-panel-muted cursor-not-allowed',
                )}
              >
                {busy ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : 'Delete agent'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
