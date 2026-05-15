'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, GitBranch, Loader2, CheckCircle2, XCircle, Clock, ArrowRight, RefreshCw } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { cn } from '@/lib/utils'

interface HandoffStep {
  index:       number
  label:       string
  agentId:     string
  agentName:   string
  agentAvatar: string
  agentRole:   string
  status:      'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED'
  taskId:      string | null
}

interface CollabRun {
  id:           string
  workflowName: string
  status:       string
  startedAt:    string
  completedAt:  string | null
  steps:        HandoffStep[]
}

interface Props { onClose: () => void }

const STATUS_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  COMPLETE:    { color: 'text-lamp-done',    bg: 'bg-lamp-done/20 border-lamp-done/30',       icon: <CheckCircle2 size={10} /> },
  IN_PROGRESS: { color: 'text-panel-accent', bg: 'bg-panel-accent/20 border-panel-accent/30', icon: <Loader2 size={10} className="animate-spin" /> },
  FAILED:      { color: 'text-red-400',      bg: 'bg-red-400/10 border-red-400/20',           icon: <XCircle size={10} /> },
  PENDING:     { color: 'text-panel-muted',  bg: 'bg-white/5 border-white/10',                icon: <Clock size={10} /> },
  RUNNING:     { color: 'text-panel-accent', bg: 'bg-panel-accent/20 border-panel-accent/30', icon: <Loader2 size={10} className="animate-spin" /> },
}

export function CollaborationFeed({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()

  const [runs,    setRuns]    = useState<CollabRun[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/collaboration/feed`)
      const data = await res.json()
      if (data.runs) {
        setRuns(data.runs)
        if (data.runs.length > 0 && !expanded) setExpanded(data.runs[0].id)
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [API, authFetch])

  useEffect(() => { load() }, [load])

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000)      return 'just now'
    if (diff < 3600000)    return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000)   return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  return (
    <motion.div
      key="collab-feed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ x: offset.x, y: offset.y }}
      className="absolute left-[192px] top-[215px] bottom-4 z-20 w-[340px] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0 cursor-move select-none">
        <GitBranch size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">Agent Collaboration</span>
        <button onClick={load} title="Refresh" className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-panel-muted/40" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
            <GitBranch size={22} className="text-panel-muted/20" />
            <p className="text-panel-muted text-[11px]">No workflows run yet. Run a multi-step workflow to see agent handoffs here.</p>
          </div>
        ) : (
          runs.map((run) => {
            const style    = STATUS_STYLE[run.status] ?? STATUS_STYLE.PENDING
            const isOpen   = expanded === run.id
            const duration = run.completedAt
              ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
              : null

            return (
              <div
                key={run.id}
                className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden"
              >
                {/* Run header */}
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
                  onClick={() => setExpanded(isOpen ? null : run.id)}
                >
                  <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-medium shrink-0', style.bg, style.color)}>
                    {style.icon}
                    {run.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[11px] font-medium truncate">{run.workflowName}</p>
                    <p className="text-panel-muted text-[9px]">{relTime(run.startedAt)}{duration && ` · ${duration}`}</p>
                  </div>
                  <span className="text-panel-muted/50 text-[9px] shrink-0">{run.steps.length} steps</span>
                </button>

                {/* Expanded handoff chain */}
                {isOpen && (
                  <div className="px-3 pb-3">
                    <div className="flex items-start gap-1 overflow-x-auto scrollbar-none py-1">
                      {run.steps.map((step, i) => {
                        const ss = STATUS_STYLE[step.status] ?? STATUS_STYLE.PENDING
                        return (
                          <div key={step.index} className="flex items-center gap-1 shrink-0">
                            <div className="flex flex-col items-center gap-1 w-[72px]">
                              <div className="relative">
                                <img
                                  src={step.agentAvatar}
                                  alt={step.agentName}
                                  className={cn('w-8 h-8 rounded-full object-cover border-2', step.status === 'COMPLETE' ? 'border-lamp-done/50' : step.status === 'IN_PROGRESS' ? 'border-panel-accent/50' : step.status === 'FAILED' ? 'border-red-400/50' : 'border-white/10')}
                                />
                                <span className={cn('absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border border-panel-bg flex items-center justify-center', ss.bg)}>
                                  <span className={ss.color}>{ss.icon}</span>
                                </span>
                              </div>
                              <p className="text-white/70 text-[8px] text-center leading-tight line-clamp-2 w-full">{step.agentName}</p>
                              <p className="text-panel-muted/60 text-[7px] text-center leading-tight line-clamp-2 w-full">{step.label}</p>
                            </div>
                            {i < run.steps.length - 1 && (
                              <ArrowRight size={10} className="text-panel-muted/30 shrink-0 -mt-4" />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Step details */}
                    <div className="mt-2 space-y-1">
                      {run.steps.map((step) => {
                        const ss = STATUS_STYLE[step.status] ?? STATUS_STYLE.PENDING
                        return (
                          <div key={step.index} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.02]">
                            <span className={cn('text-[8px] tabular-nums text-panel-muted/50 shrink-0 w-3')}>{step.index + 1}</span>
                            <span className="text-white/70 text-[9px] flex-1 truncate">{step.label}</span>
                            <span className={cn('text-[8px]', ss.color)}>{step.status}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </motion.div>
  )
}
