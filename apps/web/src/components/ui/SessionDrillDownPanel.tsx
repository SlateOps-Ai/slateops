'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronRight, ChevronLeft, Clock, Zap, DollarSign,
  CheckCircle, AlertCircle, Wrench, Brain, ListOrdered,
  Loader2, Activity,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  id:          string
  title:       string
  rawCommand:  string
  status:      string
  confidence:  string | null
  userRating:  string | null
  tokensUsed:  number
  costUsd:     number
  stepCount:   number
  toolCount:   number
  memCount:    number
  durationMs:  number | null
  createdAt:   string
  completedAt: string | null
}

interface Step {
  id:          string
  stepNumber:  number
  name:        string
  description: string | null
  status:      string
  output:      { content?: string; [k: string]: unknown } | null
  startedAt:   string | null
  completedAt: string | null
  toolCalls: Array<{
    id:         string
    toolName:   string
    input:      unknown
    output:     unknown
    status:     string
    durationMs: number | null
    createdAt:  string
  }>
}

interface MemoryWrite {
  id:         string
  key:        string
  value:      string
  source:     string
  confidence: number | null
  createdAt:  string
}

interface TaskDetail {
  id:         string
  title:      string
  rawCommand: string
  status:     string
  tokensUsed: number
  costUsd:    number
  confidence: string | null
  result:     unknown
  steps:      Step[]
  events:     Array<{ id: string; eventType: string; payload: unknown; timestamp: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function statusColor(s: string) {
  if (s === 'COMPLETE') return 'text-lamp-done'
  if (s === 'FAILED')   return 'text-lamp-blocked'
  if (s === 'IN_PROGRESS' || s === 'WORKING') return 'text-lamp-working'
  return 'text-panel-muted'
}

function confidenceBadge(band: string | null) {
  if (!band) return null
  const map: Record<string, string> = {
    HIGH:   'bg-lamp-done/15 text-lamp-done border-lamp-done/30',
    MEDIUM: 'bg-lamp-idle/15 text-lamp-idle border-lamp-idle/30',
    LOW:    'bg-lamp-blocked/15 text-lamp-blocked border-lamp-blocked/30',
  }
  return (
    <span className={cn('rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', map[band] ?? 'bg-white/5 text-panel-muted border-white/10')}>
      {band}
    </span>
  )
}

// ── Session List Item ─────────────────────────────────────────────────────────

function SessionRow({ s, onClick }: { s: Session; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-xl border border-white/5 bg-white/5 hover:border-white/15 hover:bg-white/8 transition-all group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-wide', statusColor(s.status))}>
              {s.status === 'COMPLETE' ? '✓' : s.status === 'FAILED' ? '✗' : '…'}
            </span>
            <p className="text-white text-xs font-medium truncate flex-1">{s.title}</p>
            {confidenceBadge(s.confidence)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {s.durationMs != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-panel-muted">
                <Clock size={9} /> {fmt(s.durationMs)}
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[10px] text-panel-muted">
              <Zap size={9} /> {s.tokensUsed.toLocaleString()} tok
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-panel-muted">
              <DollarSign size={9} /> ${s.costUsd.toFixed(4)}
            </span>
            {s.memCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-panel-accent">
                <Brain size={9} /> {s.memCount} learned
              </span>
            )}
          </div>
          <p className="text-panel-muted/60 text-[9px] mt-0.5">{timeAgo(s.createdAt)}</p>
        </div>
        <ChevronRight size={13} className="text-panel-muted group-hover:text-white transition-colors shrink-0 mt-1" />
      </div>
    </button>
  )
}

// ── Task Detail View ──────────────────────────────────────────────────────────

function TaskDetailView({
  agentId,
  taskId,
  onBack,
}: {
  agentId: string
  taskId:  string
  onBack:  () => void
}) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const [task,      setTask]      = useState<TaskDetail | null>(null)
  const [memories,  setMemories]  = useState<MemoryWrite[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<'steps' | 'tools' | 'memory' | 'events'>('steps')

  useEffect(() => {
    authFetch(`${API}/api/agents/${agentId}/sessions/${taskId}`)
      .then((r) => r.json())
      .then((d) => {
        setTask(d.task)
        setMemories(d.memories ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId, taskId, API, authFetch])

  const allToolCalls = task?.steps.flatMap((s) => s.toolCalls) ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        {loading ? (
          <span className="text-panel-muted text-xs">Loading…</span>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{task?.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('text-[10px] font-medium', statusColor(task?.status ?? ''))}>
                {task?.status}
              </span>
              {confidenceBadge(task?.confidence ?? null)}
              <span className="text-panel-muted text-[10px] flex items-center gap-0.5">
                <Zap size={8} /> {task?.tokensUsed.toLocaleString()} tok
              </span>
              <span className="text-panel-muted text-[10px] flex items-center gap-0.5">
                <DollarSign size={8} /> ${task?.costUsd.toFixed(4)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0 text-[10px]">
        {([
          ['steps',  'Steps',   task?.steps.length ?? 0,    <ListOrdered size={9} />],
          ['tools',  'Tools',   allToolCalls.length,         <Wrench size={9} />],
          ['memory', 'Learned', memories.length,             <Brain size={9} />],
          ['events', 'Events',  task?.events.length ?? 0,    <Activity size={9} />],
        ] as const).map(([key, label, count, icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors',
              activeTab === key
                ? 'text-white border-b border-panel-accent'
                : 'text-panel-muted hover:text-white'
            )}
          >
            {icon} {label} {count > 0 && <span className="opacity-60">({count})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-none">
        {loading && (
          <div className="flex justify-center pt-8">
            <Loader2 size={16} className="animate-spin text-panel-muted" />
          </div>
        )}

        {/* Steps tab */}
        {!loading && activeTab === 'steps' && (
          <>
            {(task?.steps ?? []).length === 0 && (
              <p className="text-panel-muted text-xs text-center pt-6">No steps recorded.</p>
            )}
            {(task?.steps ?? []).map((step) => (
              <div key={step.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn('text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                    step.status === 'COMPLETE' ? 'bg-lamp-done/20 text-lamp-done' :
                    step.status === 'FAILED'   ? 'bg-lamp-blocked/20 text-lamp-blocked' :
                    'bg-white/10 text-panel-muted'
                  )}>
                    {step.stepNumber}
                  </span>
                  <p className="text-white text-xs font-medium flex-1 truncate">{step.name}</p>
                  {step.startedAt && step.completedAt && (
                    <span className="text-[9px] text-panel-muted shrink-0">
                      {fmt(new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime())}
                    </span>
                  )}
                </div>
                {step.description && (
                  <p className="text-panel-muted text-[10px] mb-1.5 leading-relaxed">{step.description}</p>
                )}
                {step.output && (
                  <div className="rounded-lg bg-black/30 border border-white/5 px-2.5 py-2 mt-1">
                    <p className="text-[9px] text-panel-muted uppercase tracking-widest mb-1">Output</p>
                    <p className="text-white/80 text-[10px] leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
                      {typeof step.output.content === 'string'
                        ? step.output.content
                        : JSON.stringify(step.output, null, 2)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Tools tab */}
        {!loading && activeTab === 'tools' && (
          <>
            {allToolCalls.length === 0 && (
              <p className="text-panel-muted text-xs text-center pt-6">No tool calls made.</p>
            )}
            {allToolCalls.map((tc) => (
              <div key={tc.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench size={11} className="text-panel-accent shrink-0" />
                  <p className="text-white text-xs font-medium flex-1 truncate font-mono">{tc.toolName}</p>
                  <span className={cn('text-[9px] font-medium',
                    tc.status === 'COMPLETE' ? 'text-lamp-done' :
                    tc.status === 'FAILED' ? 'text-lamp-blocked' : 'text-panel-muted'
                  )}>{tc.status}</span>
                  {tc.durationMs != null && (
                    <span className="text-[9px] text-panel-muted">{fmt(tc.durationMs)}</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div>
                    <p className="text-[9px] text-panel-muted uppercase tracking-widest mb-0.5">Input</p>
                    <pre className="text-[9px] text-white/60 font-mono leading-relaxed whitespace-pre-wrap break-all line-clamp-4 bg-black/20 rounded px-2 py-1">
                      {JSON.stringify(tc.input, null, 2)}
                    </pre>
                  </div>
                  {tc.output != null && (
                    <div>
                      <p className="text-[9px] text-panel-muted uppercase tracking-widest mb-0.5">Output</p>
                      <pre className="text-[9px] text-white/60 font-mono leading-relaxed whitespace-pre-wrap break-all line-clamp-4 bg-black/20 rounded px-2 py-1">
                        {JSON.stringify(tc.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Memory tab */}
        {!loading && activeTab === 'memory' && (
          <>
            {memories.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-6 text-center">
                <Brain size={18} className="text-panel-muted/40" />
                <p className="text-panel-muted text-xs">No memories were learned from this task.</p>
              </div>
            )}
            {memories.map((m) => (
              <div key={m.id} className="rounded-xl border border-panel-accent/20 bg-panel-accent/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain size={10} className="text-panel-accent shrink-0" />
                  <p className="text-panel-accent text-[10px] font-semibold uppercase tracking-wide flex-1 truncate">
                    {m.key.replace(/_/g, ' ')}
                  </p>
                  {m.confidence != null && (
                    <span className="text-[9px] text-panel-muted">
                      {Math.round(m.confidence * 100)}% conf
                    </span>
                  )}
                </div>
                <p className="text-white/80 text-xs leading-relaxed">{m.value}</p>
              </div>
            ))}
          </>
        )}

        {/* Events tab */}
        {!loading && activeTab === 'events' && (
          <>
            {(task?.events ?? []).length === 0 && (
              <p className="text-panel-muted text-xs text-center pt-6">No events recorded.</p>
            )}
            <div className="space-y-1">
              {(task?.events ?? []).map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <span className={cn('text-[9px] font-mono font-bold shrink-0 mt-0.5 w-28 truncate',
                    ev.eventType === 'TASK_COMPLETE' ? 'text-lamp-done' :
                    ev.eventType === 'TASK_FAILED'   ? 'text-lamp-blocked' :
                    ev.eventType.startsWith('TOOL')  ? 'text-lamp-working' :
                    'text-panel-muted'
                  )}>
                    {ev.eventType}
                  </span>
                  <p className="text-white/60 text-[10px] leading-relaxed flex-1 truncate">
                    {(() => {
                      const p = ev.payload as any
                      return p?.thoughtBubble ?? p?.action ?? ''
                    })()}
                  </p>
                  <span className="text-[9px] text-panel-muted/50 shrink-0">
                    {timeAgo(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  agentId:   string
  agentName: string
  onClose:   () => void
}

export function SessionDrillDownPanel({ agentId, agentName, onClose }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL

  const [sessions,        setSessions]        = useState<Session[]>([])
  const [loading,         setLoading]         = useState(true)
  const [selectedTaskId,  setSelectedTaskId]  = useState<string | null>(null)

  const load = useCallback(() => {
    authFetch(`${API}/api/agents/${agentId}/sessions`)
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId, API, authFetch])

  useEffect(() => { load() }, [load])

  const totalCost   = sessions.reduce((s, t) => s + t.costUsd, 0)
  const totalTokens = sessions.reduce((s, t) => s + t.tokensUsed, 0)
  const successRate = sessions.length
    ? Math.round((sessions.filter((s) => s.status === 'COMPLETE').length / sessions.length) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="fixed right-4 top-16 bottom-24 z-50 w-96 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Activity size={13} className="text-panel-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{agentName} · Sessions</p>
          <p className="text-panel-muted text-[10px]">
            {sessions.length} tasks · {successRate}% success · ${totalCost.toFixed(4)} total
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Stat strip */}
      {!loading && sessions.length > 0 && !selectedTaskId && (
        <div className="grid grid-cols-3 border-b border-white/5 shrink-0">
          {[
            ['Tasks', sessions.length, ''],
            ['Tokens', totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens, ''],
            ['Spent', `$${totalCost.toFixed(3)}`, ''],
          ].map(([label, value]) => (
            <div key={label as string} className="py-2 text-center">
              <p className="text-white text-sm font-semibold">{value}</p>
              <p className="text-panel-muted text-[9px] uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Body — list or detail */}
      <AnimatePresence mode="wait">
        {selectedTaskId ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TaskDetailView
              agentId={agentId}
              taskId={selectedTaskId}
              onBack={() => setSelectedTaskId(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18 }}
            className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-none"
          >
            {loading && (
              <div className="flex justify-center pt-8">
                <Loader2 size={16} className="animate-spin text-panel-muted" />
              </div>
            )}
            {!loading && sessions.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-10 px-4 text-center">
                <Activity size={20} className="text-panel-muted/40" />
                <p className="text-panel-muted text-xs">No sessions yet. Give {agentName} a task to get started.</p>
              </div>
            )}
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                onClick={() => setSelectedTaskId(s.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
