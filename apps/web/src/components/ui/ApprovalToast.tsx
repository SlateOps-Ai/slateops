'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'

export function ApprovalToast() {
  const approval        = useAgentsStore((s) => s.pendingApproval)
  const setPending      = useAgentsStore((s) => s.setPendingApproval)
  const [loading, setLoading] = useState<'approve' | 'cancel' | null>(null)
  const authFetch = useAuthFetch()

  if (!approval) return null

  async function respond(status: 'APPROVED' | 'CANCELLED') {
    if (!approval) return
    setLoading(status === 'APPROVED' ? 'approve' : 'cancel')
    try {
      await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/tasks/${approval.taskId}/approve`,
        {
          method:  'POST',
          body: JSON.stringify({ status }),
        }
      )
      setPending(null)
    } finally {
      setLoading(null)
    }
  }

  const previewLines = approval.preview
    ? JSON.stringify(approval.preview, null, 2).split('\n').slice(0, 6)
    : []

  return (
    <AnimatePresence>
      <motion.div
        key="approval-toast"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-4"
      >
        <div className="rounded-2xl border border-lamp-blocked/40 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <span className="w-2 h-2 rounded-full bg-lamp-blocked animate-pulse" />
            <p className="text-white text-sm font-medium flex-1">
              {approval.agentName} needs your approval
            </p>
          </div>

          {/* Action summary */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-panel-muted text-xs uppercase tracking-widest mb-1">Action</p>
            <p className="text-white text-sm">{approval.action}</p>
          </div>

          {/* Preview */}
          {previewLines.length > 0 && (
            <div className="mx-4 mb-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <pre className="text-panel-muted text-[11px] leading-relaxed overflow-hidden">
                {previewLines.join('\n')}
                {JSON.stringify(approval.preview, null, 2).split('\n').length > 6 && '\n…'}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={() => respond('APPROVED')}
              disabled={!!loading}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                'bg-lamp-done/20 border border-lamp-done/40 text-lamp-done',
                'hover:bg-lamp-done/30 disabled:opacity-50'
              )}
            >
              {loading === 'approve' ? 'Approving…' : 'Approve'}
            </button>
            <button
              onClick={() => respond('CANCELLED')}
              disabled={!!loading}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                'bg-white/5 border border-white/10 text-panel-muted',
                'hover:bg-white/10 hover:text-white disabled:opacity-50'
              )}
            >
              {loading === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
