'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Loader2, TrendingUp, DollarSign, Zap, Clock, Brain, ThumbsUp, ThumbsDown, Wrench } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WindowStats {
  tasks:         number
  complete:      number
  failed:        number
  successRate:   number | null
  avgCostUsd:    number
  avgDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
}

interface DayPoint {
  date:     string
  complete: number
  failed:   number
  cost:     number
}

interface Health {
  lifetime: {
    tasks:       number
    costUsd:     number
    tokens:      number
    memoryCount: number
  }
  window7d:  WindowStats
  window30d: WindowStats
  confidence: { HIGH: number; MEDIUM: number; LOW: number }
  dailyVolume: DayPoint[]
  topTools:   Array<{ name: string; count: number }>
  ratings:    { positive: number; negative: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  if (!ms) return '—'
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function shortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ icon, label, value, sub, accent }: {
  icon:    React.ReactNode
  label:   string
  value:   string
  sub?:    string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('shrink-0', accent ? 'text-panel-accent' : 'text-panel-muted')}>{icon}</span>
        <p className="text-panel-muted text-[9px] uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-white text-sm font-semibold leading-none">{value}</p>
      {sub && <p className="text-panel-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function VolumeChart({ data }: { data: DayPoint[] }) {
  const maxVal = Math.max(1, ...data.map((d) => d.complete + d.failed))

  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">
        14-day task volume
      </p>
      <div className="flex items-end gap-px h-16">
        {data.map((d) => {
          const total     = d.complete + d.failed
          const heightPct = (total / maxVal) * 100
          const failPct   = total ? (d.failed / total) * 100 : 0
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end rounded-sm overflow-hidden"
              title={`${shortDate(d.date)}: ${d.complete} ✓  ${d.failed} ✗`}
              style={{ height: `${Math.max(heightPct, total > 0 ? 8 : 2)}%` }}
            >
              {d.failed > 0 && (
                <div
                  className="w-full bg-lamp-blocked/60 shrink-0"
                  style={{ height: `${failPct}%`, minHeight: 2 }}
                />
              )}
              <div className="w-full bg-lamp-done/50 flex-1" />
            </div>
          )
        })}
      </div>
      {/* x-axis labels — first and last only */}
      <div className="flex justify-between mt-1">
        <span className="text-[8px] text-panel-muted/60">{shortDate(data[0]?.date ?? '')}</span>
        <span className="text-[8px] text-panel-muted/60">{shortDate(data[data.length - 1]?.date ?? '')}</span>
      </div>
    </div>
  )
}

// ── Cost sparkline ────────────────────────────────────────────────────────────

function CostSparkline({ data }: { data: DayPoint[] }) {
  const costs  = data.map((d) => d.cost)
  const maxVal = Math.max(0.0001, ...costs)

  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">Daily spend ($)</p>
      <div className="flex items-end gap-px h-10">
        {data.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-sm bg-panel-accent/40 hover:bg-panel-accent/70 transition-colors"
            style={{ height: `${Math.max((d.cost / maxVal) * 100, d.cost > 0 ? 6 : 2)}%` }}
            title={`${shortDate(d.date)}: $${d.cost.toFixed(4)}`}
          />
        ))}
      </div>
    </div>
  )
}

// ── Confidence distribution ───────────────────────────────────────────────────

