'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, TrendingUp, CheckSquare, DollarSign, Zap, ThumbsUp, BarChart2,
  Terminal, GitBranch, Star, Flame,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface DailyStat  { date: string; count: number; costUsd: number }
interface TopAgent    { agentId: string; agentName: string; count: number; costUsd: number }
interface TopCommand  { title: string; runCount: number; lastRunAt: string }

interface Summary {
  total30d:        number
  complete30d:     number
  failed30d:       number
  todayComplete:   number
  successRate:     number
  totalCostUsd:    number
  avgCostUsd:      number
  totalTokens:     number
  topAgents:       TopAgent[]
  dailyVolume:     DailyStat[]
  confidenceDist:  { HIGH: number; MEDIUM: number; LOW: number }
  positiveRatings: number
  negativeRatings: number
  topCommands:     TopCommand[]
  workflows:       { total30d: number; complete30d: number; failed30d: number; successRate: number }
  xp:              { totalXp: number; level: number; streakDays: number } | null
}

type ChartMode = 'count' | 'cost'

function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 flex items-start gap-2.5">
      <span className={cn('mt-0.5 shrink-0', accent ?? 'text-panel-muted')}>{icon}</span>
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold leading-tight">{value}</p>
        <p className="text-panel-muted text-[10px] truncate">{label}</p>
        {sub && <p className={cn('text-[10px] mt-0.5', accent ?? 'text-panel-muted')}>{sub}</p>}
      </div>
    </div>
  )
}

