'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, BookOpen, Plus, Trash2, Loader2, FileText } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface KBItem {
  id:        string
  title:     string
  content:   string
  createdAt: string
}

interface Props {
  agentId:   string
  agentName: string
  onClose:   () => void
}

export function KnowledgePanel({ agentId, agentName, onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [items,   setItems]   = useState<KBItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    authFetch(`${API}/api/agents/${agentId}/knowledge`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId, API, authFetch])

  async function addItem() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const res  = await authFetch(`${API}/api/agents/${agentId}/knowledge`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: title.trim(), content: content.trim() }),
      })
      const data = await res.json()
      setItems((prev) => [data.item, ...prev])
      setTitle('')
      setContent('')
      setAdding(false)
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    await authFetch(`${API}/api/agents/${agentId}/knowledge/${itemId}`, {
      method: 'DELETE',
    }).catch(() => {})
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed right-4 top-16 z-50 w-80 max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <BookOpen size={13} className="text-panel-accent" />
        <span className="text-white text-sm font-medium flex-1 truncate">{agentName} · Knowledge</span>
        <button
          onClick={() => setAdding((a) => !a)}
          className="p-1 rounded-lg text-panel-muted hover:text-panel-accent hover:bg-white/10 transition-colors"
          title="Add item"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-3 py-3 border-b border-white/10 space-y-2 shrink-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Brand voice guidelines)"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your knowledge here — brand docs, FAQs, style guides, product details…"
            rows={5}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 rounded-lg text-panel-muted text-xs hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addItem}
              disabled={!title.trim() || !content.trim() || saving}
              className="px-3 py-1.5 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all flex items-center gap-1"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading && (
          <div className="flex justify-center pt-8">
            <Loader2 size={16} className="text-panel-muted animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-8 px-4 text-center">
            <FileText size={20} className="text-panel-muted/40" />
            <p className="text-panel-muted text-xs">No knowledge items yet.</p>
            <p className="text-panel-muted/60 text-[10px]">
              Add brand docs, FAQs, or product info. The agent will reference them automatically when relevant.
            </p>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="group px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
                <p className="text-panel-muted text-[10px] mt-0.5 line-clamp-2 leading-relaxed">
                  {item.content}
                </p>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-panel-muted hover:text-lamp-blocked transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
