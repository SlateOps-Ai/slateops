'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  ArrowLeft, Shield, CheckCircle2, XCircle, Clock,
  AlertCircle, ChevronRight, Zap, Activity, Users,
  CheckCheck, Ban, Mail, CreditCard, Globe, FileText,
  TrendingUp, AlertTriangle, ThumbsUp, RefreshCw,
  Star, Flame, Target, Terminal, GitBranch, DollarSign, BarChart2,
  ListChecks, Loader2, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents.store'

// ── Approval types ────────────────────────────────────────────────────────────
interface PendingApproval {
  id: string; title: string; agentName: string; agentAvatar: string | null
  agentRole: string; action: string; preview: string | null
  createdAt: string; expiresAt: string | null
}
interface ActivityItem {
  id: string; title: string; status: 'COMPLETE' | 'FAILED' | 'CANCELLED'
  agentName: string; agentAvatar: string | null; completedAt: string; costUsd: number | null
}
interface Summary {
  pendingCount: number; pendingApprovals: PendingApproval[]
  recentActivity: ActivityItem[]
  agentSummary: { id: string; name: string; status: string; role: string }[]
}

// ── Executive data types ──────────────────────────────────────────────────────
interface AgentStats {
  id: string; name: string; role: string; avatarUrl: string; status: string
  tasks: { total: number; complete: number; failed: number; inProgress: number; needsApproval: number; successRate: number }
}
interface ExecData {
  overview: { total: number; complete: number; failed: number; pending: number; inProgress: number; needsApproval: number; successRate: number; satisfactionRate: number | null }
  agents: AgentStats[]
  scheduled: { totalActive: number; ran30d: number; complete30d: number; failed30d: number }
  pendingActions: { taskId: string; title: string; agentName: string; status: string }[]
  recentFailed:   { taskId: string; title: string; agentName: string }[]
}

// ── ROI types ─────────────────────────────────────────────────────────────────
interface RoiData {
  tasksCompleted30d: number; avgMinutesPerTask: number; totalMinutesSaved: number
  contentPieces: number; workflowRuns: number; successRate: number
}

// ── Content pipeline types ────────────────────────────────────────────────────
interface PipelinePost {
  id: string; content: string; platforms: string[]; scheduledAt: string
  publishedAt?: string; status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED'
  agentId?: string | null
}

// ── Analytics types ───────────────────────────────────────────────────────────
interface DailyStat  { date: string; count: number; costUsd: number }
interface TopCommand { title: string; runCount: number }
interface AnalyticsSummary {
  total30d: number; complete30d: number; todayComplete: number; successRate: number
  totalCostUsd: number; avgCostUsd: number
  positiveRatings: number; negativeRatings: number
  dailyVolume: DailyStat[]
  confidenceDist: { HIGH: number; MEDIUM: number; LOW: number }
  topCommands: TopCommand[]
  workflows: { total30d: number; complete30d: number; successRate: number }
  xp: { totalXp: number; level: number; streakDays: number } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatClockTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(' ', '')
}
function narrativeVerb(item: ActivityItem): string {
  if (item.status === 'COMPLETE')  return 'finished'
  if (item.status === 'FAILED')    return 'hit a snag on'
  return 'cancelled'   // CANCELLED
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const m = Math.floor(diff / 60000)
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h left`
}
/**
 * Section banner — horizontal divider with a numbered label. Used to
 * consolidate the 11 widgets into 5 mental zones (Decisions / Today /
 * Team / Money / Guardrails) without moving any underlying JSX.
 */
function SectionBanner({ n, label, subtitle, tone = 'neutral' }: {
  n: number; label: string; subtitle?: string; tone?: 'neutral' | 'amber' | 'blue' | 'emerald'
}) {
  const tint =
    tone === 'amber'   ? 'text-amber-400'   :
    tone === 'blue'    ? 'text-[#4d7fff]'   :
    tone === 'emerald' ? 'text-emerald-400' :
                         'text-white/40'
  return (
    <div className="flex items-center gap-3 pt-1 pb-2">
      <span className={cn('text-[9px] uppercase tracking-[0.2em] font-black tabular-nums', tint)}>{n.toString().padStart(2, '0')}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-bold uppercase tracking-widest text-white antialiased">{label}</span>
        {subtitle && <span className="text-[10px] text-white/30">— {subtitle}</span>}
      </div>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

interface Anomaly {
  tone: 'positive' | 'warning' | 'neutral'
  icon: React.ReactNode
  text: string
}

/**
 * Detect "what changed" callouts from the day's stats versus the rolling
 * average. The point isn't statistical rigor — it's flagging the 2-3 things
 * a CEO would say "huh, that's worth a look" about. Empty array → nothing
 * abnormal, hide the section entirely (silence is the absence of news).
 */
function detectAnomalies(analytics: AnalyticsSummary | null, exec: ExecData | null): Anomaly[] {
  const out: Anomaly[] = []
  if (!analytics || !exec) return out

  // Today vs the rolling 6-day average
  const days = analytics.dailyVolume ?? []
  if (days.length >= 4) {
    const past6     = days.slice(-7, -1)
    const todayCnt  = analytics.todayComplete
    const avgCnt    = past6.length ? past6.reduce((s, d) => s + d.count, 0) / past6.length : 0
    const todayCost = days[days.length - 1]?.costUsd ?? 0
    const avgCost   = past6.length ? past6.reduce((s, d) => s + d.costUsd, 0) / past6.length : 0

    if (avgCnt >= 1 && todayCnt >= avgCnt * 1.5) {
      const pct = Math.round((todayCnt / avgCnt - 1) * 100)
      out.push({ tone: 'positive', icon: <TrendingUp size={11} />, text: `Big day — ${todayCnt} tasks done, ${pct}% above your weekly average.` })
    } else if (avgCnt >= 3 && todayCnt <= avgCnt * 0.5 && new Date().getHours() >= 14) {
      out.push({ tone: 'warning', icon: <AlertTriangle size={11} />, text: `Slower than usual — ${todayCnt} tasks today vs your usual ${Math.round(avgCnt)}.` })
    }
    if (avgCost >= 0.05 && todayCost >= avgCost * 2.5) {
      const x = (todayCost / avgCost).toFixed(1)
      out.push({ tone: 'warning', icon: <DollarSign size={11} />, text: `$${todayCost.toFixed(2)} spent today — about ${x}× normal. Worth a look.` })
    }
  }

  // Failures today
  const fails = exec.recentFailed?.length ?? 0
  if (fails >= 2) {
    out.push({ tone: 'warning', icon: <XCircle size={11} />, text: `${fails} task${fails === 1 ? '' : 's'} failed recently — worth checking in.` })
  }

  // Top performer (only call out if it's clearly a standout)
  const sorted = [...exec.agents].sort((a, b) => b.tasks.complete - a.tasks.complete)
  const top    = sorted[0]
  if (top && top.tasks.complete >= 5 && top.tasks.successRate >= 90) {
    out.push({ tone: 'positive', icon: <Star size={11} />, text: `${top.name} is on fire — ${top.tasks.complete} done at ${top.tasks.successRate}% success.` })
  }

  // Struggling agent (enough volume to be meaningful)
  const struggling = exec.agents.find((a) => a.tasks.total >= 5 && a.tasks.successRate < 60)
  if (struggling) {
    out.push({ tone: 'warning', icon: <AlertCircle size={11} />, text: `${struggling.name}'s success rate dropped to ${struggling.tasks.successRate}%.` })
  }

  return out
}

