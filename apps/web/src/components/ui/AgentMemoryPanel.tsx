'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Brain, Plus, Trash2, Edit3, Check, ChevronDown,
  Bot, Sparkles, User, Loader2,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

interface Memory {
  id:              string
  key:             string
  value:           string
  source:          'AUTO' | 'MANUAL'
  confidence:      number | null
  taskId:          string | null
  taskTitle:       string | null
  taskCompletedAt: string | null
  createdAt:       string
  updatedAt:       string
}

interface Props { onClose: () => void }

function ConfidenceDot({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null
  const color =
    confidence >= 0.8 ? 'bg-lamp-done' :
    confidence >= 0.5 ? 'bg-lamp-idle' : 'bg-lamp-blocked'
  return (
    <span
      title={`Confidence: ${Math.round(confidence * 100)}%`}
      className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', color)}
    />
  )
}

export function AgentMemoryPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const agents    = useAgentsStore((s) => s.agents)

  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '')
  const [memories,   setMemories]   = useState<Memory[]>([])
  const [loading,    setLoading]    = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editValue,  setEditValue]  = useState('')
  const [addingKey,  setAddingKey]  = useState('')
  const [addingVal,  setAddingVal]  = useState('')
  const [showAdd,    setShowAdd]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [agentOpen,  setAgentOpen]  = useState(false)

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  useEffect(() => {
    if (!selectedAgentId) return
    setLoading(true)
    authFetch(`${API}/api/agents/${selectedAgentId}/memory`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedAgentId, API, authFetch])

  async function saveEdit(mem: Memory) {
    setSaving(true)
    try {
      await authFetch(`${API}/api/agents/${selectedAgentId}/memory/${mem.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ value: editValue }),
      })
      setMemories((prev) => prev.map((m) => m.id === mem.id ? { ...m, value: editValue } : m))
      setEditingId(null)
    } catch { /* non-fatal */ }
    finally { setSaving(false) }
  }

  async function deleteMemory(mem: Memory) {
    try {
      await authFetch(`${API}/api/agents/${selectedAgentId}/memory/id/${mem.id}`, { method: 'DELETE' })
      setMemories((prev) => prev.filter((m) => m.id !== mem.id))
    } catch { /* non-fatal */ }
  }

  async function addMemory() {
    if (!addingKey.trim() || !addingVal.trim()) return
    setSaving(true)
    try {
      const res = await authFetch(`${API}/api/agents/${selectedAgentId}/memory`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: addingKey.trim(), value: addingVal.trim() }),
      })
      const data = await res.json()
      if (data.memory) {
        setMemories((prev) => {
          const existing = prev.findIndex((m) => m.id === data.memory.id)
          return existing >= 0
            ? prev.map((m, i) => i === existing ? { ...m, ...data.memory, taskTitle: null, taskCompletedAt: null } : m)
            : [{ ...data.memory, taskTitle: null, taskCompletedAt: null }, ...prev]
        })
      }
      setAddingKey('')
      setAddingVal('')
      setShowAdd(false)
    } catch { /* non-fatal */ }
    finally { setSaving(false) }
  }

  const autoMemories   = memories.filter((m) => m.source === 'AUTO')
  const manualMemories = memories.filter((m) => m.source === 'MANUAL')

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-60 top-16 bottom-4 z-30 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Brain size={13} className="text-panel-accent shrink-0" />
        <span className="text-white text-xs font-medium flex-1">Agent Memory</span>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Agent selector */}
      <div className="px-3 pt-3 pb-2 border-b border-white/10 shrink-0">
        <div className="relative">
          <button
            onClick={() => setAgentOpen((o) => !o)}
            className="flex items-center gap-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white hover:border-white/20 transition-colors"
          >
            {selectedAgent ? (
              <>
                <img src={selectedAgent.avatarUrl} alt={selectedAgent.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                <span className="flex-1 text-left truncate">{selectedAgent.name}</span>
              </>
            ) : (
              <span className="flex-1 text-left text-panel-muted">Select agent…</span>
            )}
            <ChevronDown size={11} className="text-panel-muted" />
          </button>
          {agentOpen && (
            <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-white/10 bg-panel-bg shadow-xl overflow-hidden">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAgentId(a.id); setAgentOpen(false) }}
                  className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors',
                    a.id === selectedAgentId ? 'bg-panel-accent/15 text-white' : 'text-white/80 hover:bg-white/5'
                  )}
                >
                  <img src={a.avatarUrl} alt={a.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                  <span className="flex-1 text-left truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-4">
        {loading && (
          <div className="flex items-center justify-center pt-8 gap-2 text-panel-muted text-xs">
            <Loader2 size={13} className="animate-spin" /> Loading memories…
          </div>
        )}

        {!loading && memories.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-8 text-center">
            <Brain size={20} className="text-panel-muted/30" />
            <p className="text-panel-muted text-xs">No memories yet.</p>
            <p className="text-panel-muted/60 text-[10px]">Memories are extracted automatically after tasks complete.</p>
          </div>
        )}

        {/* Add memory form */}
        {showAdd && (
          <div className="rounded-xl border border-panel-accent/25 bg-panel-accent/5 p-3 space-y-2">
            <p className="text-panel-muted text-[10px] uppercase tracking-widest">Add memory</p>
            <input
              type="text"
              value={addingKey}
              onChange={(e) => setAddingKey(e.target.value)}
              placeholder="Key (e.g. preferred_tone)"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
            />
            <textarea
              value={addingVal}
              onChange={(e) => setAddingVal(e.target.value)}
              placeholder="Value (the fact to remember)"
              rows={2}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={addMemory}
                disabled={saving || !addingKey.trim() || !addingVal.trim()}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                Save
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddingKey(''); setAddingVal('') }}
                className="px-3 py-1.5 rounded-lg bg-white/8 text-panel-muted text-xs hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Auto memories */}
        {!loading && autoMemories.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={10} className="text-panel-accent" />
              <p className="text-panel-muted text-[9px] uppercase tracking-widest">Auto-learned ({autoMemories.length})</p>
            </div>
            <div className="space-y-1.5">
              {autoMemories.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  mem={mem}
                  editingId={editingId}
                  editValue={editValue}
                  saving={saving}
                  onEdit={(m) => { setEditingId(m.id); setEditValue(m.value) }}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  onDelete={deleteMemory}
                  onEditChange={setEditValue}
                />
              ))}
            </div>
          </div>
        )}

        {/* Manual memories */}
        {!loading && manualMemories.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <User size={10} className="text-panel-muted" />
              <p className="text-panel-muted text-[9px] uppercase tracking-widest">Manual ({manualMemories.length})</p>
            </div>
            <div className="space-y-1.5">
              {manualMemories.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  mem={mem}
                  editingId={editingId}
                  editValue={editValue}
                  saving={saving}
                  onEdit={(m) => { setEditingId(m.id); setEditValue(m.value) }}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  onDelete={deleteMemory}
                  onEditChange={setEditValue}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {!showAdd && (
        <div className="px-3 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/15 text-panel-muted hover:text-white hover:border-white/25 text-xs transition-colors"
          >
            <Plus size={11} /> Add memory
          </button>
        </div>
      )}
    </motion.div>
  )
}

function MemoryCard({
  mem, editingId, editValue, saving,
  onEdit, onSave, onCancel, onDelete, onEditChange,
}: {
  mem:          Memory
  editingId:    string | null
  editValue:    string
  saving:       boolean
  onEdit:       (m: Memory) => void
  onSave:       (m: Memory) => void
  onCancel:     () => void
  onDelete:     (m: Memory) => void
  onEditChange: (v: string) => void
}) {
  const isEditing = editingId === mem.id

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-2.5 group">
      <div className="flex items-start gap-1.5 mb-1">
        <ConfidenceDot confidence={mem.confidence} />
        <span className="text-panel-accent text-[10px] font-mono font-medium flex-1 truncate">{mem.key}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onEdit(mem)}
            className="p-0.5 rounded text-panel-muted hover:text-white transition-colors"
          >
            <Edit3 size={10} />
          </button>
          <button
            onClick={() => onDelete(mem)}
            className="p-0.5 rounded text-panel-muted hover:text-lamp-blocked transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-1.5">
          <textarea
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-lg bg-white/5 border border-panel-accent/40 px-2 py-1.5 text-white text-xs outline-none resize-none"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => onSave(mem)}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-panel-accent text-white text-[10px] font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} Save
            </button>
            <button onClick={onCancel} className="px-2 py-1 rounded-lg bg-white/8 text-panel-muted text-[10px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-white/80 text-[11px] leading-relaxed">{mem.value}</p>
      )}

      {/* Provenance */}
      {mem.taskTitle && (
        <p className="text-panel-muted/50 text-[9px] mt-1.5 truncate">
          From: {mem.taskTitle}
        </p>
      )}
      <p className="text-panel-muted/30 text-[9px] mt-0.5">
        {new Date(mem.updatedAt).toLocaleDateString()}
        {mem.source === 'AUTO' ? ' · auto' : ' · manual'}
      </p>
    </div>
  )
}
