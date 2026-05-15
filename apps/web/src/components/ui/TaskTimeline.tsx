'use client'

import { useState } from 'react'
import { ListChecks, X, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, Ban } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents.store'

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; pill: string; dot: string }> = {
  COMPLETE:       { label: 'Complete',       icon: <CheckCircle2 size={13} />, pill: 'bg-lamp-done/15 text-lamp-done border-lamp-done/25',          dot: 'bg-lamp-done' },
  FAILED:         { label: 'Failed',         icon: <XCircle      size={13} />, pill: 'bg-lamp-blocked/15 text-lamp-blocked border-lamp-blocked/25',  dot: 'bg-lamp-blocked' },
  IN_PROGRESS:    { label: 'In Progress',    icon: <Loader2      size={13} className="animate-spin" />, pill: 'bg-lamp-working/15 text-lamp-working border-lamp-working/25', dot: 'bg-lamp-working' },
  NEEDS_APPROVAL: { label: 'Needs Approval', icon: <AlertCircle  size={13} />, pill: 'bg-lamp-idle/15 text-lamp-idle border-lamp-idle/25',           dot: 'bg-lamp-idle' },
  PENDING:        { label: 'Pending',        icon: <Clock        size={13} />, pill: 'bg-white/5 text-panel-muted border-white/10',                  dot: 'bg-panel-muted' },
  CANCELLED:      { label: 'Cancelled',      icon: <Ban          size={13} />, pill: 'bg-white/5 text-panel-muted/50 border-white/10',               dot: 'bg-panel-muted/50' },
}

export function TaskTimeline() {
  const tasks  = useAgentsStore((s) => s.tasks)
  const [open, setOpen] = useState(false)

  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const needsApproval = tasks.filter((t) => t.status === 'NEEDS_APPROVAL').length
  const badge = inProgress + needsApproval

  return (
    <div className="relative shrink-0">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Task history"
        className={cn(
          'relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          open ? 'bg-white/[0.06] text-white' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]'
        )}
      >
        <ListChecks size={14} />
        <span>Tasks</span>
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-lamp-working text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {badge}
          </span>
        )}
      </button>

      {/* Floating panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop to close */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              className="absolute bottom-full mb-2 left-0 z-50 w-80 rounded-xl border border-white/[0.08] bg-panel-bg/98 backdrop-blur-md shadow-2xl overflow-hidden"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-semibold text-white tracking-wide">Task History</span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-0.5 rounded text-panel-muted hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Task list */}
              <div className="max-h-72 overflow-y-auto scrollbar-none divide-y divide-white/[0.04]">
                {tasks.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-panel-muted">No tasks yet</p>
                ) : (
                  tasks.slice(0, 20).map((task) => {
                    const meta = STATUS_META[task.status] ?? STATUS_META.PENDING
                    return (
                      <div key={task.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                        {/* Status dot */}
                        <span className={cn('mt-0.5 w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
                        {/* Title */}
                        <span className="flex-1 min-w-0 text-xs text-white/80 leading-relaxed line-clamp-2">
                          {task.title ?? 'Working…'}
                        </span>
                        {/* Status pill */}
                        <span className={cn('shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border', meta.pill)}>
                          {meta.icon}
                          {meta.label}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer counts */}
              {tasks.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] flex-wrap">
                  {(['COMPLETE', 'FAILED', 'IN_PROGRESS', 'NEEDS_APPROVAL', 'PENDING'] as const).map((s) => {
                    const count = tasks.filter((t) => t.status === s).length
                    if (!count) return null
                    const meta = STATUS_META[s]
                    return (
                      <span key={s} className="flex items-center gap-1 text-[10px]">
                        <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                        <span className="text-panel-muted">{meta.label}</span>
                        <span className="text-white/60 font-medium">{count}</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
