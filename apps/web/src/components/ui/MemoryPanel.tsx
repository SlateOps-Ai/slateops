'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Brain, Pencil, Check, Zap, User, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface Memory {
  id:               string
  key:              string
  value:            string
  memoryType:       string
  source:           'AUTO' | 'MANUAL'
  taskId:           string | null
  taskTitle:        string | null
  taskCompletedAt:  string | null
  confidence:       number | null
  createdAt:        string
  updatedAt:        string
}

interface MemoryPanelProps {
  agentId:   string
  agentName: string
  onClose:   () => void
}

function ConfidenceDot({ value }: { value: number | null }) {
  if (value === null) return null
  const color =
    value >= 0.8 ? 'bg-lamp-done' :
    value >= 0.5 ? 'bg-lamp-idle' :
    'bg-lamp-blocked'
  return (
    <span
      title={`Confidence: ${Math.round(value * 100)}%`}
      className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1', color)}
    />
  )
}

function SourceBadge({ source }: { source: 'AUTO' | 'MANUAL' }) {
  return source === 'AUTO' ? (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium bg-panel-accent/15 text-panel-accent">
      <Zap size={8} /> auto
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium bg-white/10 text-panel-muted">
      <User size={8} /> manual
    </span>
  )
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

interface MemoryCardProps {
  memory:   Memory
  onDelete: (id: string) => void
  onSave:   (id: string, value: string) => Promise<void>
}

function MemoryCard({ memory, onDelete, onSave }: MemoryCardProps) {
  const [expanded,  setExpanded]  = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [editValue, setEditValue] = useState(memory.value)
  const [saving,    setSaving]    = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function handleSave() {
    if (!editValue.trim() || editValue === memory.value) { setEditing(false); return }
    setSaving(true)
    await onSave(memory.id, editValue.trim())
    setSaving(false)
    setEditing(false)
  }

  const isLong = memory.value.length > 120

  return (
    <motion.div
      layout
      className="group rounded-xl border border-white/5 bg-white/5 hover:border-white/10 transition-colors overflow-hidden"
    >
      <div className="px-3 py-2.5">
        {/* Key row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <ConfidenceDot value={memory.confidence} />
          <p className="text-panel-accent text-[10px] font-semibold uppercase tracking-wide truncate flex-1">
            {memory.key.replace(/_/g, ' ')}
          </p>
          <SourceBadge source={memory.source} />
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => { setEditing(true); setEditValue(memory.value); setTimeout(() => textRef.current?.focus(), 50) }}
              className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Edit"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={() => onDelete(memory.id)}
              className="p-1 rounded text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
              title="Delete"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>

        {/* Value */}
        {editing ? (
          <div className="space-y-1.5">
            <textarea
              ref={textRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-white/5 border border-panel-accent/40 px-2 py-1.5 text-white text-xs outline-none resize-none"
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-1 rounded text-panel-muted text-[10px] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 rounded bg-panel-accent text-white text-[10px] font-medium disabled:opacity-50"
              >
                {saving ? '…' : <><Check size={9} /> Save</>}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={cn('text-white text-xs leading-relaxed break-words', !expanded && isLong && 'line-clamp-3')}>
              {memory.value}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-0.5 text-[9px] text-panel-muted hover:text-white transition-colors mt-0.5"
              >
                {expanded ? <><ChevronUp size={9} /> less</> : <><ChevronDown size={9} /> more</>}
              </button>
            )}
          </>
        )}
      </div>

      {/* Provenance footer */}
      <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
        {memory.taskTitle && (
          <span
            className="text-[9px] text-panel-muted truncate max-w-[160px]"
            title={memory.taskTitle}
          >
            from: {memory.taskTitle}
          </span>
        )}
        <span className="text-[9px] text-white/20 ml-auto shrink-0">
          {timeAgo(memory.updatedAt)}
        </span>
      </div>
    </motion.div>
  )
}

