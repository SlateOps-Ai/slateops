'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Target, Plus, Trash2, PlayCircle, Loader2, ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Lightbulb, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'

interface Objective {
  id: string
  title: string
  description?: string
  metric: string
  targetValue: number
  currentValue: number
  period: string
  dueAt: string
  isActive: boolean
}

interface Config {
  enabled: boolean
  briefTime: string
  lastBriefAt: string | null
}

interface BriefBullet {
  type: 'win' | 'priority' | 'risk' | 'strategy'
  text: string
}

interface Brief {
  headline: string
  bullets: BriefBullet[]
  date: string
}

const BULLET_META = {
  win:      { icon: <Trophy size={11} />,        color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  priority: { icon: <Target size={11} />,         color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
  risk:     { icon: <AlertTriangle size={11} />,  color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
  strategy: { icon: <Lightbulb size={11} />,      color: 'text-violet-400',  bg: 'bg-violet-400/10 border-violet-400/20' },
}

const METRICS = ['tasks_completed', 'content_published', 'clients_contacted', 'revenue_usd', 'research_done', 'custom']
const PERIODS = ['weekly', 'monthly', 'quarterly']

interface Props { onClose: () => void }

export function AutonomousModePanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const [config, setConfig] = useState<Config | null>(null)
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingBrief, setLoadingBrief] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [running, setRunning] = useState(false)
  const [dispatched, setDispatched] = useState<{ agentName: string; task: string }[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', metric: 'tasks_completed', targetValue: '10', period: 'monthly', dueAt: '', description: '' })

  const DEFAULT_CONFIG: Config = { enabled: false, briefTime: '08:00', lastBriefAt: null }

  useEffect(() => {
    setLoading(true)
    authFetch(`${API}/api/autonomous`)
      .then((r) => r.json())
      .then((d) => { setConfig(d.config ?? DEFAULT_CONFIG); setObjectives(d.objectives ?? []) })
      .catch(() => { setConfig(DEFAULT_CONFIG) })
      .finally(() => setLoading(false))
  }, [API, authFetch])

  async function toggleMode() {
    if (toggling) return
    const current = config?.enabled ?? false
    const next = !current
    setToggling(true)
    setConfig((prev) => ({ ...(prev ?? DEFAULT_CONFIG), enabled: next }))
    try {
      const res = await authFetch(`${API}/api/autonomous`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) })
      const d = await res.json()
      if (d.config) setConfig(d.config)
    } catch {
      setConfig((prev) => ({ ...(prev ?? DEFAULT_CONFIG), enabled: current }))
    } finally { setToggling(false) }
  }

  async function fetchBrief() {
    setLoadingBrief(true)
    try {
      const res = await authFetch(`${API}/api/autonomous/brief`)
      const d = await res.json()
      setBrief(d.brief)
    } catch {} finally { setLoadingBrief(false) }
  }

  async function runAutonomous() {
    if (running) return
    setRunning(true)
    setDispatched([])
    try {
      const res = await authFetch(`${API}/api/autonomous/run`, { method: 'POST', body: '{}' })
      const d = await res.json()
      setDispatched(d.dispatched ?? [])
    } catch {} finally { setRunning(false) }
  }

  async function addObjective() {
    if (!form.title || !form.dueAt || saving) return
    setSaving(true)
    try {
      const res = await authFetch(`${API}/api/autonomous/objectives`, {
        method: 'POST',
        body: JSON.stringify({ ...form, targetValue: parseFloat(form.targetValue) }),
      })
      const d = await res.json()
      if (d.objective) { setObjectives((p) => [d.objective, ...p]); setShowAdd(false); setForm({ title: '', metric: 'tasks_completed', targetValue: '10', period: 'monthly', dueAt: '', description: '' }) }
    } catch {} finally { setSaving(false) }
  }

  async function removeObjective(id: string) {
    await authFetch(`${API}/api/autonomous/objectives/${id}`, { method: 'DELETE' })
    setObjectives((p) => p.filter((o) => o.id !== id))
  }

  function progressPct(obj: Objective) {
    return Math.min(Math.round((obj.currentValue / obj.targetValue) * 100), 100)
  }

  return (
    <>
      <motion.div
        key="auto-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ x: `calc(-50% + ${offset.x}px)`, y: `calc(-50% + ${offset.y}px)` }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(740px,calc(100vw-240px))] max-h-[82vh] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div onMouseDown={onDragStart} className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0 cursor-move select-none">
          <div className={cn('w-8 h-8 rounded-xl border flex items-center justify-center transition-all', config?.enabled ? 'bg-emerald-400/20 border-emerald-400/30' : 'bg-white/5 border-white/10')}>
            <Zap size={14} className={config?.enabled ? 'text-emerald-400' : 'text-panel-muted'} />
          </div>
          <div className="flex-1">
            <h2 className="text-white text-sm font-bold">Autonomous Office Mode</h2>
            <p className="text-panel-muted text-[10px]">Set objectives · your office self-organises toward them</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMode} disabled={toggling || loading}
              className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50', config?.enabled ? 'bg-emerald-500' : 'bg-white/10')}
            >
              {toggling && <Loader2 size={10} className="animate-spin absolute inset-0 m-auto text-white" />}
              {!toggling && <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform', config?.enabled ? 'translate-x-5' : 'translate-x-1')} />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all"><X size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none">
          {/* Mission Control strip */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]">
            <button onClick={fetchBrief} disabled={loadingBrief}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white hover:border-white/20 transition-all disabled:opacity-50">
              {loadingBrief ? <Loader2 size={11} className="animate-spin" /> : <TrendingUp size={11} />}
              Morning Brief
            </button>
            <button onClick={runAutonomous} disabled={running || !config?.enabled}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40', config?.enabled ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30' : 'bg-white/5 border border-white/10 text-panel-muted')}>
              {running ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />}
              {running ? 'Running…' : 'Run Now'}
            </button>
            {!config?.enabled && <p className="text-panel-muted text-[10px]">Enable autonomous mode to run</p>}
          </div>

          {/* Dispatched tasks */}
          <AnimatePresence>
            {dispatched.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }} className="border-b border-white/[0.06]"
              >
                <div className="px-5 py-3 space-y-1.5">
                  <p className="text-[10px] text-panel-muted uppercase tracking-widest">Tasks dispatched</p>
                  {dispatched.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                      <PlayCircle size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-medium text-emerald-300">{d.agentName}</p>
                        <p className="text-[10px] text-white/70">{d.task}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Morning brief */}
          <AnimatePresence>
            {brief && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }} className="border-b border-white/[0.06]"
              >
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-semibold">{brief.headline}</p>
                    <span className="text-[9px] text-panel-muted">{brief.date}</span>
                  </div>
                  <div className="space-y-1.5">
                    {brief.bullets.map((b, i) => {
                      const meta = BULLET_META[b.type] ?? BULLET_META.priority
                      return (
                        <div key={i} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2', meta.bg)}>
                          <span className={cn('shrink-0 mt-0.5', meta.color)}>{meta.icon}</span>
                          <p className="text-white/80 text-[11px] leading-relaxed">{b.text}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Objectives */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-panel-muted uppercase tracking-widest">Business Objectives</p>
              <button onClick={() => setShowAdd((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-panel-accent hover:text-panel-accent/80 transition-colors">
                <Plus size={10} /> Add
              </button>
            </div>

            {/* Add form */}
            <AnimatePresence>
              {showAdd && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}>
                  <div className="rounded-xl border border-panel-accent/20 bg-panel-accent/5 p-3 space-y-2">
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Objective title"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-panel-muted/50 outline-none" />
                    <div className="grid grid-cols-3 gap-2">
                      <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs outline-none">
                        {METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                      </select>
                      <input type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} placeholder="Target"
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs outline-none" />
                      <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs outline-none">
                        {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none" />
                      <button onClick={addObjective} disabled={saving || !form.title || !form.dueAt}
                        className="px-4 py-2 rounded-lg bg-panel-accent/20 border border-panel-accent/30 text-panel-accent text-xs font-medium hover:bg-panel-accent/30 transition-all disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Objective cards */}
            {loading && <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>}
            {!loading && objectives.length === 0 && !showAdd && (
              <div className="flex flex-col items-center py-8 gap-2">
                <Target size={28} className="text-white/10" />
                <p className="text-panel-muted text-xs text-center">No objectives set.<br />Add one to let your office self-organise.</p>
              </div>
            )}
            <div className="space-y-2">
              {objectives.map((obj) => {
                const pct = progressPct(obj)
                return (
                  <div key={obj.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 group">
                    <div className="flex items-start gap-3">
                      <Target size={13} className="text-panel-accent shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white text-[12px] font-medium truncate">{obj.title}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-panel-muted capitalize shrink-0">{obj.period}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <motion.div className="h-full rounded-full bg-panel-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                          </div>
                          <span className="text-[10px] text-panel-muted shrink-0">{obj.currentValue}/{obj.targetValue} {obj.metric.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] font-medium text-panel-accent shrink-0">{pct}%</span>
                        </div>
                        <p className="text-[9px] text-panel-muted/50 mt-1">Due {new Date(obj.dueAt).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => removeObjective(obj.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-panel-muted hover:text-red-400 transition-all shrink-0">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
