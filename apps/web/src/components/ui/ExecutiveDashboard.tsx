'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, Loader2, AlertTriangle,
  RefreshCw, TrendingUp, ThumbsUp, ChevronLeft, Calendar,
  ChevronDown, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentStats {
  id:        string
  name:      string
  role:      string
  avatarUrl: string
  status:    string
  tasks: {
    total:         number
    complete:      number
    failed:        number
    inProgress:    number
    needsApproval: number
    successRate:   number
  }
}

interface ExecData {
  overview: {
    total:            number
    complete:         number
    failed:           number
    pending:          number
    inProgress:       number
    needsApproval:    number
    successRate:      number
    ratedCount:       number
    satisfactionRate: number | null
  }
  agents:   AgentStats[]
  scheduled: {
    totalActive: number
    ran30d:      number
    complete30d: number
    failed30d:   number
  }
  pendingActions: { taskId: string; title: string; agentName: string; status: string }[]
  recentFailed:   { taskId: string; title: string; agentName: string }[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  WORKING: { label: 'Working', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  IDLE:    { label: 'Idle',    cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  BLOCKED: { label: 'Blocked', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  OFFLINE: { label: 'Offline', cls: 'bg-white/10 text-white/40 border-white/10' },
}

const ROLE_LABEL: Record<string, string> = {
  EXEC_ASSISTANT:     'Executive Assistant',
  CONTENT_WRITER:     'Content Writer',
  RESEARCH_ANALYST:   'Research Analyst',
  FINANCIAL_ANALYST:  'Financial Analyst',
  SALES_PROSPECTOR:   'Sales Prospector',
  MARKETING_STRATEGIST: 'Marketing',
  CUSTOMER_SUPPORT:   'Support',
  DATA_ANALYST:       'Data Analyst',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({
  children, open, onToggle,
}: { children: React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 pt-3 pb-1 hover:bg-white/[0.03] transition-colors"
    >
      <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-widest text-panel-muted/60">
        {children}
      </span>
      <ChevronDown size={10} className={cn('text-panel-muted/40 transition-transform shrink-0', open && 'rotate-180')} />
    </button>
  )
}

function KpiGrid({ ov, dim }: { ov: ExecData['overview'] | undefined; dim: boolean }) {
  const items = [
    { icon: <CheckCircle2 size={11} />, label: 'Done',     value: ov?.complete      ?? 0, color: 'text-emerald-400' },
    { icon: <Loader2      size={11} />, label: 'Active',   value: ov?.inProgress    ?? 0, color: 'text-blue-400'    },
    { icon: <AlertTriangle size={11}/>, label: 'Review',   value: ov?.needsApproval ?? 0, color: 'text-amber-400'   },
    { icon: <XCircle      size={11} />, label: 'Failed',   value: ov?.failed        ?? 0, color: 'text-red-400'     },
    { icon: <Clock        size={11} />, label: 'Pending',  value: ov?.pending       ?? 0, color: 'text-white/40'    },
    { icon: <TrendingUp   size={11} />, label: 'Success',  value: ov ? `${ov.successRate}%` : '—', color: 'text-panel-accent' },
  ]
  return (
    <div className="grid grid-cols-2 gap-px mx-2 mb-1">
      {items.map(({ icon, label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.025] hover:bg-white/[0.05] transition-colors"
        >
          <span className={cn('shrink-0', dim ? 'text-white/20' : color)}>{icon}</span>
          <div className="min-w-0">
            <p className={cn('text-[12px] font-bold tabular-nums leading-none', dim ? 'text-white/25' : color)}>{value}</p>
            <p className="text-[9px] text-panel-muted/50 mt-0.5 truncate">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentCard({ agent }: { agent: AgentStats }) {
  const pill    = STATUS_PILL[agent.status] ?? STATUS_PILL.OFFLINE
  const total   = agent.tasks.complete + agent.tasks.failed
  const pct     = total > 0 ? (agent.tasks.complete / total) * 100 : 0
  const barColor = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  const role    = ROLE_LABEL[agent.role] ?? agent.role

  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
      {/* Avatar */}
      <div className="relative shrink-0 mt-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-[11px] text-white/85 font-semibold truncate leading-none">{agent.name}</p>
          <span className={cn('shrink-0 text-[8px] font-medium px-1.5 py-0.5 rounded-full border', pill.cls)}>
            {pill.label}
          </span>
        </div>
        <p className="text-[9px] text-panel-muted truncate mb-1.5">{role}</p>

        {/* Mini progress bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-white/[0.07] rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={cn('text-[9px] font-semibold tabular-nums shrink-0',
            pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : total === 0 ? 'text-white/30' : 'text-red-400'
          )}>
            {total === 0 ? '—' : `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onHide:  () => void
}

export function ExecutiveDashboard({ visible, onHide }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [data,      setData]      = useState<ExecData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  // Collapsible section state
  const [openTasks,  setOpenTasks]  = useState(true)
  const [openAgents, setOpenAgents] = useState(true)
  const [openSched,  setOpenSched]  = useState(true)
  const [openAlerts, setOpenAlerts] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/analytics/executive`)
      const json = await res.json()
      if (json.error) console.error('[ExecutiveBrief]', json.error)
      setData(json)
      setLastFetch(new Date())
    } catch (e) {
      console.error('[ExecutiveBrief] fetch failed', e)
    } finally { setLoading(false) }
  }, [API, authFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const ov      = data?.overview
  const agents  = data?.agents ?? []
  const sched   = data?.scheduled
  const pending = data?.pendingActions ?? []
  const failed  = data?.recentFailed   ?? []

  // Hero health score
  const healthScore = ov ? ov.successRate : null
  const healthColor = healthScore == null ? 'text-white/20'
    : healthScore >= 80 ? 'text-emerald-400'
    : healthScore >= 50 ? 'text-amber-400'
    : 'text-red-400'

  // Last updated label
  const lastUpdated = lastFetch
    ? `${Math.floor((Date.now() - lastFetch.getTime()) / 1000)}s ago`
    : null

  return (
    <AnimatePresence>
      {visible && (
        <>
        <motion.div
          key="exec-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={onHide}
        />
        <motion.div
          key="exec-sidebar"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ x: '-50%', y: '-50%' }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-240px))] max-h-[70vh] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
            <TrendingUp size={12} className="text-panel-accent shrink-0" />
            <span className="text-[12px] font-semibold text-white flex-1">Executive Brief</span>
            {lastUpdated && (
              <span className="text-[9px] text-panel-muted/40 shrink-0">{lastUpdated}</span>
            )}
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onHide} title="Hide"
              className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronLeft size={12} />
            </button>
          </div>

          {/* ── Hero strip ── */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.06] shrink-0">
            {/* Health score */}
            <div className="flex flex-col items-center justify-center w-14 shrink-0">
              <span className={cn('text-[28px] font-bold tabular-nums leading-none', healthColor)}>
                {healthScore ?? '—'}
              </span>
              <span className="text-[8px] text-panel-muted/50 mt-0.5 uppercase tracking-wider">Health</span>
            </div>
            <div className="w-px h-8 bg-white/[0.07] shrink-0" />
            {/* Quick totals */}
            <div className="flex-1 grid grid-cols-3 gap-1">
              {[
                { label: 'Total',    value: ov?.total       ?? 0 },
                { label: 'Active',   value: ov?.inProgress  ?? 0 },
                { label: 'Agents',   value: agents.length          },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className={cn('text-[16px] font-bold tabular-nums leading-none', !ov && label !== 'Agents' ? 'text-white/20' : 'text-white/80')}>{value}</p>
                  <p className="text-[8px] text-panel-muted/50 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {ov?.satisfactionRate != null && (
              <>
                <div className="w-px h-8 bg-white/[0.07] shrink-0" />
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex items-center gap-0.5">
                    <ThumbsUp size={9} className="text-emerald-400" />
                    <span className="text-[14px] font-bold text-emerald-400 tabular-nums">{ov.satisfactionRate}%</span>
                  </div>
                  <span className="text-[8px] text-panel-muted/50 mt-0.5">Satisfaction</span>
                </div>
              </>
            )}
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto scrollbar-none pb-3">

            {loading && !data && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-panel-muted" />
              </div>
            )}

            {/* ── Task Overview ── */}
            <SectionHeader open={openTasks} onToggle={() => setOpenTasks(o => !o)}>
              <span className="flex items-center gap-1.5"><Activity size={9} /> Task Overview</span>
            </SectionHeader>
            <AnimatePresence initial={false}>
              {openTasks && (
                <motion.div key="tasks" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                  <KpiGrid ov={ov} dim={!ov} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mx-3 my-1 border-t border-white/[0.05]" />

            {/* ── Agents ── */}
            <SectionHeader open={openAgents} onToggle={() => setOpenAgents(o => !o)}>
              Agents ({agents.length})
            </SectionHeader>
            <AnimatePresence initial={false}>
              {openAgents && (
                <motion.div key="agents" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                  {agents.length === 0 ? (
                    <p className="text-[11px] text-panel-muted/35 italic px-3 py-2">No agents hired yet</p>
                  ) : (
                    <div className="px-1 pb-1 space-y-0.5">
                      {agents.map(a => <AgentCard key={a.id} agent={a} />)}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mx-3 my-1 border-t border-white/[0.05]" />

            {/* ── Scheduled Posts ── */}
            <SectionHeader open={openSched} onToggle={() => setOpenSched(o => !o)}>
              <span className="flex items-center gap-1.5"><Calendar size={9} /> Scheduled Posts</span>
            </SectionHeader>
            <AnimatePresence initial={false}>
              {openSched && (
                <motion.div key="sched" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                  <div className="grid grid-cols-2 gap-px mx-2 mb-1">
                    {[
                      { label: 'Active',    value: sched?.totalActive ?? 0, color: 'text-panel-accent' },
                      { label: 'Runs (30d)',value: sched?.ran30d      ?? 0, color: 'text-white/50'     },
                      { label: 'Published', value: sched?.complete30d ?? 0, color: 'text-emerald-400'  },
                      { label: 'Failed',    value: sched?.failed30d   ?? 0, color: 'text-red-400'      },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex flex-col px-2.5 py-2 rounded-lg bg-white/[0.025]">
                        <p className={cn('text-[13px] font-bold tabular-nums leading-none', !sched ? 'text-white/20' : color)}>{value}</p>
                        <p className="text-[9px] text-panel-muted/50 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mx-3 my-1 border-t border-white/[0.05]" />

            {/* ── Alerts ── */}
            <SectionHeader open={openAlerts} onToggle={() => setOpenAlerts(o => !o)}>
              Alerts {pending.length + failed.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] font-bold border border-red-500/20">
                  {pending.length + failed.length}
                </span>
              )}
            </SectionHeader>
            <AnimatePresence initial={false}>
              {openAlerts && (
                <motion.div key="alerts" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                  <div className="px-2 space-y-1.5 pb-1">
                    {pending.length === 0 && failed.length === 0 ? (
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                        <p className="text-[11px] font-semibold text-emerald-400">All clear — no alerts</p>
                      </div>
                    ) : (
                      <>
                        {pending.map(p => (
                          <div key={p.taskId} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors">
                            <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-amber-400 truncate">{p.title}</p>
                              <p className="text-[9px] text-amber-400/60">{p.agentName} · needs approval</p>
                            </div>
                          </div>
                        ))}
                        {failed.map(f => (
                          <div key={f.taskId} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-colors">
                            <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-red-400 truncate">{f.title}</p>
                              <p className="text-[9px] text-red-400/60">{f.agentName}</p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
