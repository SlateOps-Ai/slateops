'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Clock, TrendingUp, Zap, Target } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface RoiData {
  tasksCompleted30d: number
  avgMinutesPerTask: number
  totalMinutesSaved: number
  contentPieces:     number
  workflowRuns:      number
  successRate:       number
}

interface Props { onClose: () => void }

export function RoiDashboard({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [data,    setData]    = useState<RoiData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${API}/api/roi/summary`)
      const json = await res.json()
      if (json.data) setData(json.data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [API, authFetch])

  useEffect(() => { load() }, [load])

  const hoursSaved = data ? data.totalMinutesSaved / 60 : 0

  const kpis = [
    {
      icon:  <Clock size={14} />,
      label: 'Hours delegated (30d)',
      value: data ? `${hoursSaved.toFixed(1)}h` : '—',
      sub:   data ? `${data.tasksCompleted30d} tasks completed` : '',
      color: 'text-blue-400',
      bg:    'bg-blue-500/10 border-blue-500/20',
    },
    {
      icon:  <Zap size={14} />,
      label: 'Tasks completed',
      value: data ? String(data.tasksCompleted30d) : '—',
      sub:   data ? `${data.workflowRuns} workflow runs` : '',
      color: 'text-amber-400',
      bg:    'bg-amber-500/10 border-amber-500/20',
    },
    {
      icon:  <TrendingUp size={14} />,
      label: 'Success rate',
      value: data ? `${data.successRate}%` : '—',
      sub:   'tasks completed vs attempted',
      color: 'text-panel-accent',
      bg:    'bg-panel-accent/10 border-panel-accent/20',
    },
    {
      icon:  <Target size={14} />,
      label: 'Content pieces',
      value: data ? String(data.contentPieces) : '—',
      sub:   'posts, drafts & reports',
      color: 'text-emerald-400',
      bg:    'bg-emerald-500/10 border-emerald-500/20',
    },
  ]

  return (
    <motion.div
      key="roi-panel"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute left-[192px] top-[215px] bottom-4 z-20 w-[300px] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
        <Target size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">ROI Dashboard</span>
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      {/* Real metrics notice */}
      <div className="px-3 py-2 border-b border-white/[0.06] shrink-0 flex items-center gap-2">
        <span className="text-[10px] text-panel-muted flex-1">Real metrics — tasks delegated and time saved</span>
        <span className="text-[10px] text-emerald-400/70 font-medium">Live</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3 space-y-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-2">
              {kpis.map(({ icon, label, value, sub, color, bg }) => (
                <div key={label} className={cn('rounded-xl border px-3 py-2.5', bg)}>
                  <div className={cn('mb-1 shrink-0', color)}>{icon}</div>
                  <p className={cn('text-[16px] font-bold tabular-nums leading-none', color)}>{value}</p>
                  <p className="text-[9px] text-panel-muted/70 mt-0.5 leading-tight">{label}</p>
                  {sub && <p className={cn('text-[8px] mt-0.5', color + '/70')}>{sub}</p>}
                </div>
              ))}
            </div>

            {/* Success rate bar */}
            {data && (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-panel-muted uppercase tracking-widest">Agent success rate</p>
                  <span className={cn('text-[12px] font-bold', data.successRate >= 80 ? 'text-emerald-400' : data.successRate >= 60 ? 'text-amber-400' : 'text-red-400')}>
                    {data.successRate}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', data.successRate >= 80 ? 'bg-emerald-400' : data.successRate >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: `${data.successRate}%` }}
                  />
                </div>
              </div>
            )}

            {/* Workflow runs */}
            {data && data.workflowRuns > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 flex items-center gap-3">
                <Zap size={14} className="text-panel-accent shrink-0" />
                <div>
                  <p className="text-white text-[13px] font-bold">{data.workflowRuns}</p>
                  <p className="text-panel-muted text-[9px]">Automated workflow runs saved</p>
                </div>
              </div>
            )}

            {/* Coming soon */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center">
              <p className="text-[10px] text-panel-muted leading-relaxed">
                Real metrics coming — tracking tasks delegated and time saved.
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