/**
 * Render an agent's status as a single in-character sentence — the kind of
 * thing they'd actually say at a standup. Picks a template based on what's
 * happening in their queue (approvals waiting → failures → in-flight → done
 * → idle). No LLM call; deterministic from the AgentStats shape.
 */
function agentVoiceLine(agent: AgentStats): string {
  const { complete, failed, inProgress, needsApproval, total } = agent.tasks

  // Priority 1: needs your decision (highest-leverage to surface)
  if (needsApproval > 0) {
    const prefix = complete > 0 ? `I tackled ${complete} of ${total}. ` : ''
    const verb   = needsApproval === 1 ? 'still needs your call' : 'still need your call'
    return `${prefix}${needsApproval} ${verb}.`
  }

  // Priority 2: failures — honesty over polish
  if (failed > 0) {
    if (complete > 0) {
      const word = complete === 1 ? 'thing' : 'things'
      return `Closed ${complete} ${word}, but ${failed} ran into trouble — flagged for you.`
    }
    return `${failed} ${failed === 1 ? 'task' : 'tasks'} ran into trouble — flagged for you.`
  }

  // Priority 3: actively working
  if (inProgress > 0) {
    const word = inProgress === 1 ? 'thing' : 'things'
    const done = complete > 0 ? `${complete} done already. ` : ''
    return `${done}Working through ${inProgress} ${word} right now.`
  }

  // Priority 4: done and dusted
  if (complete > 0) {
    const word = complete === 1 ? 'thing' : 'things'
    return `Got ${complete} ${word} done. Ready for more.`
  }

  // Idle
  return 'Quiet day so far — ready when you need me.'
}

function actionIcon(action: string) {
  const a = action.toLowerCase()
  if (a.includes('email') || a.includes('mail'))                              return <Mail       size={11} className="text-blue-400" />
  if (a.includes('payment') || a.includes('charge') || a.includes('stripe')) return <CreditCard size={11} className="text-purple-400" />
  if (a.includes('post') || a.includes('publish') || a.includes('social'))   return <Globe      size={11} className="text-cyan-400" />
  return <FileText size={11} className="text-[#8892b0]" />
}
const ROLE_LABEL: Record<string, string> = {
  EXEC_ASSISTANT: 'Executive Assistant', CONTENT_WRITER: 'Content Writer',
  RESEARCH_ANALYST: 'Research Analyst',  FINANCIAL_ANALYST: 'Financial Analyst',
  SALES_PROSPECTOR: 'Sales Prospector',  MARKETING_STRATEGIST: 'Marketing',
  CUSTOMER_SUPPORT: 'Support',           DATA_ANALYST: 'Data Analyst',
  OPS_COORDINATOR: 'Operations',         HR_MANAGER: 'HR Manager',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentPerformanceCard({ agent }: { agent: AgentStats }) {
  const total    = agent.tasks.complete + agent.tasks.failed
  const pct      = total > 0 ? (agent.tasks.complete / total) * 100 : 0
  const barColor = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  const pctColor = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : total === 0 ? 'text-white/25' : 'text-red-400'
  const isWorking = agent.status === 'WORKING'
  return (
    <div className={cn(
      'flex flex-col gap-2.5 rounded-xl p-3 border transition-colors',
      isWorking ? 'border-amber-400/20 bg-amber-400/[0.03]' : 'border-white/[0.05] bg-white/[0.015]',
    )}>
      {/* Avatar + name row */}
      <div className="flex items-center gap-2 min-w-0">
        <img src={agent.avatarUrl} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white/85 text-xs font-semibold truncate leading-tight">{agent.name}</p>
          <p className="text-[#8892b0] text-[10px] truncate leading-tight">{ROLE_LABEL[agent.role] ?? agent.role}</p>
        </div>
      </div>
      {/* Status pill */}
      <span className={cn(
        'self-start text-[8px] font-semibold px-1.5 py-0.5 rounded-full border',
        isWorking               ? 'bg-amber-400/15 text-amber-400 border-amber-400/25'     :
        agent.status === 'IDLE' ? 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25' :
        'bg-white/5 text-white/30 border-white/10'
      )}>
        {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
      </span>
      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn('text-[9px] font-bold tabular-nums shrink-0 w-6 text-right', pctColor)}>
          {total === 0 ? '—' : `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  )
}

function MiniBar({ stats, mode }: { stats: DailyStat[]; mode: 'count' | 'cost' }) {
  const max = Math.max(...stats.map((s) => mode === 'count' ? s.count : s.costUsd), 1)
  return (
    <div className="flex items-end gap-1 h-12">
      {stats.map((s) => {
        const val = mode === 'count' ? s.count : s.costUsd
        return (
          <div key={s.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-sm bg-[#4d7fff]/40 group-hover:bg-[#4d7fff]/70 transition-colors"
              style={{ height: `${Math.max((val / max) * 44, 2)}px` }}
            />
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-50 pointer-events-none">
              <div className="bg-[#0d1117] border border-white/10 rounded px-1.5 py-1 whitespace-nowrap">
                <p className="text-white text-[9px] font-medium">
                  {mode === 'count' ? `${s.count} tasks` : `$${s.costUsd.toFixed(3)}`}
                </p>
              </div>
            </div>
            <span className="text-[8px] text-[#8892b0]">
              {new Date(s.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'narrow' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ConfidenceBar({ dist }: { dist: AnalyticsSummary['confidenceDist'] }) {
  const total = dist.HIGH + dist.MEDIUM + dist.LOW || 1
  const pct = (n: number) => Math.round((n / total) * 100)
  const bands = [
    { key: 'HIGH'   as const, color: 'text-emerald-400', bar: 'bg-emerald-400' },
    { key: 'MEDIUM' as const, color: 'text-amber-400',   bar: 'bg-amber-400'   },
    { key: 'LOW'    as const, color: 'text-red-400',      bar: 'bg-red-400'     },
  ]
  return (
    <div className="space-y-1.5">
      {bands.map(({ key, color, bar }) => (
        <div key={key} className="flex items-center gap-2">
          <span className={cn('text-[10px] w-12 shrink-0', color)}>{key}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct(dist[key])}%` }} />
          </div>
          <span className="text-[10px] text-[#8892b0] w-5 text-right">{dist[key]}</span>
        </div>
      ))}
    </div>
  )
}

