'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Play, Trash2, BookMarked, ChevronDown, ChevronUp, GripVertical, Loader2, Check } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { cn } from '@/lib/utils'

interface PlaybookStep { id: string; command: string }
interface Playbook {
  id:          string
  name:        string
  description: string
  steps:       PlaybookStep[]
  createdAt:   string
  runCount:    number
}

interface Props { onClose: () => void }

export function PlaybooksPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()

  const [playbooks,    setPlaybooks]    = useState<Playbook[]>([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [running,      setRunning]      = useState<string | null>(null)
  const [runDone,      setRunDone]      = useState<string | null>(null)
  const [expanded,     setExpanded]     = useState<string | null>(null)

  // New playbook form state
  const [showForm,     setShowForm]     = useState(false)
  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [steps,        setSteps]        = useState<string[]>([''])

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${API}/api/playbooks`)
      const data = await res.json()
      setPlaybooks(data.playbooks ?? [])
    } catch { /* silent */ } finally { setLoading(false) }
  }, [API, authFetch])

  useEffect(() => { load() }, [load])

  async function savePlaybook() {
    const validSteps = steps.filter((s) => s.trim())
    if (!name.trim() || validSteps.length === 0) return
    setCreating(true)
    try {
      const res  = await authFetch(`${API}/api/playbooks`, {
        method: 'POST',
        body:   JSON.stringify({ name: name.trim(), description: description.trim(), steps: validSteps }),
      })
      const data = await res.json()
      if (data.playbook) {
        setPlaybooks((prev) => [data.playbook, ...prev])
        setShowForm(false); setName(''); setDescription(''); setSteps([''])
      }
    } catch { /* silent */ } finally { setCreating(false) }
  }

  async function runPlaybook(id: string) {
    setRunning(id)
    try {
      await authFetch(`${API}/api/playbooks/${id}/run`, { method: 'POST' })
      setPlaybooks((prev) => prev.map((p) => p.id === id ? { ...p, runCount: p.runCount + 1 } : p))
      setRunDone(id)
      setTimeout(() => setRunDone(null), 2500)
    } catch { /* silent */ } finally { setRunning(null) }
  }

  async function deletePlaybook(id: string) {
    setPlaybooks((prev) => prev.filter((p) => p.id !== id))
    await authFetch(`${API}/api/playbooks/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <>
    <motion.div
      key="playbooks-panel"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ x: `calc(-50% + ${offset.x}px)`, y: `calc(-50% + ${offset.y}px)` }}
      className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-240px))] max-h-[70vh] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0 cursor-move select-none">
        <BookMarked size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">Playbooks</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-panel-accent/15 border border-panel-accent/30 text-panel-accent text-[10px] hover:bg-panel-accent/25 transition-all"
        >
          <Plus size={10} /> New
        </button>
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence initial={false}>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-white/[0.07] overflow-hidden shrink-0"
          >
            <div className="px-3 py-3 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Playbook name…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-[11px] placeholder-panel-muted/50 outline-none focus:border-panel-accent/50"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-[11px] placeholder-panel-muted/50 outline-none focus:border-panel-accent/50"
              />
              <p className="text-[9px] text-panel-muted/60 uppercase tracking-widest">Steps (run in order)</p>
              {steps.map((step, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <GripVertical size={10} className="text-panel-muted/30 shrink-0" />
                  <span className="text-[9px] text-panel-muted/50 w-3 shrink-0">{i + 1}</span>
                  <input
                    value={step}
                    onChange={(e) => setSteps((prev) => prev.map((s, j) => j === i ? e.target.value : s))}
                    placeholder={`Command ${i + 1}…`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-white text-[11px] placeholder-panel-muted/50 outline-none focus:border-panel-accent/50"
                  />
                  {steps.length > 1 && (
                    <button onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))} className="text-panel-muted hover:text-lamp-blocked transition-colors shrink-0">
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setSteps((prev) => [...prev, ''])}
                className="text-[10px] text-panel-accent/70 hover:text-panel-accent transition-colors flex items-center gap-1"
              >
                <Plus size={9} /> Add step
              </button>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={savePlaybook}
                  disabled={creating || !name.trim() || steps.filter(Boolean).length === 0}
                  className="flex-1 py-1.5 rounded-lg bg-panel-accent text-white text-[11px] font-medium hover:bg-panel-accent/80 transition-all disabled:opacity-40"
                >
                  {creating ? 'Saving…' : 'Save playbook'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-white/10 text-panel-muted text-[11px] hover:text-white transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-none pb-3">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-panel-muted" />
          </div>
        )}
        {!loading && playbooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 px-6 text-center">
            <BookMarked size={24} className="text-panel-muted/30" />
            <p className="text-panel-muted text-[11px]">No playbooks yet. Create one to save a sequence of commands you run often.</p>
          </div>
        )}
        {playbooks.map((pb) => (
          <div key={pb.id} className="border-b border-white/[0.05] last:border-0">
            <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-white text-[12px] font-semibold truncate">{pb.name}</p>
                {pb.description && <p className="text-panel-muted text-[10px] truncate mt-0.5">{pb.description}</p>}
                <p className="text-panel-muted/40 text-[9px] mt-0.5">{pb.steps.length} step{pb.steps.length !== 1 ? 's' : ''} · ran {pb.runCount}×</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setExpanded((v) => v === pb.id ? null : pb.id)}
                  className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all"
                  title="View steps"
                >
                  {expanded === pb.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                <button
                  onClick={() => runPlaybook(pb.id)}
                  disabled={running === pb.id}
                  className={cn(
                    'p-1.5 rounded-lg transition-all',
                    runDone === pb.id
                      ? 'text-lamp-done bg-lamp-done/10'
                      : 'text-panel-accent hover:bg-panel-accent/15',
                  )}
                  title="Run playbook"
                >
                  {running === pb.id ? <Loader2 size={11} className="animate-spin" /> : runDone === pb.id ? <Check size={11} /> : <Play size={11} />}
                </button>
                <button
                  onClick={() => deletePlaybook(pb.id)}
                  className="p-1.5 rounded-lg text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-all"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {expanded === pb.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-1">
                    {pb.steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[8px] text-panel-muted shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-white/70 text-[10px] leading-relaxed">{step.command}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
    </>
  )
}