function ConfidenceDist({ dist }: { dist: { HIGH: number; MEDIUM: number; LOW: number } }) {
  const total = (dist.HIGH + dist.MEDIUM + dist.LOW) || 1
  const bars = [
    { label: 'High',   count: dist.HIGH,   className: 'bg-lamp-done' },
    { label: 'Medium', count: dist.MEDIUM, className: 'bg-lamp-idle' },
    { label: 'Low',    count: dist.LOW,    className: 'bg-lamp-blocked' },
  ]

  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">Confidence distribution</p>
      <div className="space-y-1.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="text-[10px] text-panel-muted w-10 shrink-0">{b.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(b.count / total) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={cn('h-full rounded-full', b.className)}
              />
            </div>
            <span className="text-[10px] text-panel-muted w-5 text-right shrink-0">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Top tools ─────────────────────────────────────────────────────────────────

function TopTools({ tools }: { tools: Array<{ name: string; count: number }> }) {
  if (!tools.length) return null
  const max = tools[0]?.count || 1

  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">Top tools used</p>
      <div className="space-y-1.5">
        {tools.map((t) => (
          <div key={t.name} className="flex items-center gap-2">
            <span className="text-[10px] text-white/70 font-mono truncate flex-1 min-w-0">{t.name}</span>
            <div className="w-20 h-1.5 rounded-full bg-white/5 overflow-hidden shrink-0">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(t.count / max) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full rounded-full bg-panel-accent/60"
              />
            </div>
            <span className="text-[10px] text-panel-muted w-5 text-right shrink-0">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Window toggle ─────────────────────────────────────────────────────────────

type Window = '7d' | '30d'

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  agentId:   string
  agentName: string
  onClose:   () => void
}

export function AgentHealthPanel({ agentId, agentName, onClose }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL

  const [health,  setHealth]  = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [window,  setWindow]  = useState<Window>('7d')

  useEffect(() => {
    authFetch(`${API}/api/agents/${agentId}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d.health ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId, API, authFetch])

  const w = window === '7d' ? health?.window7d : health?.window30d

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="fixed right-[552px] top-16 bottom-16 z-50 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <TrendingUp size={13} className="text-panel-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{agentName} · Health</p>
          {health && (
            <p className="text-panel-muted text-[10px]">
              {health.lifetime.tasks} lifetime tasks · ${health.lifetime.costUsd.toFixed(3)} total
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Window toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        {(['7d', '30d'] as Window[]).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={cn(
              'flex-1 py-1.5 text-[10px] font-medium transition-colors',
              window === w ? 'text-white border-b border-panel-accent' : 'text-panel-muted hover:text-white'
            )}
          >
            Last {w === '7d' ? '7 days' : '30 days'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-none">
        {loading && (
          <div className="flex justify-center pt-10">
            <Loader2 size={16} className="animate-spin text-panel-muted" />
          </div>
        )}

        {!loading && health && w && (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-2">
              <Stat
                icon={<TrendingUp size={11} />}
                label="Success rate"
                value={w.successRate != null ? `${w.successRate}%` : '—'}
                sub={`${w.complete} done · ${w.failed} failed`}
                accent={w.successRate != null && w.successRate >= 80}
              />
              <Stat
                icon={<DollarSign size={11} />}
                label="Avg cost/task"
                value={w.avgCostUsd ? `$${w.avgCostUsd.toFixed(4)}` : '—'}
                sub={`${w.tasks} tasks`}
              />
              <Stat
                icon={<Clock size={11} />}
                label="Avg duration"
                value={w.avgDurationMs ? fmt(w.avgDurationMs) : '—'}
                sub={`p95 ${fmt(w.p95DurationMs)}`}
              />
              <Stat
                icon={<Zap size={11} />}
                label="p50 latency"
                value={fmt(w.p50DurationMs)}
                sub={`p95 ${fmt(w.p95DurationMs)}`}
              />
            </div>

            {/* Ratings */}
            {(health.ratings.positive + health.ratings.negative) > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                <p className="text-panel-muted text-[9px] uppercase tracking-widest flex-1">User ratings</p>
                <span className="flex items-center gap-1 text-lamp-done text-xs font-medium">
                  <ThumbsUp size={10} /> {health.ratings.positive}
                </span>
                <span className="flex items-center gap-1 text-lamp-blocked text-xs font-medium">
                  <ThumbsDown size={10} /> {health.ratings.negative}
                </span>
              </div>
            )}

            {/* Memory */}
            <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
              <Brain size={11} className="text-panel-accent shrink-0" />
              <p className="text-panel-muted text-[10px] flex-1">Memories learned</p>
              <p className="text-white text-sm font-semibold">{health.lifetime.memoryCount}</p>
            </div>

            {/* Charts */}
            <VolumeChart data={health.dailyVolume} />
            <CostSparkline data={health.dailyVolume} />
            <ConfidenceDist dist={health.confidence} />

            {/* Top tools */}
            {health.topTools.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                <div className="flex items-center gap-1.5 mb-3">
                  <Wrench size={11} className="text-panel-muted" />
                  <TopTools tools={health.topTools} />
                </div>
              </div>
            )}

            {/* Lifetime summary */}
            <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
              <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">Lifetime</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-white text-sm font-semibold">{health.lifetime.tasks}</p>
                  <p className="text-panel-muted text-[9px]">tasks</p>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">
                    {health.lifetime.tokens >= 1000
                      ? `${(health.lifetime.tokens / 1000).toFixed(1)}k`
                      : health.lifetime.tokens}
                  </p>
                  <p className="text-panel-muted text-[9px]">tokens</p>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">${health.lifetime.costUsd.toFixed(3)}</p>
                  <p className="text-panel-muted text-[9px]">spent</p>
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && !health && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center px-4">
            <TrendingUp size={20} className="text-panel-muted/40" />
            <p className="text-panel-muted text-xs">No health data yet. Complete some tasks to see metrics.</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
