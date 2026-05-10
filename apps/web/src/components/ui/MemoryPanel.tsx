'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Memory { key: string; value: string }

interface MemoryPanelProps {
  agentId:   string
  agentName: string
  onClose:   () => void
}

export function MemoryPanel({ agentId, agentName, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [adding, setAdding]     = useState(false)
  const [newKey, setNewKey]     = useState('')
  const [newVal, setNewVal]     = useState('')
  const [saving, setSaving]     = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)

  const API = process.env.NEXT_PUBLIC_API_URL

  useEffect(() => {
    fetch(`${API}/api/agents/${agentId}/memory`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {})
  }, [agentId, API])

  async function save() {
    if (!newKey.trim() || !newVal.trim()) return
    setSaving(true)
    const res = await fetch(`${API}/api/agents/${agentId}/memory`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
    })
    const data = await res.json()
    setMemories((prev) => {
      const idx = prev.findIndex((m) => m.key === data.memory.key)
      if (idx >= 0) { const next = [...prev]; next[idx] = data.memory; return next }
      return [data.memory, ...prev]
    })
    setNewKey(''); setNewVal(''); setAdding(false); setSaving(false)
  }

  async function remove(key: string) {
    await fetch(`${API}/api/agents/${agentId}/memory/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    setMemories((prev) => prev.filter((m) => m.key !== key))
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-60 top-16 bottom-16 z-30 w-72 flex flex-col rounded-2xl border border-white/10 bg-panel-bg backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex-1">
          <p className="text-white text-xs font-medium">{agentName}'s memory</p>
          <p className="text-panel-muted text-[10px]">{memories.length} {memories.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        <button
          onClick={() => { setAdding(true); setTimeout(() => keyRef.current?.focus(), 50) }}
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
                placeholder="Key (e.g. brand_voice)"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder-panel-muted outline-none focus:border-panel-accent transition-colors"
              />
              <textarea
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="Value…"
                rows={2}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder-panel-muted outline-none focus:border-panel-accent transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={!newKey.trim() || !newVal.trim() || saving}
                  className="flex-1 py-1.5 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50"
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {memories.length === 0 && (
          <p className="text-panel-muted text-xs text-center mt-8 px-4">
            No memories yet. {agentName} will learn as you work together.
          </p>
        )}
        {memories.map((m) => (
          <div
            key={m.key}
            className="group rounded-xl border border-white/5 bg-white/5 px-3 py-2 hover:border-white/10 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-panel-accent text-[10px] font-medium uppercase tracking-wide truncate">
                  {m.key.replace(/_/g, ' ')}
                </p>
                <p className="text-white text-xs mt-0.5 leading-relaxed break-words">{m.value}</p>
              </div>
              <button
                onClick={() => remove(m.key)}
                className={cn(
                  'p-1 rounded shrink-0 text-panel-muted transition-colors',
                  'opacity-0 group-hover:opacity-100 hover:text-lamp-blocked'
                )}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
