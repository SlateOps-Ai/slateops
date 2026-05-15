'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, Play, Loader2, GitBranch, ChevronDown,
  CheckCircle, XCircle, Clock, Sparkles, FlaskConical,
  AlertTriangle, ArrowRight, RotateCcw, ShieldCheck,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

interface WorkflowStep {
  agentId:      string
  instruction:  string
  label:        string
  requiresGate: boolean
}

interface StepResult {
  label:  string
  taskId: string
  status: string
}

interface WorkflowRun {
  id:          string
  status:      string
  startedAt:   string
  completedAt: string | null
  stepOutputs: StepResult[]
}

interface Workflow {
  id:        string
  name:      string
  steps:     WorkflowStep[]
  status:    string
  createdAt: string
  runs:      WorkflowRun[]
}

interface Props { onClose: () => void }

const WORKFLOW_TEMPLATES = [
  {
    label:    'Agency',
    name:     'Content Production Pipeline',
    emoji:    '✍️',
    tagline:  'Research → Draft → Review',
    steps: [
      { label: 'Research Topic',  instruction: 'Research the assigned topic thoroughly. Gather key statistics, competitor examples, audience insights, and 3 recommended content angles. Output a structured research brief.', requiresGate: false },
      { label: 'Write Draft',     instruction: 'Using the research brief from the previous step, write a polished 600-word article with a strong hook, clear structure, and a call to action.',                              requiresGate: true  },
      { label: 'Final Review',    instruction: 'Review the draft for factual accuracy, brand voice consistency, and SEO fundamentals. Output the final version ready to publish.',                                         requiresGate: false },
    ],
  },
  {
    label:    'E-Commerce',
    name:     'Competitor Research Pipeline',
    emoji:    '🛒',
    tagline:  'Research → Pricing Memo → Approval',
    steps: [
      { label: 'Competitor Research', instruction: 'Research the top 5 competitors for the given product category. Summarise their pricing, positioning, key features, and any recent promotions.',                requiresGate: false },
      { label: 'Pricing Memo',        instruction: 'Based on the research, produce a one-page pricing memo with a recommended price point, rationale, and suggested promotional strategy.',                         requiresGate: true  },
      { label: 'Publish Update',      instruction: 'Take the approved pricing memo and format it as an internal Slack announcement and a brief customer-facing FAQ update. Output both drafts.',                    requiresGate: false },
    ],
  },
  {
    label:    'Professional Services',
    name:     'Meeting Notes Pipeline',
    emoji:    '📋',
    tagline:  'Notes → Action Items → CRM Update',
    steps: [
      { label: 'Process Meeting Notes', instruction: 'Read the raw meeting transcript or notes. Produce a clean summary: attendees, key decisions made, open questions, and next steps.',                            requiresGate: false },
      { label: 'Extract Action Items',  instruction: 'From the meeting summary, extract all action items. For each: owner, deadline, priority (High/Medium/Low), and a one-sentence description.',                  requiresGate: true  },
      { label: 'CRM Update Draft',      instruction: 'Format the approved action items as a CRM contact note and a follow-up email draft to send to the client. Match a professional, concise tone.',                requiresGate: false },
    ],
  },
] as const

// ── Agent dropdown ─────────────────────────────────────────────────────────

function AgentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const agents   = useAgentsStore((s) => s.agents)
  const [open, setOpen] = useState(false)
  const selected = agents.find((a) => a.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white hover:border-white/20 transition-colors"
      >
        {selected ? (
          <>
            <img src={selected.avatarUrl} alt={selected.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
            <span className="flex-1 text-left truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-panel-muted">Select agent…</span>
        )}
        <ChevronDown size={11} className="text-panel-muted shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-white/10 bg-panel-bg shadow-xl overflow-hidden"
            >
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onChange(a.id); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors',
                    a.id === value ? 'bg-panel-accent/20 text-white' : 'text-white/80 hover:bg-white/5'
                  )}
                >
                  <img src={a.avatarUrl} alt={a.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto text-[9px] text-panel-muted capitalize">
                    {a.role.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Run status helpers ─────────────────────────────────────────────────────

function RunIcon({ status }: { status: string }) {
  if (status === 'COMPLETE' || status === 'TEST_COMPLETE') return <CheckCircle size={12} className="text-lamp-done" />
  if (status === 'FAILED'   || status === 'TEST_FAILED')   return <XCircle     size={12} className="text-lamp-blocked" />
  return <Clock size={12} className="text-lamp-idle animate-pulse" />
}

function isTestRun(status: string) { return status.startsWith('TEST_') }

// ── Test result panel ──────────────────────────────────────────────────────

function TestResultPanel({ run, steps }: { run: WorkflowRun; steps: WorkflowStep[] }) {
  const agents  = useAgentsStore((s) => s.agents)
  const running = run.status === 'TEST_RUNNING' || run.status === 'RUNNING'
  const outputs: StepResult[] = Array.isArray(run.stepOutputs) ? run.stepOutputs : []

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FlaskConical size={11} className="text-panel-accent" />
        <span className="text-panel-accent text-[10px] font-semibold uppercase tracking-widest">
          Test run {running ? '— in progress…' : run.status === 'TEST_COMPLETE' ? '— passed' : '— failed'}
        </span>
        {running && <Loader2 size={10} className="animate-spin text-panel-muted ml-auto" />}
      </div>

      <div className="space-y-1.5">
        {steps.map((step, i) => {
          const result = outputs[i]
          const agent  = agents.find((a) => a.id === step.agentId)
          const status = result?.status ?? (running && i === outputs.length ? 'RUNNING' : null)

          return (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/4">
              <span className="text-panel-muted text-[9px] w-4 text-right shrink-0">{i + 1}</span>
              <span className="flex-1 text-white text-[10px] truncate">{step.label}</span>
              {agent && (
                <img src={agent.avatarUrl} alt={agent.name} className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
              )}
              {status === 'COMPLETE'
                ? <CheckCircle size={11} className="text-lamp-done shrink-0" />
                : status === 'FAILED'
                ? <XCircle     size={11} className="text-lamp-blocked shrink-0" />
                : status === 'RUNNING'
                ? <Loader2     size={11} className="text-lamp-working animate-spin shrink-0" />
                : <span className="w-[11px] h-[11px] rounded-full border border-white/15 shrink-0" />
              }
            </div>
          )
        })}
      </div>

      {!running && (
        <p className="text-panel-muted text-[10px] pt-0.5">
          {run.status === 'TEST_COMPLETE'
            ? 'Dry run passed — agents & instructions validated. Ready to go live.'
            : 'One or more steps failed. Check agent availability and try again.'}
        </p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorkflowBuilderPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const agents    = useAgentsStore((s) => s.agents)

  const [tab,     setTab]     = useState<'saved' | 'build'>('saved')
  const [aiMode,  setAiMode]  = useState(false)

  // Manual build state
  const [name,    setName]    = useState('')
  const [steps,   setSteps]   = useState<WorkflowStep[]>([{ agentId: '', instruction: '', label: '', requiresGate: false }])
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState<Workflow | null>(null)

  // AI build state
  const [aiText,      setAiText]      = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [aiError,     setAiError]     = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Saved workflows state
  const [workflows,   setWorkflows]   = useState<Workflow[]>([])
  const [wfLoading,   setWfLoading]   = useState(false)
  const [runningId,   setRunningId]   = useState<string | null>(null)
  const [testRuns,    setTestRuns]    = useState<Record<string, WorkflowRun>>({})
  const [livePollers,   setLivePollers]   = useState<Record<string, ReturnType<typeof setInterval>>>({})
  const [approvingGate, setApprovingGate] = useState<string | null>(null)

  useEffect(() => {
    if (tab !== 'saved') return
    setWfLoading(true)
    authFetch(`${API}/api/workflows`)
      .then((r) => r.json())
      .then((d) => setWorkflows(d.workflows ?? []))
      .catch(() => {})
      .finally(() => setWfLoading(false))
  }, [tab, API, authFetch])

  // Cleanup live pollers on unmount
  useEffect(() => () => {
    Object.values(livePollers).forEach(clearInterval)
  }, [livePollers])

  // ── Build helpers ──────────────────────────────────────────────────────

  function addStep() { setSteps((p) => [...p, { agentId: '', instruction: '', label: '', requiresGate: false }]) }
  function removeStep(i: number) { setSteps((p) => p.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, patch: Partial<WorkflowStep>) {
    setSteps((p) => p.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.agentId && s.instruction.trim() && s.label.trim())

  // ── AI generate ────────────────────────────────────────────────────────

  async function generateWithAI() {
    if (!aiText.trim() || generating) return
    setGenerating(true)
    setAiError('')
    try {
      const res  = await authFetch(`${API}/api/workflows/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ description: aiText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAiError(data.error ?? 'Generation failed. Try adding more detail.'); return }

      // Populate manual form with AI result
      setName(data.workflow.name ?? '')
      setSteps(data.workflow.steps ?? [])
      setAiMode(false)
    } catch {
      setAiError('Could not reach the server.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────

  async function saveWorkflow() {
    if (!valid) return
    setSaving(true)
    try {
      const res  = await authFetch(`${API}/api/workflows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), steps }),
      })
      const data = await res.json()
      setSaved(data.workflow)
      setWorkflows((p) => [data.workflow, ...p])
    } catch { /* non-fatal */ }
    finally { setSaving(false) }
  }

  // ── Run (live or test) ─────────────────────────────────────────────────

  async function runWorkflow(id: string, isTest: boolean) {
    if (isTest) {
      setTestRuns((p) => ({ ...p, [id]: { id: 'pending', status: 'TEST_RUNNING', startedAt: new Date().toISOString(), completedAt: null, stepOutputs: [] } }))
    } else {
      setRunningId(id)
    }
    try {
      const res  = await authFetch(`${API}/api/workflows/${id}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isTest }),
      })
      const data = await res.json()

      if (isTest) {
        // Test runs now return synchronously — no polling needed
        const run = data.run as WorkflowRun | undefined
        if (run) {
          setTestRuns((p) => ({ ...p, [id]: run }))
        } else {
          setTestRuns((p) => ({ ...p, [id]: { id: 'error', status: 'TEST_FAILED', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), stepOutputs: [] } }))
        }
      } else if (!isTest && data.run?.id) {
        const liveRunId = data.run.id
        setWorkflows((p) => p.map((w) =>
          w.id === id
            ? { ...w, runs: [{ id: liveRunId, status: 'RUNNING', startedAt: new Date().toISOString(), completedAt: null, stepOutputs: [] }, ...w.runs] }
            : w
        ))
        // Poll live run to detect WAITING_GATE and final status
        const poller = setInterval(async () => {
          try {
            const r    = await authFetch(`${API}/api/workflows`)
            const json = await r.json()
            const wf   = (json.workflows as Workflow[])?.find((w) => w.id === id)
            if (wf) {
              setWorkflows((p) => p.map((w) => w.id === id ? wf : w))
              const run = wf.runs?.find((r) => r.id === liveRunId)
              if (run && ['COMPLETE','FAILED','GATE_REJECTED'].includes(run.status)) {
                clearInterval(poller)
                setLivePollers((p) => { const n = { ...p }; delete n[id]; return n })
              }
            }
          } catch { /* ignore */ }
        }, 4000)
        setLivePollers((p) => ({ ...p, [id]: poller }))
      }
    } catch { /* non-fatal */ }
    finally { if (!isTest) setRunningId(null) }
  }

  async function deleteWorkflow(id: string) {
    try {
      await authFetch(`${API}/api/workflows/${id}`, { method: 'DELETE' })
      setWorkflows((p) => p.filter((w) => w.id !== id))
    } catch { /* non-fatal */ }
  }

  async function approveGate(runId: string, decision: 'APPROVE' | 'REJECT') {
    setApprovingGate(runId + decision)
    try {
      await authFetch(`${API}/api/workflows/runs/${runId}/gate`, {
        method: 'POST',
        body:   JSON.stringify({ decision }),
      })
      // Immediately refresh workflow list
      const r    = await authFetch(`${API}/api/workflows`)
      const json = await r.json()
      setWorkflows(json.workflows ?? [])
    } catch { /* non-fatal */ }
    finally { setApprovingGate(null) }
  }

  function resetBuild() {
    setSaved(null); setName(''); setSteps([{ agentId: '', instruction: '', label: '', requiresGate: false }]); setAiMode(false); setAiText('')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{ x: offset.x, y: offset.y }}
      className="absolute right-60 top-16 z-30 w-[460px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0 cursor-move select-none">
        <GitBranch size={13} className="text-panel-accent" />
        <span className="text-white text-sm font-medium flex-1">Workflow Builder</span>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['saved', 'build'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-[11px] font-medium transition-colors',
              tab === t ? 'text-white border-b-2 border-panel-accent -mb-px' : 'text-panel-muted hover:text-white'
            )}
          >
            {t === 'saved' ? 'My Workflows' : 'Build New'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">

        {/* ── My Workflows ── */}
        {tab === 'saved' && (
          <>
            {wfLoading && (
              <div className="flex items-center justify-center pt-8 gap-2 text-panel-muted text-xs">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            )}
            {!wfLoading && workflows.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <GitBranch size={20} className="text-panel-muted/30" />
                <p className="text-panel-muted text-xs">No workflows yet.</p>
                <button onClick={() => setTab('build')} className="mt-1 text-panel-accent text-xs hover:underline">
                  Build your first workflow →
                </button>
              </div>
            )}
            <div className="space-y-3">
              {workflows.map((wf) => {
                const lastRun  = wf.runs[0] ?? null
                const testRun  = testRuns[wf.id] ?? null
                const isLive   = lastRun && !isTestRun(lastRun.status)
                return (
                  <div key={wf.id} className="rounded-xl border border-white/10 bg-white/4 p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-xs font-semibold truncate">{wf.name}</p>
                        <p className="text-panel-muted text-[10px]">{wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {/* Test button */}
                        <button
                          onClick={() => runWorkflow(wf.id, true)}
                          disabled={testRun?.status === 'TEST_RUNNING'}
                          title="Test run"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-panel-muted hover:text-panel-accent hover:border-panel-accent/30 disabled:opacity-50 transition-all text-[10px]"
                        >
                          {testRun?.status === 'TEST_RUNNING'
                            ? <Loader2 size={10} className="animate-spin" />
                            : <FlaskConical size={10} />}
                          Test
                        </button>
                        {/* Live run button */}
                        <button
                          onClick={() => runWorkflow(wf.id, false)}
                          disabled={runningId === wf.id}
                          title="Run live"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-panel-accent/15 border border-panel-accent/25 text-panel-accent hover:bg-panel-accent/25 disabled:opacity-50 transition-all text-[10px]"
                        >
                          {runningId === wf.id
                            ? <Loader2 size={10} className="animate-spin" />
                            : <Play size={10} />}
                          Run
                        </button>
                        <button
                          onClick={() => deleteWorkflow(wf.id)}
                          className="p-1.5 rounded-lg bg-white/5 text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Step pills */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {wf.steps.map((s, i) => {
                        const agent = agents.find((a) => a.id === s.agentId)
                        return (
                          <span key={i} className="flex items-center gap-1">
                            <span className="flex items-center gap-1 text-[9px] bg-white/5 border border-white/8 px-1.5 py-0.5 rounded text-panel-muted">
                              {agent && <img src={agent.avatarUrl} alt="" className="w-2.5 h-2.5 rounded-full object-cover" />}
                              <span className="truncate max-w-[70px]">{s.label}</span>
                            </span>
                            {(s as WorkflowStep).requiresGate && i < wf.steps.length - 1 && (
                              <ShieldCheck size={9} className="text-amber-400 shrink-0" title="Human Review Gate" />
                            )}
                          </span>
                        )
                      })}
                    </div>

                    {/* Test run results */}
                    {testRun && (
                      <TestResultPanel run={testRun} steps={wf.steps} />
                    )}

                    {/* Human Review Gate waiting UI */}
                    {lastRun?.status === 'WAITING_GATE' && !testRun && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={12} className="text-amber-400 shrink-0" />
                          <span className="text-amber-400 text-[10px] font-semibold">Awaiting your review</span>
                          <Loader2 size={9} className="animate-spin text-amber-400/50 ml-auto" />
                        </div>
                        <p className="text-panel-muted text-[10px] leading-relaxed">
                          The workflow is paused at a Human Review Gate. Review the completed step's output in the task timeline, then decide whether to continue.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveGate(lastRun.id, 'APPROVE')}
                            disabled={!!approvingGate}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-lamp-done/20 border border-lamp-done/40 text-lamp-done text-[10px] font-medium hover:bg-lamp-done/30 disabled:opacity-50 transition-all"
                          >
                            {approvingGate === lastRun.id + 'APPROVE' ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle size={9} />}
                            Continue
                          </button>
                          <button
                            onClick={() => approveGate(lastRun.id, 'REJECT')}
                            disabled={!!approvingGate}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-panel-muted text-[10px] hover:text-lamp-blocked hover:border-lamp-blocked/30 disabled:opacity-50 transition-all"
                          >
                            {approvingGate === lastRun.id + 'REJECT' ? <Loader2 size={9} className="animate-spin" /> : <XCircle size={9} />}
                            Stop
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Last live run */}
                    {isLive && !testRun && lastRun?.status !== 'WAITING_GATE' && (
                      <div className="flex items-center gap-1.5">
                        <RunIcon status={lastRun!.status} />
                        <span className="text-panel-muted text-[10px]">
                          Last run {new Date(lastRun!.startedAt).toLocaleDateString()} — {lastRun!.status.toLowerCase()}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Build New ── */}
        {tab === 'build' && (
          <>
            {/* Templates */}
            {!saved && (
              <div>
                <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-2">Start from a template</p>
                <div className="space-y-2">
                  {WORKFLOW_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => {
                        setAiMode(false)
                        setName(tpl.name)
                        setSteps(tpl.steps.map((s) => ({ ...s, agentId: '' })))
                      }}
                      className="w-full flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-panel-accent/30 px-3 py-2.5 text-left transition-all"
                    >
                      <span className="text-base shrink-0">{tpl.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[11px] font-medium truncate">{tpl.name}</p>
                        <p className="text-panel-muted text-[10px]">{tpl.tagline}</p>
                      </div>
                      <ArrowRight size={11} className="text-panel-muted shrink-0" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-panel-muted text-[10px]">or</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              </div>
            )}

            {/* AI / Manual mode toggle */}
            {!saved && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
                <button
                  onClick={() => setAiMode(false)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                    !aiMode ? 'bg-panel-bg text-white shadow-sm' : 'text-panel-muted hover:text-white'
                  )}
                >
                  <GitBranch size={11} /> Manual
                </button>
                <button
                  onClick={() => setAiMode(true)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                    aiMode ? 'bg-panel-accent/20 text-panel-accent shadow-sm' : 'text-panel-muted hover:text-white'
                  )}
                >
                  <Sparkles size={11} /> Build with AI
                </button>
              </div>
            )}

            {/* ── AI Mode ── */}
            {aiMode && !saved && (
              <div className="space-y-3">
                <div>
                  <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Describe your business process</p>
                  <p className="text-panel-muted/60 text-[10px] mb-2.5 leading-relaxed">
                    Describe a business process you repeat every week — we'll turn it into an automated workflow in seconds. Mention your agents by name.
                  </p>
                  {/* Agent reference chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {agents.map((a) => (
                      <span key={a.id} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-panel-muted">
                        <img src={a.avatarUrl} alt="" className="w-3 h-3 rounded-full object-cover" />
                        {a.name}
                      </span>
                    ))}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    rows={8}
                    placeholder={`Example:\n\nEvery Monday, Alex researches 5 competitor blogs and summarises key trends. Then Jordan writes a 500-word newsletter draft based on Alex's summary. Finally, Sam schedules the newsletter for Tuesday 9am send.`}
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-white text-xs placeholder:text-panel-muted/50 outline-none focus:border-panel-accent transition-colors resize-none leading-relaxed"
                  />
                </div>

                {aiError && (
                  <div className="flex items-start gap-2 rounded-xl border border-lamp-blocked/25 bg-lamp-blocked/8 px-3 py-2.5">
                    <AlertTriangle size={12} className="text-lamp-blocked mt-0.5 shrink-0" />
                    <p className="text-lamp-blocked text-[11px]">{aiError}</p>
                  </div>
                )}

                <button
                  onClick={generateWithAI}
                  disabled={!aiText.trim() || generating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-panel-accent text-white text-xs font-semibold disabled:opacity-50 transition-all"
                >
                  {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generating ? 'Generating workflow…' : 'Generate workflow'}
                </button>
              </div>
            )}

            {/* ── Manual Mode ── */}
            {!aiMode && !saved && (
              <>
                <div>
                  <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Workflow name</p>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Weekly content pipeline"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-panel-muted text-[10px] uppercase tracking-widest">Steps</p>
                    <button
                      onClick={addStep}
                      disabled={steps.length >= 10}
                      className="flex items-center gap-1 text-[10px] text-panel-muted hover:text-panel-accent transition-colors disabled:opacity-30"
                    >
                      <Plus size={11} /> Add step
                    </button>
                  </div>

                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {i > 0 && <ArrowRight size={10} className="text-panel-muted/40" />}
                            <span className="text-[10px] text-panel-muted font-medium">Step {i + 1}</span>
                          </div>
                          {steps.length > 1 && (
                            <button onClick={() => removeStep(i)} className="p-0.5 rounded text-panel-muted hover:text-lamp-blocked transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={step.label}
                          onChange={(e) => updateStep(i, { label: e.target.value })}
                          placeholder="Step label (e.g. Research competitors)"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
                        />
                        <AgentSelect value={step.agentId} onChange={(id) => updateStep(i, { agentId: id })} />
                        <textarea
                          value={step.instruction}
                          onChange={(e) => updateStep(i, { instruction: e.target.value })}
                          placeholder="Instruction for this agent…"
                          rows={2}
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors resize-none"
                        />
                        {/* Human Review Gate toggle — only meaningful between steps */}
                        {i < steps.length - 1 && (
                          <div className="flex items-center justify-between pt-0.5 border-t border-white/[0.06] mt-1">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck size={10} className={step.requiresGate ? 'text-amber-400' : 'text-panel-muted/40'} />
                              <span className="text-[10px] text-panel-muted">Human Review Gate after this step</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateStep(i, { requiresGate: !step.requiresGate })}
                              className={cn('relative w-8 h-4 rounded-full transition-colors shrink-0', step.requiresGate ? 'bg-amber-500' : 'bg-white/15')}
                            >
                              <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform', step.requiresGate ? 'translate-x-4' : 'translate-x-0.5')} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Post-save actions ── */}
            {saved && (
              <div className="space-y-3">
                <div className="rounded-xl border border-lamp-done/20 bg-lamp-done/5 px-3 py-2.5">
                  <p className="text-lamp-done text-xs font-medium">"{saved.name}" saved</p>
                  <p className="text-panel-muted text-[10px] mt-0.5">Test it first or go live straight away.</p>
                </div>

                {/* Test run panel */}
                {testRuns[saved.id] && <TestResultPanel run={testRuns[saved.id]} steps={saved.steps as WorkflowStep[]} />}

                <div className="flex gap-2">
                  <button
                    onClick={() => runWorkflow(saved.id, true)}
                    disabled={testRuns[saved.id]?.status === 'TEST_RUNNING'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-panel-accent/30 bg-panel-accent/10 text-panel-accent hover:bg-panel-accent/20 disabled:opacity-50 text-xs font-medium transition-all"
                  >
                    {testRuns[saved.id]?.status === 'TEST_RUNNING'
                      ? <Loader2 size={11} className="animate-spin" />
                      : <FlaskConical size={11} />}
                    {testRuns[saved.id] ? 'Re-test' : 'Test first'}
                  </button>
                  <button
                    onClick={() => runWorkflow(saved.id, false)}
                    disabled={runningId === saved.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-panel-accent text-white hover:bg-panel-accent/80 disabled:opacity-50 text-xs font-semibold transition-all"
                  >
                    {runningId === saved.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Play size={11} />}
                    Go live
                  </button>
                </div>

                <button
                  onClick={resetBuild}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-panel-muted/60 hover:text-panel-muted text-[11px] transition-colors"
                >
                  <RotateCcw size={10} /> Build another
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {tab === 'build' && !saved && !aiMode && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10 shrink-0 flex gap-2">
          <button
            onClick={saveWorkflow}
            disabled={!valid || saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save workflow'}
          </button>
        </div>
      )}

      {tab === 'saved' && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10 shrink-0 flex justify-end">
          <button
            onClick={() => { setTab('build'); resetBuild() }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-panel-accent/15 text-panel-accent text-xs font-medium hover:bg-panel-accent/25 transition-all"
          >
            <Plus size={11} /> New workflow
          </button>
        </div>
      )}
    </motion.div>
  )
}