function MiniBar({ stats, mode }: { stats: DailyStat[]; mode: ChartMode }) {
  const max = Math.max(...stats.map((s) => mode === 'count' ? s.count : s.costUsd), 1)
  return (
    <div className="flex items-end gap-1 h-12">
      {stats.map((s) => {
        const val = mode === 'count' ? s.count : s.costUsd
        return (
          <div key={s.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-sm bg-panel-accent/40 group-hover:bg-panel-accent/70 transition-colors"
              style={{ height: `${Math.max((val / max) * 44, 2)}px` }}
            />
            {/* Hover tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-50 pointer-events-none">
              <div className="bg-panel-bg border border-white/10 rounded px-1.5 py-1 text-center whitespace-nowrap">
                <p className="text-white text-[9px] font-medium">
                  {mode === 'count' ? `${s.count} tasks` : `$${s.costUsd.toFixed(3)}`}
                </p>
              </div>
            </div>
            <span className="text-[8px] text-panel-muted">
              {new Date(s.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'narrow' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ConfidenceBar({ dist }: { dist: Summary['confidenceDist'] }) {
  const total = dist.HIGH + dist.MEDIUM + dist.LOW || 1
  const pct   = (n: number) => Math.round((n / total) * 100)
  return (
    <div className="space-y-1.5">
      {(['HIGH', 'MEDIUM', 'LOW'] as const).map((band) => (
        <div key={band} className="flex items-center gap-2">
          <span className={cn('text-[10px] w-12 shrink-0', {
            'text-lamp-done':    band === 'HIGH',
            'text-lamp-idle':    band === 'MEDIUM',
            'text-lamp-blocked': band === 'LOW',
          })}>
            {band}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', {
                'bg-lamp-done':    band === 'HIGH',
                'bg-lamp-idle':    band === 'MEDIUM',
                'bg-lamp-blocked': band === 'LOW',
              })}
              style={{ width: `${pct(dist[band])}%` }}
            />
          </div>
          <span className="text-[10px] text-panel-muted w-8 text-right">{dist[band]}</span>
        </div>
      ))}
    </div>
  )
}

interface Props { open: boolean; onClose: () => void }

export function AnalyticsDashboard({ open, onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('count')

  useEffect(() => {
    setLoading(true)
    authFetch(`${API}/api/analytics/summary`)
      .then((r) => r.json())
      .then((d) => setSummary(d.summary))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [API, authFetch])

  const totalRatings     = (summary?.positiveRatings ?? 0) + (summary?.negativeRatings ?? 0)
  const satisfactionPct  = totalRatings > 0
    ? Math.round(((summary?.positiveRatings ?? 0) / totalRatings) * 100) : null

  return (
    <AnimatePresence>
      {open && (
        <>
        <motion.div
          key="analytics-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <motion.div
          key="analytics-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ x: '-50%', y: '-50%' }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-240px))] max-h-[70vh] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07] shrink-0">
            <div className="flex items-center gap-2">
              <BarChart2 size={12} className="text-panel-accent" />
              <span className="text-white text-[12px] font-semibold">Office Analytics</span>
            </div>
            <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
              <X size={12} />
            </button>
          </div>

          <div className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scrollbar-none">
            {loading && <p className="text-panel-muted text-xs text-center py-4">Loading…</p>}

            {!loading && summary && (
              <>
                {/* KPI grid */}
                <div className="grid grid-cols-2 gap-2">
                  <KpiCard
                    icon={<CheckSquare size={13} />}
                    label="Completed (30d)"
                    value={String(summary.complete30d)}
                    sub={`${summary.successRate}% success`}
                    accent="text-lamp-done"
                  />
                  <KpiCard
                    icon={<TrendingUp size={13} />}
                    label="Today"
                    value={String(summary.todayComplete)}
                    sub="tasks done"
                    accent="text-panel-accent"
                  />
                  <KpiCard
                    icon={<DollarSign size={13} />}
                    label="Avg cost / task"
                    value={summary.avgCostUsd > 0 ? `$${summary.avgCostUsd.toFixed(3)}` : '—'}
                    sub={`$${summary.totalCostUsd.toFixed(3)} total`}
                  />
                  {satisfactionPct !== null ? (
                    <KpiCard
                      icon={<ThumbsUp size={13} />}
                      label="Satisfaction"
                      value={`${satisfactionPct}%`}
                      sub={`${totalRatings} rated`}
                      accent={satisfactionPct >= 70 ? 'text-lamp-done' : 'text-lamp-idle'}
                    />
                  ) : (
                    <KpiCard
                      icon={<Zap size={13} />}
                      label="Total tasks"
                      value={String(summary.total30d)}
                      sub="last 30 days"
                    />
                  )}
                </div>

                {/* XP + Streak pills */}
                {summary.xp && (
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl border border-panel-accent/20 bg-panel-accent/6 px-3 py-2 flex items-center gap-2">
                      <Star size={11} className="text-panel-accent shrink-0" />
                      <div>
                        <p className="text-white text-xs font-semibold">Lv {summary.xp.level}</p>
                        <p className="text-panel-muted text-[9px]">{summary.xp.totalXp.toLocaleString()} XP</p>
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl border border-amber-400/20 bg-amber-400/6 px-3 py-2 flex items-center gap-2">
                      <Flame size={11} className="text-amber-400 shrink-0" />
                      <div>
                        <p className="text-white text-xs font-semibold">{summary.xp.streakDays}d streak</p>
                        <p className="text-panel-muted text-[9px]">daily activity</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Daily volume chart with mode toggle */}
                {summary.dailyVolume.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-panel-muted text-[10px] uppercase tracking-widest">Last 7 days</p>
                      <div className="flex gap-1">
                        {(['count', 'cost'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setChartMode(m)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[9px] transition-colors',
                              chartMode === m ? 'bg-panel-accent/20 text-panel-accent' : 'text-panel-muted hover:text-white'
                            )}
                          >
                            {m === 'count' ? 'Tasks' : 'Cost'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <MiniBar stats={summary.dailyVolume} mode={chartMode} />
                  </div>
                )}

                {/* Workflow stats */}
                {summary.workflows.total30d > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <GitBranch size={11} className="text-panel-muted" />
                      <p className="text-panel-muted text-[10px] uppercase tracking-widest">Workflows (30d)</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'Ran',      value: summary.workflows.total30d,    color: 'text-white' },
                        { label: 'Complete', value: summary.workflows.complete30d, color: 'text-lamp-done' },
                        { label: 'Success',  value: `${summary.workflows.successRate}%`, color: 'text-panel-accent' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg border border-white/8 bg-white/3 px-2 py-1.5 text-center">
                          <p className={cn('text-xs font-semibold', s.color)}>{s.value}</p>
                          <p className="text-panel-muted text-[9px]">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top commands */}
                {summary.topCommands.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Terminal size={11} className="text-panel-muted" />
                      <p className="text-panel-muted text-[10px] uppercase tracking-widest">Top commands</p>
                    </div>
                    <div className="space-y-1">
                      {summary.topCommands.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-panel-muted text-[10px] w-3 shrink-0">{i + 1}</span>
                          <span className="text-white text-xs flex-1 truncate">{c.title}</span>
                          <span className="text-panel-muted text-[10px] shrink-0">{c.runCount}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence distribution */}
                <div>
                  <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-2">Confidence distribution</p>
                  <ConfidenceBar dist={summary.confidenceDist} />
                </div>

                {/* Top agents */}
                {summary.topAgents.length > 0 && (
                  <div>
                    <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-2">Top agents</p>
                    <div className="space-y-1">
                      {summary.topAgents.map((a, i) => (
                        <div key={a.agentId} className="flex items-center gap-2">
                          <span className="text-panel-muted text-[10px] w-3 shrink-0">{i + 1}</span>
                          <span className="text-white text-xs flex-1 truncate">{a.agentName}</span>
                          <span className="text-panel-muted text-[10px]">{a.count} tasks</span>
                          {a.costUsd > 0 && (
                            <span className="text-panel-muted/50 text-[9px]">${a.costUsd.toFixed(3)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