export function MemoryPanel({ agentId, agentName, onClose }: MemoryPanelProps) {
  const [memories, setMemories]   = useState<Memory[]>([])
  const [loading,  setLoading]    = useState(true)
  const [adding,   setAdding]     = useState(false)
  const [newKey,   setNewKey]     = useState('')
  const [newVal,   setNewVal]     = useState('')
  const [saving,   setSaving]     = useState(false)
  const [filter,   setFilter]     = useState<'ALL' | 'AUTO' | 'MANUAL'>('ALL')
  const keyRef    = useRef<HTMLInputElement>(null)
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL

  useEffect(() => {
    authFetch(`${API}/api/agents/${agentId}/memory`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId, API, authFetch])

  async function addManual() {
    if (!newKey.trim() || !newVal.trim()) return
    setSaving(true)
    const res  = await authFetch(`${API}/api/agents/${agentId}/memory`, {
      method: 'PUT',
      body:   JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
    })
    const data = await res.json()
    setMemories((prev) => {
      const idx = prev.findIndex((m) => m.key === data.memory.key)
      if (idx >= 0) { const next = [...prev]; next[idx] = data.memory; return next }
      return [data.memory, ...prev]
    })
    setNewKey(''); setNewVal(''); setAdding(false); setSaving(false)
  }

  async function editMemory(id: string, value: string) {
    const res  = await authFetch(`${API}/api/agents/${agentId}/memory/id/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify({ value }),
    })
    const data = await res.json()
    setMemories((prev) => prev.map((m) => m.id === id ? { ...m, ...data.memory } : m))
  }

  async function deleteMemory(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id))
    await authFetch(`${API}/api/agents/${agentId}/memory/id/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const displayed = memories.filter((m) =>
    filter === 'ALL' ? true : m.source === filter
  )

  const autoCount   = memories.filter((m) => m.source === 'AUTO').length
  const manualCount = memories.filter((m) => m.source === 'MANUAL').length

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="fixed right-4 top-16 bottom-24 z-50 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg backdrop-blur-sm overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Brain size={13} className="text-panel-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{agentName}'s Memory</p>
          <p className="text-panel-muted text-[10px]">
            {autoCount} learned · {manualCount} manual
          </p>
        </div>
        <button
          onClick={() => { setAdding(true); setTimeout(() => keyRef.current?.focus(), 50) }}
          title="Add manual memory"
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {(['ALL', 'AUTO', 'MANUAL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex-1 py-1.5 text-[10px] font-medium transition-colors',
              filter === f
                ? 'text-white border-b border-panel-accent'
                : 'text-panel-muted hover:text-white'
            )}
          >
            {f === 'ALL' ? `All (${memories.length})` : f === 'AUTO' ? `Learned (${autoCount})` : `Manual (${manualCount})`}
          </button>
        ))}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden shrink-0"
          >
            <div className="p-3 space-y-2">
              <input
                ref={keyRef}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Key (e.g. preferred_tone)"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
              />
              <textarea
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="Value…"
                rows={2}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={addManual}
                  disabled={!newKey.trim() || !newVal.trim() || saving}
                  className="flex-1 py-1.5 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewKey(''); setNewVal('') }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-panel-muted text-xs hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-none">
        {loading && (
          <p className="text-panel-muted text-xs text-center mt-8">Loading…</p>
        )}

        {!loading && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-8 px-4 text-center">
            <Brain size={20} className="text-panel-muted/40" />
            <p className="text-panel-muted text-xs">
              {filter === 'AUTO'
                ? `${agentName} hasn't learned anything yet. Complete a task to see learned memories.`
                : filter === 'MANUAL'
                ? 'No manual memories. Click + to add one.'
                : `${agentName} will learn as you work together.`}
            </p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {displayed.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              onDelete={deleteMemory}
              onSave={editMemory}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer legend */}
      {memories.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 text-[9px] text-panel-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-lamp-done" /> High confidence
          </span>
          <span className="flex items-center gap-1 text-[9px] text-panel-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-lamp-idle" /> Medium
          </span>
          <span className="flex items-center gap-1 text-[9px] text-panel-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-lamp-blocked" /> Low
          </span>
        </div>
      )}
    </motion.div>
  )
}