// ── Task status metadata ──────────────────────────────────────────────────────
const TASK_STATUS: Record<string, { label: string; dot: string; pill: string; icon: React.ReactNode }> = {
  COMPLETE:       { label: 'Complete',       dot: 'bg-emerald-400', pill: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',   icon: <CheckCircle2 size={10} /> },
  FAILED:         { label: 'Failed',         dot: 'bg-red-400',     pill: 'bg-red-400/10 text-red-400 border-red-400/20',               icon: <XCircle size={10} /> },
  IN_PROGRESS:    { label: 'In Progress',    dot: 'bg-amber-400',   pill: 'bg-amber-400/10 text-amber-400 border-amber-400/20',         icon: <Loader2 size={10} className="animate-spin" /> },
  NEEDS_APPROVAL: { label: 'Needs Approval', dot: 'bg-blue-400',    pill: 'bg-blue-400/10 text-blue-400 border-blue-400/20',            icon: <AlertTriangle size={10} /> },
  PENDING:        { label: 'Pending',        dot: 'bg-white/30',    pill: 'bg-white/5 text-white/40 border-white/10',                   icon: <Clock size={10} /> },
  CANCELLED:      { label: 'Cancelled',      dot: 'bg-white/15',    pill: 'bg-white/5 text-white/25 border-white/10',                   icon: <Ban size={10} /> },
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CeoLayerPage() {
  const router       = useRouter()
  const { getToken } = useAuth()
  const tasks        = useAgentsStore((s) => s.tasks)
  const agents       = useAgentsStore((s) => s.agents)
  const openScheduler = useAgentsStore((s) => s.openScheduler)
  const [data,      setData]      = useState<Summary | null>(null)
  const [exec,      setExec]      = useState<ExecData | null>(null)
  const [roi,       setRoi]       = useState<RoiData | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [pipeline,  setPipeline]  = useState<PipelinePost[] | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [chartMode,        setChartMode]        = useState<'count' | 'cost'>('count')
  const [taskFilter,       setTaskFilter]       = useState<string>('ALL')
  const [activityFrom,     setActivityFrom]     = useState<string>(new Date().toISOString().slice(0, 10))
  const [activityTo,       setActivityTo]       = useState<string>(new Date().toISOString().slice(0, 10))
  const [activityStatus,   setActivityStatus]   = useState<string>('ALL')
  const [timeWindow,       setTimeWindow]       = useState<'today' | 'week' | 'month'>('today')

  // Selecting a window jumps the activity feed dates. The feed's own preset
  // buttons + date inputs can still override for custom ranges.
  useEffect(() => {
    const today  = new Date().toISOString().slice(0, 10)
    const past7  = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10)
    const past30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    if (timeWindow === 'today') { setActivityFrom(today);  setActivityTo(today) }
    if (timeWindow === 'week')  { setActivityFrom(past7);  setActivityTo(today) }
    if (timeWindow === 'month') { setActivityFrom(past30); setActivityTo(today) }
  }, [timeWindow])

  const load = useCallback(async () => {
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    const base = process.env.NEXT_PUBLIC_API_URL
    const [summaryRes, execRes, roiRes, analyticsRes, pipelineRes] = await Promise.all([
      fetch(`${base}/api/ceo-layer/summary`,   { headers }),
      fetch(`${base}/api/analytics/executive`, { headers }),
      fetch(`${base}/api/roi/summary`,         { headers }),
      fetch(`${base}/api/analytics/summary`,   { headers }),
      fetch(`${base}/api/content/posts`,       { headers }),
    ])
    if (summaryRes.ok)   setData(await summaryRes.json())
    if (execRes.ok)      setExec(await execRes.json())
    if (roiRes.ok)       { const d = await roiRes.json();       if (d.data)    setRoi(d.data) }
    if (analyticsRes.ok) { const d = await analyticsRes.json(); if (d.summary) setAnalytics(d.summary) }
    if (pipelineRes.ok)  { const d = await pipelineRes.json();  if (d.posts)   setPipeline(d.posts) }
    setLastFetch(new Date())
    setLoading(false)
  }, [getToken])

  useEffect(() => { load() }, [load])

  const [bulkActing,  setBulkActing]  = useState<'APPROVED' | 'CANCELLED' | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)

  async function decide(taskId: string, decision: 'APPROVED' | 'CANCELLED') {
    setActing(taskId)
    const token = await getToken()
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/approvals/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: decision }),
    })
    await load()
    setActing(null)
  }

  async function bulkDecide(decision: 'APPROVED' | 'CANCELLED') {
    const items = data?.pendingApprovals ?? []
    if (items.length === 0) return
    if (decision === 'CANCELLED' && !window.confirm(`Reject all ${items.length} pending decisions?`)) return
    setBulkActing(decision)
    const token = await getToken()
    const base  = process.env.NEXT_PUBLIC_API_URL
    await Promise.all(items.map((item) => fetch(`${base}/api/approvals/${item.id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: decision }),
    })))
    await load()
    setBulkActing(null)
    setSelectedIdx(-1)
  }

  // Keyboard shortcuts — j/k navigate, a approve, r reject, Shift+A approve all.
  // Skipped when an input/textarea/contenteditable has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el  = document.activeElement as HTMLElement | null
      const tag = (el?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return

      const items = data?.pendingApprovals ?? []
      if (items.length === 0) return

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(items.length - 1, Math.max(0, i + 1)))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => (i <= 0 ? 0 : i - 1))
      } else if (e.key === 'A' && e.shiftKey) {
        e.preventDefault()
        bulkDecide('APPROVED')
      } else if ((e.key === 'a' || e.key === 'Enter') && !e.shiftKey && selectedIdx >= 0) {
        e.preventDefault()
        decide(items[selectedIdx].id, 'APPROVED')
      } else if (e.key === 'r' && selectedIdx >= 0) {
        e.preventDefault()
        decide(items[selectedIdx].id, 'CANCELLED')
      } else if (e.key === 'Escape') {
        setSelectedIdx(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedIdx])

  // Reset selection when the queue empties or reshuffles
  useEffect(() => {
    const len = data?.pendingApprovals.length ?? 0
    if (selectedIdx >= len) setSelectedIdx(len - 1)
  }, [data, selectedIdx])

  const ov           = exec?.overview
  const execAgents   = exec?.agents ?? []
  const alerts       = [...(exec?.pendingActions ?? []), ...(exec?.recentFailed ?? [])]
  const lastUpdated   = lastFetch ? `${Math.floor((Date.now() - lastFetch.getTime()) / 1000)}s ago` : null

  // Anomaly callouts — recomputed whenever analytics or exec change.
  const anomalies = detectAnomalies(analytics, exec)

  // ── Hero state: what *you* need to attend to right now ─────────────────────
  const pendingCount      = data?.pendingCount ?? 0
  const pendingAgentNames = Array.from(new Set((data?.pendingApprovals ?? []).map((a) => a.agentName)))
  const approvalQueueRef  = useRef<HTMLDivElement>(null)
  function focusApprovals() {
    approvalQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Tiny flash so the user sees where we landed them
    const el = approvalQueueRef.current
    if (el) {
      el.classList.add('ring-2', 'ring-amber-400/60', 'transition-shadow')
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400/60'), 900)
    }
  }
  function namesPhrase(names: string[]) {
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  }

  return (
    <div className="min-h-screen bg-[#080b14] text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.05] bg-[#080b14] shrink-0">
        <div className="px-6 h-14 flex items-center gap-4">
          <button onClick={() => router.push('/office')} className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition-colors text-sm">
            <ArrowLeft size={14} /> Office
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/25 to-orange-500/5 border border-amber-400/25 flex items-center justify-center shadow-lg shadow-amber-400/10">
              <Shield size={14} className="text-amber-400" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">CEO Control Center</span>
            {data && data.pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-[#080b14] text-[10px] font-black animate-pulse">
                {data.pendingCount}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {lastUpdated && <span className="text-white/20 text-[10px]">{lastUpdated}</span>}
            <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all disabled:opacity-30">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="flex items-center gap-1.5 text-[#8892b0] text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI does the work. You keep control.
            </div>
          </div>
        </div>

      </header>

      {/* ── Hero — the only number that matters when you open this page ── */}
      {!loading && (
        <section
          onClick={pendingCount > 0 ? focusApprovals : undefined}
          className={cn(
            'shrink-0 px-6 py-6 border-b border-white/[0.05] transition-colors',
            pendingCount > 0
              ? 'bg-gradient-to-b from-amber-400/[0.06] to-transparent cursor-pointer hover:from-amber-400/[0.09]'
              : 'bg-gradient-to-b from-emerald-400/[0.04] to-transparent',
          )}
        >
          <div className="max-w-5xl">
            {pendingCount > 0 ? (
              <>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-white antialiased">
                  <span className="text-amber-400 tabular-nums">{pendingCount}</span>{' '}
                  {pendingCount === 1 ? 'decision' : 'decisions'} waiting for you.
                </h1>
                <p className="text-white/55 text-sm mt-2 leading-relaxed">
                  {pendingAgentNames.length > 0 ? (
                    <>
                      <span className="text-white/80">{namesPhrase(pendingAgentNames)}</span>{' '}
                      {pendingAgentNames.length === 1 ? 'needs' : 'need'} your call.
                    </>
                  ) : 'Tap to review the queue.'}{' '}
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium hover:underline">
                    Review now <ChevronRight size={13} />
                  </span>
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-white antialiased">
                  <span className="text-emerald-400">All clear.</span> Nothing waiting for you.
                </h1>
                <p className="text-white/45 text-sm mt-2 leading-relaxed">
                  Your team is running clean. Scroll down for what they got done.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Team briefing — each agent's status in their own voice ─────── */}
      {!loading && (exec?.agents.length ?? 0) > 0 && (
        <section className="shrink-0 px-6 py-5 border-b border-white/[0.05] bg-[#080b14]">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3">
            Team briefing
          </p>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {exec!.agents.map((agent) => (
              <div
                key={agent.id}
                className="min-w-[280px] max-w-[320px] flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 shrink-0"
              >
                <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10">
                  {agent.avatarUrl
                    ? <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/[0.04] flex items-center justify-center text-white/40 text-sm font-bold">{agent.name[0]}</div>}
                  <span className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#080b14]',
                    agent.status === 'WORKING' ? 'bg-lamp-working' :
                    agent.status === 'BLOCKED' ? 'bg-lamp-blocked' :
                    agent.status === 'IDLE'    ? 'bg-lamp-idle' :
                    'bg-white/20',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-white text-[12px] font-semibold leading-tight truncate">{agent.name}</p>
                    <p className="text-white/40 text-[9px] truncate">{ROLE_LABEL[agent.role] ?? agent.role}</p>
                  </div>
                  <p className="text-white/75 text-[12px] leading-relaxed mt-2 italic">
                    “{agentVoiceLine(agent)}”
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── What changed — anomaly callouts ────────────────────────────── */}
      {!loading && anomalies.length > 0 && (
        <section className="shrink-0 px-6 py-4 border-b border-white/[0.05] bg-[#080b14]">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">What changed</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {anomalies.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border shrink-0 min-w-[300px] max-w-[440px]',
                  a.tone === 'positive' ? 'bg-emerald-400/[0.05] border-emerald-400/20' :
                  a.tone === 'warning'  ? 'bg-amber-400/[0.05] border-amber-400/20'  :
                                          'bg-white/[0.02] border-white/[0.07]',
                )}
              >
                <span className={cn(
                  'mt-0.5 shrink-0',
                  a.tone === 'positive' ? 'text-emerald-400' :
                  a.tone === 'warning'  ? 'text-amber-400'  :
                                          'text-white/40',
                )}>
                  {a.icon}
                </span>
                <p className={cn(
                  'text-[12px] leading-relaxed',
                  a.tone === 'positive' ? 'text-emerald-300/90' :
                  a.tone === 'warning'  ? 'text-amber-300/90'  :
                                          'text-white/75',
                )}>
                  {a.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Time window tabs — scopes the activity feed; other dashboards
            keep their own windows (labelled in-place). ───────────────────── */}
      {!loading && (
        <div className="shrink-0 px-6 pt-4 pb-2 flex items-center gap-1.5 bg-[#080b14]">
          <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mr-2">Show</span>
          {([
            { id: 'today', label: 'Today' },
            { id: 'week',  label: 'This Week' },
            { id: 'month', label: 'This Month' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTimeWindow(t.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors border',
                timeWindow === t.id
                  ? 'bg-white/[0.08] text-white border-white/15'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04] border-transparent',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-[#4d7fff]/20 border-t-[#4d7fff] animate-spin" />
            <p className="text-[#8892b0] text-sm">Loading control center…</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-5 flex gap-4 overflow-hidden">

          {/* ── Panel 1: Decisions + Money & Impact ─────────────────── */}
          <div className="w-[32%] flex flex-col gap-4">
          <SectionBanner n={1} label="Decisions" subtitle="Your sign-off pipeline" tone="amber" />
          <div ref={approvalQueueRef} className="h-[12cm] flex flex-col rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30 scroll-mt-6">
            <div className="px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                  <Clock size={13} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    Pending Approvals
                    {(data?.pendingCount ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/25 text-amber-400 text-[10px] font-bold">{data!.pendingCount}</span>
                    )}
                  </h2>
                  <p className="text-[#8892b0] text-[11px] mt-0.5">
                    {(data?.pendingCount ?? 0) > 0
                      ? `${data!.pendingCount} action${data!.pendingCount > 1 ? 's' : ''} waiting`
                      : 'All clear — queue empty'}
                  </p>
                </div>
              </div>
              {(data?.pendingCount ?? 0) > 1 && (
                <div className="mt-3 border-t border-white/[0.04] pt-3 flex items-center gap-2">
                  <button
                    onClick={() => bulkDecide('APPROVED')}
                    disabled={!!bulkActing}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {bulkActing === 'APPROVED'
                      ? <span className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                      : <CheckCheck size={11} />}
                    Approve all ({data!.pendingCount})
                  </button>
                  <button
                    onClick={() => bulkDecide('CANCELLED')}
                    disabled={!!bulkActing}
                    className="py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-white/40 text-[11px] font-semibold hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    title="Reject all (asks first)"
                  >
                    <Ban size={11} /> Reject all
                  </button>
                </div>
              )}
              <p className="mt-2.5 text-[10px] text-white/30 leading-relaxed">
                <kbd className="font-mono">j/k</kbd> navigate · <kbd className="font-mono">a</kbd> approve · <kbd className="font-mono">r</kbd> reject · <kbd className="font-mono">⇧A</kbd> approve all
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!data?.pendingApprovals.length ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-400/8 border border-emerald-400/15 flex items-center justify-center">
                    <CheckCircle2 size={28} className="text-emerald-400/50" />
                  </div>
                  <div>
                    <p className="text-white/50 text-sm font-medium">Queue is empty</p>
                    <p className="text-white/20 text-xs mt-1 leading-relaxed">Agents running within approved limits</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {data.pendingApprovals.map((item, idx) => {
                    const expiring   = item.expiresAt && new Date(item.expiresAt) < new Date(Date.now() + 3 * 60 * 60 * 1000)
                    const isSelected = selectedIdx === idx
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedIdx(idx)}
                        className={cn(
                          'rounded-xl border p-4 space-y-3 transition-all cursor-pointer',
                          isSelected
                            ? 'border-amber-400/60 bg-amber-400/[0.06] shadow-lg shadow-amber-400/10 ring-1 ring-amber-400/30'
                            : expiring
                            ? 'border-amber-400/25 bg-amber-400/[0.03] hover:border-amber-400/40'
                            : 'border-white/[0.07] bg-white/[0.015] hover:border-white/[0.12]',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
                            {item.agentAvatar
                              ? <img src={item.agentAvatar} alt={item.agentName} className="w-full h-full object-cover" />
                              : <span className="text-sm font-bold text-white/40">{item.agentName[0]}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-[13px] font-semibold leading-tight">{item.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[#8892b0] text-[10px]">{item.agentName}</span>
                              <span className="text-white/15">·</span>
                              <span className="text-[#8892b0] text-[10px]">{timeAgo(item.createdAt)}</span>
                            </div>
                          </div>
                          {expiring && item.expiresAt && (
                            <div className="flex items-center gap-1 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-0.5 shrink-0">
                              <Clock size={9} className="text-amber-400" />
                              <span className="text-amber-400 text-[10px] font-semibold">{timeLeft(item.expiresAt)}</span>
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg bg-white/[0.025] border border-white/[0.05] p-3 space-y-2">
                          <div className="flex items-center gap-1.5">
                            {actionIcon(item.action)}
                            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">{item.action}</p>
                          </div>
                          {item.preview && (
                            <p className="text-white/85 text-[12px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollbar-none">
                              {item.preview}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => decide(item.id, 'APPROVED')}
                            disabled={acting === item.id}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/40 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            {acting === item.id ? <span className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" /> : <CheckCircle2 size={12} />}
                            Approve
                          </button>
                          <button
                            onClick={() => decide(item.id, 'CANCELLED')}
                            disabled={acting === item.id}
                            className="flex-1 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] text-white/40 text-xs font-semibold hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

            <SectionBanner n={4} label="Money & Impact" subtitle="What you got, what it cost" tone="emerald" />

            {/* ROI & Impact */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
                  <Target size={13} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-white">ROI & Impact</h2>
                  <p className="text-[#8892b0] text-[11px] mt-0.5">Real metrics — tasks delegated and time saved</p>
                </div>
                <span className="text-[10px] text-emerald-400/70 font-medium">Live</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: <Clock size={12} />,      label: 'Hours delegated (30d)', value: roi ? `${(roi.totalMinutesSaved / 60).toFixed(1)}h` : '—', color: 'text-blue-400',    bg: 'bg-blue-400/8 border-blue-400/15'       },
                    { icon: <Zap size={12} />,        label: 'Tasks completed',       value: roi ? String(roi.tasksCompleted30d) : '—',                  color: 'text-amber-400',   bg: 'bg-amber-400/8 border-amber-400/15'     },
                    { icon: <TrendingUp size={12} />, label: 'Success rate',          value: roi ? `${roi.successRate}%` : '—',                          color: 'text-[#4d7fff]',   bg: 'bg-[#4d7fff]/8 border-[#4d7fff]/15'    },
                    { icon: <Target size={12} />,     label: 'Content pieces',        value: roi ? String(roi.contentPieces) : '—',                      color: 'text-emerald-400', bg: 'bg-emerald-400/8 border-emerald-400/15' },
                  ].map(({ icon, label, value, color, bg }) => (
                    <div key={label} className={cn('rounded-xl border px-3 py-2.5', bg)}>
                      <span className={cn('mb-1.5 block', color)}>{icon}</span>
                      <p className={cn('text-base font-bold tabular-nums leading-none', color)}>{value}</p>
                      <p className="text-[9px] text-[#8892b0] mt-1 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-[#8892b0] uppercase tracking-widest">Agent success rate</p>
                    {roi && (
                      <span className={cn('text-xs font-bold', roi.successRate >= 80 ? 'text-emerald-400' : roi.successRate >= 60 ? 'text-amber-400' : 'text-red-400')}>
                        {roi.successRate}%
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    {roi && (
                      <div
                        className={cn('h-full rounded-full', roi.successRate >= 80 ? 'bg-emerald-400' : roi.successRate >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                        style={{ width: `${roi.successRate}%` }}
                      />
                    )}
                  </div>
                </div>
                {!roi && (
                  <p className="text-[10px] text-[#8892b0] text-center leading-relaxed py-1">
                    Real metrics coming — tracking tasks delegated and time saved.
                  </p>
                )}
              </div>
            </div>

            {/* Office Analytics */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#4d7fff]/10 border border-[#4d7fff]/20 flex items-center justify-center shrink-0">
                  <BarChart2 size={13} className="text-[#4d7fff]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Office Analytics</h2>
                  <p className="text-[#8892b0] text-[11px] mt-0.5">30-day workspace performance</p>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {!analytics ? (
                  <p className="text-[10px] text-[#8892b0] text-center py-3 italic">Loading analytics…</p>
                ) : (
                  <>
                    {(() => {
                      const totalRatings = (analytics.positiveRatings ?? 0) + (analytics.negativeRatings ?? 0)
                      const satPct = totalRatings > 0 ? Math.round((analytics.positiveRatings / totalRatings) * 100) : null
                      return (
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { icon: <CheckCheck size={12} />, label: 'Completed (30d)', value: String(analytics.complete30d),  sub: `${analytics.successRate}% success`, color: 'text-emerald-400' },
                            { icon: <Activity size={12} />,   label: 'Today',           value: String(analytics.todayComplete), sub: 'tasks done',                        color: 'text-[#4d7fff]'   },
                            { icon: <DollarSign size={12} />, label: 'Avg cost / task',
                              value: analytics.avgCostUsd > 0 ? `$${analytics.avgCostUsd.toFixed(3)}` : '—',
                              sub: `$${analytics.totalCostUsd.toFixed(3)} total`, color: 'text-[#8892b0]' },
                            satPct !== null
                              ? { icon: <ThumbsUp size={12} />, label: 'Satisfaction', value: `${satPct}%`, sub: `${totalRatings} rated`, color: satPct >= 70 ? 'text-emerald-400' : 'text-amber-400' }
                              : { icon: <Zap size={12} />,      label: 'Total tasks',  value: String(analytics.total30d), sub: 'last 30 days', color: 'text-[#8892b0]' },
                          ].map(({ icon, label, value, sub, color }) => (
                            <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 flex items-start gap-2">
                              <span className={cn('mt-0.5 shrink-0', color)}>{icon}</span>
                              <div className="min-w-0">
                                <p className="text-white text-sm font-semibold leading-tight">{value}</p>
                                <p className="text-[#8892b0] text-[10px] truncate">{label}</p>
                                {sub && <p className={cn('text-[10px] mt-0.5', color)}>{sub}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    {analytics.xp && (
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-xl border border-[#4d7fff]/20 bg-[#4d7fff]/[0.04] px-3 py-2 flex items-center gap-2">
                          <Star size={11} className="text-[#4d7fff] shrink-0" />
                          <div>
                            <p className="text-white text-xs font-semibold">Lv {analytics.xp.level}</p>
                            <p className="text-[#8892b0] text-[9px]">{analytics.xp.totalXp.toLocaleString()} XP</p>
                          </div>
                        </div>
                        <div className="flex-1 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 flex items-center gap-2">
                          <Flame size={11} className="text-amber-400 shrink-0" />
                          <div>
                            <p className="text-white text-xs font-semibold">{analytics.xp.streakDays}d streak</p>
                            <p className="text-[#8892b0] text-[9px]">daily activity</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {analytics.dailyVolume.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] text-[#8892b0] uppercase tracking-widest">Last 7 days</p>
                          <div className="flex gap-1">
                            {(['count', 'cost'] as const).map((m) => (
                              <button key={m} onClick={() => setChartMode(m)}
                                className={cn('px-2 py-0.5 rounded text-[9px] transition-colors', chartMode === m ? 'bg-[#4d7fff]/20 text-[#4d7fff]' : 'text-[#8892b0] hover:text-white')}>
                                {m === 'count' ? 'Tasks' : 'Cost'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <MiniBar stats={analytics.dailyVolume} mode={chartMode} />
                      </div>
                    )}
                    {analytics.workflows.total30d > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <GitBranch size={11} className="text-[#8892b0]" />
                          <p className="text-[10px] text-[#8892b0] uppercase tracking-widest">Workflows (30d)</p>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { label: 'Ran',      value: analytics.workflows.total30d,         color: 'text-white'        },
                            { label: 'Complete', value: analytics.workflows.complete30d,       color: 'text-emerald-400'  },
                            { label: 'Success',  value: `${analytics.workflows.successRate}%`, color: 'text-[#4d7fff]'   },
                          ].map((s) => (
                            <div key={s.label} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-center">
                              <p className={cn('text-xs font-semibold', s.color)}>{s.value}</p>
                              <p className="text-[#8892b0] text-[9px]">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {analytics.topCommands.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Terminal size={11} className="text-[#8892b0]" />
                          <p className="text-[10px] text-[#8892b0] uppercase tracking-widest">Top commands</p>
                        </div>
                        <div className="space-y-1">
                          {analytics.topCommands.map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[#8892b0] text-[10px] w-3 shrink-0">{i + 1}</span>
                              <span className="text-white text-xs flex-1 truncate">{c.title}</span>
                              <span className="text-[#8892b0] text-[10px] shrink-0">{c.runCount}×</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-[#8892b0] uppercase tracking-widest mb-2">Confidence distribution</p>
                      <ConfidenceBar dist={analytics.confidenceDist} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Panel 2: Today's Narrative (Activity Feed) ──────────── */}
          <div className="w-[30%] flex flex-col gap-2">
          <SectionBanner n={2} label="Today's narrative" subtitle="What happened, in order" tone="blue" />
          {(() => {
            const today = new Date().toISOString().slice(0, 10)
            const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
            const isToday = activityFrom === today && activityTo === today

            const PRESETS = [
              { label: 'Today',   from: today,       to: today       },
              { label: '7d',      from: daysAgo(6),  to: today       },
              { label: '30d',     from: daysAgo(29), to: today       },
              { label: 'Month',   from: today.slice(0,8) + '01', to: today },
            ]

            const allActivity = data?.recentActivity ?? []

            const filtered = allActivity.filter((item) => {
              const d = item.completedAt.slice(0, 10)
              return d >= activityFrom && d <= activityTo &&
                (activityStatus === 'ALL' || item.status === activityStatus)
            })

            const completeCount = filtered.filter(i => i.status === 'COMPLETE').length
            const failedCount   = filtered.filter(i => i.status === 'FAILED').length

            const rangeLabel = activityFrom === activityTo
              ? (isToday ? 'Today' : activityFrom)
              : `${activityFrom} → ${activityTo}`

            return (
              <div className="h-[12cm] flex flex-col rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">

                {/* Header */}
                <div className="px-4 pt-4 pb-0 shrink-0 space-y-3">

                  {/* Title row */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#4d7fff]/10 border border-[#4d7fff]/20 flex items-center justify-center shrink-0">
                      <Activity size={13} className="text-[#4d7fff]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
                      <p className="text-[#8892b0] text-[11px]">{rangeLabel} · {filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {/* Quick-range presets */}
                  <div className="flex gap-1.5">
                    {PRESETS.map((p) => {
                      const active = activityFrom === p.from && activityTo === p.to
                      return (
                        <button
                          key={p.label}
                          onClick={() => { setActivityFrom(p.from); setActivityTo(p.to) }}
                          className={cn(
                            'flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors',
                            active
                              ? 'bg-[#4d7fff]/15 text-[#4d7fff] border-[#4d7fff]/25'
                              : 'bg-transparent text-[#8892b0] border-white/[0.07] hover:text-white hover:border-white/15'
                          )}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Date range inputs */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={activityFrom}
                      max={activityTo}
                      onChange={(e) => setActivityFrom(e.target.value)}
                      className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-[#8892b0] focus:outline-none focus:border-[#4d7fff]/40 focus:text-white transition-colors cursor-pointer [color-scheme:dark]"
                    />
                    <span className="text-white/20 text-[10px] shrink-0">→</span>
                    <input
                      type="date"
                      value={activityTo}
                      min={activityFrom}
                      max={today}
                      onChange={(e) => setActivityTo(e.target.value)}
                      className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-[#8892b0] focus:outline-none focus:border-[#4d7fff]/40 focus:text-white transition-colors cursor-pointer [color-scheme:dark]"
                    />
                  </div>

                  {/* Status filter pills */}
                  <div className="flex gap-1.5 pb-3 border-b border-white/[0.06]">
                    {([
                      { key: 'ALL',       label: 'All'       },
                      { key: 'COMPLETE',  label: 'Complete'  },
                      { key: 'FAILED',    label: 'Failed'    },
                      { key: 'CANCELLED', label: 'Cancelled' },
                    ] as const).map(({ key, label }) => {
                      const count = key === 'ALL'
                        ? allActivity.filter(i => i.completedAt.slice(0,10) >= activityFrom && i.completedAt.slice(0,10) <= activityTo).length
                        : allActivity.filter(i => i.completedAt.slice(0,10) >= activityFrom && i.completedAt.slice(0,10) <= activityTo && i.status === key).length
                      if (count === 0 && key !== 'ALL') return null
                      return (
                        <button
                          key={key}
                          onClick={() => setActivityStatus(key)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors',
                            activityStatus === key
                              ? key === 'COMPLETE'  ? 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25'
                              : key === 'FAILED'    ? 'bg-red-400/15 text-red-400 border-red-400/25'
                              : key === 'CANCELLED' ? 'bg-white/10 text-white/50 border-white/15'
                              : 'bg-white/10 text-white border-white/20'
                              : 'bg-transparent text-[#8892b0] border-white/[0.07] hover:text-white'
                          )}
                        >
                          {label} {count > 0 && <span className="opacity-55">{count}</span>}
                        </button>
                      )
                    })}
                  </div>

                  {/* Summary bar */}
                  {filtered.length > 0 && (
                    <div className="flex items-center gap-3 pb-2">
                      {completeCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <CheckCircle2 size={10} /> {completeCount} done
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-red-400">
                          <XCircle size={10} /> {failedCount} failed
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                        <AlertCircle size={20} className="text-white/10" />
                      </div>
                      <div>
                        <p className="text-white/35 text-xs font-medium">No activity</p>
                        <p className="text-white/15 text-[10px] mt-0.5">Try a different date range or status filter</p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 space-y-0.5">
                      {filtered.map((item) => {
                        const statusTint =
                          item.status === 'COMPLETE'  ? 'text-emerald-400/70' :
                          item.status === 'FAILED'    ? 'text-red-400/80' :
                          'text-white/25'
                        return (
                          <div key={item.id} className="group flex items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.025] transition-colors">
                            <span className="text-white/30 text-[10px] font-mono tabular-nums shrink-0 w-[58px]">
                              {formatClockTime(item.completedAt)}
                            </span>
                            <p className="flex-1 text-[12px] leading-relaxed text-white/65">
                              <span className="text-white font-semibold">{item.agentName}</span>{' '}
                              <span className={statusTint}>{narrativeVerb(item)}</span>{' '}
                              <span className="text-white/80">{item.title}</span>
                              {item.costUsd != null && item.costUsd > 0 && (
                                <span className="text-white/25 text-[10px] ml-1.5 tabular-nums">({`$${item.costUsd.toFixed(3)}`})</span>
                              )}
                              {item.status === 'FAILED' && (
                                <span className="text-red-400/70 text-[10px] ml-1.5 font-medium">— flagged</span>
                              )}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          </div>

          {/* ── Panel 3: Team Status + Guardrails ───────────────────── */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">

            <SectionBanner n={3} label="Team status" subtitle="Where each agent is" tone="blue" />

            {/* Task Overview KPIs */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#4d7fff]/10 border border-[#4d7fff]/20 flex items-center justify-center shrink-0">
                  <TrendingUp size={13} className="text-[#4d7fff]" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-white">Task Intelligence</h2>
                  <p className="text-[#8892b0] text-[11px] mt-0.5">Across all agents</p>
                </div>
                {ov?.satisfactionRate != null && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ThumbsUp size={11} className="text-emerald-400" />
                    <span className="text-emerald-400 text-xs font-bold">{ov.satisfactionRate}% sat.</span>
                  </div>
                )}
              </div>
              <div className="p-4 grid grid-cols-3 gap-2">
                {[
                  { icon: <CheckCircle2 size={12} />, label: 'Done',    value: ov?.complete      ?? 0, color: 'text-emerald-400', bg: 'bg-emerald-400/8 border-emerald-400/15' },
                  { icon: <Activity     size={12} />, label: 'Active',  value: ov?.inProgress    ?? 0, color: 'text-blue-400',    bg: 'bg-blue-400/8 border-blue-400/15'       },
                  { icon: <AlertTriangle size={12}/>, label: 'Review',  value: ov?.needsApproval ?? 0, color: 'text-amber-400',   bg: 'bg-amber-400/8 border-amber-400/15'     },
                  { icon: <XCircle      size={12} />, label: 'Failed',  value: ov?.failed        ?? 0, color: 'text-red-400',     bg: 'bg-red-400/8 border-red-400/15'         },
                  { icon: <Clock        size={12} />, label: 'Pending', value: ov?.pending       ?? 0, color: 'text-white/40',    bg: 'bg-white/[0.03] border-white/[0.07]'    },
                  { icon: <TrendingUp   size={12} />, label: 'Success', value: ov ? `${ov.successRate}%` : '—', color: 'text-[#4d7fff]', bg: 'bg-[#4d7fff]/8 border-[#4d7fff]/15' },
                ].map(({ icon, label, value, color, bg }) => (
                  <div key={label} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5', bg)}>
                    <span className={cn('shrink-0', color)}>{icon}</span>
                    <div>
                      <p className={cn('text-sm font-bold tabular-nums leading-none', color)}>{value}</p>
                      <p className="text-white/25 text-[9px] mt-0.5 uppercase tracking-wide">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Task History */}
            {(() => {
              const filtered = taskFilter === 'ALL' ? tasks : tasks.filter((t) => t.status === taskFilter)
              const FILTERS = [
                { key: 'ALL',            label: 'All',        count: tasks.length },
                { key: 'IN_PROGRESS',    label: 'Active',     count: tasks.filter(t => t.status === 'IN_PROGRESS').length },
                { key: 'NEEDS_APPROVAL', label: 'Review',     count: tasks.filter(t => t.status === 'NEEDS_APPROVAL').length },
                { key: 'COMPLETE',       label: 'Done',       count: tasks.filter(t => t.status === 'COMPLETE').length },
                { key: 'FAILED',         label: 'Failed',     count: tasks.filter(t => t.status === 'FAILED').length },
              ]
              return (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
                  <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#4d7fff]/10 border border-[#4d7fff]/20 flex items-center justify-center shrink-0">
                      <ListChecks size={13} className="text-[#4d7fff]" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-sm font-semibold text-white">Task History</h2>
                      <p className="text-[#8892b0] text-[11px] mt-0.5">Live task pipeline across all agents</p>
                    </div>
                    {tasks.length > 0 && (
                      <span className="text-[10px] text-[#8892b0]">{tasks.length} total</span>
                    )}
                  </div>

                  {/* Filter pills */}
                  <div className="px-4 pt-3 pb-0 flex gap-1.5 flex-wrap">
                    {FILTERS.map(({ key, label, count }) => count > 0 || key === 'ALL' ? (
                      <button
                        key={key}
                        onClick={() => setTaskFilter(key)}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors',
                          taskFilter === key
                            ? key === 'IN_PROGRESS'    ? 'bg-amber-400/15 text-amber-400 border-amber-400/25'
                            : key === 'NEEDS_APPROVAL' ? 'bg-blue-400/15 text-blue-400 border-blue-400/25'
                            : key === 'COMPLETE'        ? 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25'
                            : key === 'FAILED'          ? 'bg-red-400/15 text-red-400 border-red-400/25'
                            : 'bg-white/10 text-white border-white/20'
                            : 'bg-transparent text-[#8892b0] border-white/[0.07] hover:text-white hover:border-white/15'
                        )}
                      >
                        {label}
                        {count > 0 && <span className="opacity-60">{count}</span>}
                      </button>
                    ) : null)}
                  </div>

                  {/* Task list */}
                  <div className="p-3 space-y-0 max-h-64 overflow-y-auto">
                    {tasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                        <ListChecks size={20} className="text-white/10" />
                        <p className="text-white/25 text-xs">No tasks yet</p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <p className="text-white/25 text-xs text-center py-4 italic">No {taskFilter.toLowerCase().replace('_', ' ')} tasks</p>
                    ) : (
                      filtered.slice(0, 25).map((task) => {
                        const meta = TASK_STATUS[task.status] ?? TASK_STATUS.PENDING
                        return (
                          <div key={task.id} className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-white/[0.025] transition-colors">
                            <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
                            <span className="flex-1 min-w-0 text-xs text-white/75 leading-relaxed line-clamp-1">
                              {task.title ?? 'Working…'}
                            </span>
                            <span className={cn('shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border', meta.pill)}>
                              {meta.icon}
                              {meta.label}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Status count footer */}
                  {tasks.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-white/[0.05] flex items-center gap-3 flex-wrap">
                      {(['IN_PROGRESS', 'NEEDS_APPROVAL', 'COMPLETE', 'FAILED', 'PENDING'] as const).map((s) => {
                        const count = tasks.filter((t) => t.status === s).length
                        if (!count) return null
                        const meta = TASK_STATUS[s]
                        return (
                          <span key={s} className="flex items-center gap-1 text-[10px]">
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                            <span className="text-[#8892b0]">{meta.label}</span>
                            <span className="text-white/60 font-medium">{count}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Agent Performance */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#4d7fff]/10 border border-[#4d7fff]/20 flex items-center justify-center shrink-0">
                  <Users size={13} className="text-[#4d7fff]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Agent Performance</h2>
                  <p className="text-[#8892b0] text-[11px] mt-0.5">Success rate · live status</p>
                </div>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2">
                {execAgents.length === 0 ? (
                  <p className="col-span-3 text-white/25 text-xs px-2 py-3 text-center italic">No agents yet</p>
                ) : execAgents.map((a) => <AgentPerformanceCard key={a.id} agent={a} />)}
              </div>
            </div>

            <SectionBanner n={5} label="Guardrails & alerts" subtitle="Safety, controls, pipeline" tone="amber" />

            {/* Content Pipeline */}
            {(() => {
              const now           = Date.now()
              const weekAgo       = now - 7 * 86400000
              const scheduledCt   = pipeline?.filter((p) => p.status === 'SCHEDULED').length ?? 0
              const publishedWeek = pipeline?.filter((p) => p.status === 'PUBLISHED' && p.publishedAt && new Date(p.publishedAt).getTime() >= weekAgo).length ?? 0
              const failedCt      = pipeline?.filter((p) => p.status === 'FAILED').length ?? 0
              const upcoming      = (pipeline ?? [])
                .filter((p) => p.status === 'SCHEDULED' && new Date(p.scheduledAt).getTime() >= now)
                .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                .slice(0, 3)
              const openAndGo = () => { openScheduler(null); router.push('/office') }
              return (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
                  <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-orange-400/10 border border-orange-400/20 flex items-center justify-center shrink-0">
                      <Calendar size={13} className="text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-sm font-semibold text-white">Content Pipeline</h2>
                      <p className="text-[#8892b0] text-[11px] mt-0.5">Office-wide scheduled posts</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-4 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-orange-400" />
                        <span className="text-orange-400 font-semibold tabular-nums">{scheduledCt}</span>
                        <span className="text-[#8892b0]">scheduled</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={10} className="text-emerald-400" />
                        <span className="text-emerald-400 font-semibold tabular-nums">{publishedWeek}</span>
                        <span className="text-[#8892b0]">published this week</span>
                      </div>
                      {failedCt > 0 && (
                        <div className="flex items-center gap-1.5">
                          <AlertCircle size={10} className="text-red-400" />
                          <span className="text-red-400 font-semibold tabular-nums">{failedCt}</span>
                          <span className="text-[#8892b0]">failed</span>
                        </div>
                      )}
                    </div>
                    {upcoming.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[9px] uppercase tracking-widest text-[#8892b0]">Next up</p>
                        {upcoming.map((p) => {
                          const agent = agents.find((a) => a.id === p.agentId)
                          const when  = new Date(p.scheduledAt).toLocaleString('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
                          return (
                            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2">
                              <span className="text-[10px] text-[#8892b0] tabular-nums shrink-0 w-20">{when}</span>
                              {agent && <span className="text-[10px] text-white/65 shrink-0">{agent.name}</span>}
                              <span className="text-[10px] text-[#8892b0] shrink-0">·</span>
                              <span className="text-[10px] text-[#8892b0] shrink-0">{p.platforms.slice(0, 2).join(', ')}{p.platforms.length > 2 ? '…' : ''}</span>
                              <span className="text-[10px] text-white/40 flex-1 truncate italic">"{p.content.slice(0, 40)}{p.content.length > 40 ? '…' : ''}"</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#8892b0] py-1 italic">No upcoming posts scheduled.</p>
                    )}
                    <button onClick={openAndGo} className="flex items-center gap-1 text-[11px] text-[#4d7fff] hover:text-[#6b96ff] transition-colors group">
                      View all scheduled <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="rounded-2xl border border-red-400/20 bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
                <div className="px-5 py-4 border-b border-red-400/15 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-red-400/10 border border-red-400/20 flex items-center justify-center shrink-0">
                    <AlertTriangle size={13} className="text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-white">Alerts</h2>
                    <p className="text-[#8892b0] text-[11px] mt-0.5">{alerts.length} item{alerts.length > 1 ? 's' : ''} need attention</p>
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  {(exec?.pendingActions ?? []).map((p) => (
                    <div key={p.taskId} className="flex items-start gap-2 rounded-xl bg-amber-400/[0.04] border border-amber-400/15 px-3 py-2.5">
                      <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-400 text-xs font-semibold truncate">{p.title}</p>
                        <p className="text-amber-400/50 text-[10px] mt-0.5">{p.agentName} · needs approval</p>
                      </div>
                    </div>
                  ))}
                  {(exec?.recentFailed ?? []).map((f) => (
                    <div key={f.taskId} className="flex items-start gap-2 rounded-xl bg-red-400/[0.04] border border-red-400/15 px-3 py-2.5">
                      <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-400 text-xs font-semibold truncate">{f.title}</p>
                        <p className="text-red-400/50 text-[10px] mt-0.5">{f.agentName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Control Rules */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden shadow-xl shadow-black/30">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h2 className="text-sm font-semibold text-white">Control Rules</h2>
                <p className="text-[#8892b0] text-[11px] mt-0.5">How your agents are governed</p>
              </div>
              <div className="p-4 space-y-3.5">
                {[
                  { label: 'Require approval before sending emails', sub: 'Human-in-the-loop',   on: true  },
                  { label: 'Notify on task completion',              sub: 'Push notification',    on: true  },
                  { label: 'Allow autonomous overnight runs',        sub: 'Runs while you sleep', on: false },
                  { label: 'Log all agent actions',                  sub: 'Full audit trail',     on: true  },
                ].map((rule) => (
                  <div key={rule.label} className="flex items-start gap-3">
                    <div className={cn('mt-0.5 shrink-0 w-9 h-5 rounded-full relative transition-colors', rule.on ? 'bg-[#4d7fff]' : 'bg-white/10')}>
                      <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform', rule.on ? 'translate-x-4' : 'translate-x-0.5')} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/60 text-xs leading-snug">{rule.label}</p>
                      <p className="text-white/25 text-[10px] mt-0.5">{rule.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CEO Control + Audit Log */}
            <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-400/[0.06] to-transparent p-4 shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-lg bg-amber-400/15 border border-amber-400/25 flex items-center justify-center">
                  <Shield size={11} className="text-amber-400" />
                </div>
                <span className="text-amber-400 text-xs font-bold">CEO Control</span>
              </div>
              <p className="text-white/40 text-[11px] leading-relaxed">Every AI action is reviewable before it executes. Nothing ships without your sign-off.</p>
              <button onClick={() => router.push('/office')} className="mt-3 flex items-center gap-1 text-[#4d7fff] text-xs hover:text-[#6b96ff] transition-colors group">
                Back to office <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] px-4 py-3 flex items-center justify-between group cursor-pointer hover:border-white/[0.12] hover:bg-white/[0.015] transition-all shadow-xl shadow-black/30">
              <div>
                <p className="text-white/55 text-xs font-semibold">Audit Log</p>
                <p className="text-white/20 text-[10px] mt-0.5">Signed export available</p>
              </div>
              <ChevronRight size={13} className="text-white/15 group-hover:text-white/35 group-hover:translate-x-0.5 transition-all" />
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
