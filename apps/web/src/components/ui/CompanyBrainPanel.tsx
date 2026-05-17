'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Brain, Search, Sparkles, Trash2, Plus, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { CompanyDocumentsSection } from '@/components/ui/CompanyDocumentsSection'

interface BrainNode {
  id: string
  topic: string
  content: string
  category: string
  importance: number
  accessCount: number
  linkedAgentIds: string[]
  createdAt: string
}

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  task_output: { label: 'Task Output', color: 'text-cyan-400',    bg: 'bg-cyan-400/15 border-cyan-400/30' },
  decision:    { label: 'Decision',    color: 'text-amber-400',   bg: 'bg-amber-400/15 border-amber-400/30' },
  learning:    { label: 'Learning',    color: 'text-blue-400',    bg: 'bg-blue-400/15 border-blue-400/30' },
  client:      { label: 'Client',      color: 'text-emerald-400', bg: 'bg-emerald-400/15 border-emerald-400/30' },
  process:     { label: 'Process',     color: 'text-violet-400',  bg: 'bg-violet-400/15 border-violet-400/30' },
  market:      { label: 'Market',      color: 'text-rose-400',    bg: 'bg-rose-400/15 border-rose-400/30' },
  general:     { label: 'General',     color: 'text-panel-muted', bg: 'bg-white/5 border-white/10' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const IMPORTANCE_DOTS = [
  'bg-white/20', 'bg-blue-400/60', 'bg-emerald-400/70', 'bg-amber-400/80', 'bg-rose-400',
]

interface Props { onClose: () => void }

export function CompanyBrainPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const [nodes, setNodes] = useState<BrainNode[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<{ id: string; topic: string; category: string }[]>([])
  const [asking, setAsking] = useState(false)
  const [showAsk, setShowAsk] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('learning')
  const [saving, setSaving] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    authFetch(`${API}/api/brain`)
      .then((r) => r.json())
      .then((d) => setNodes(d.nodes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [API, authFetch])

  const filtered = nodes.filter((n) => {
    if (filter !== 'all' && n.category !== filter) return false
    if (search && !n.topic.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function askBrain() {
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer('')
    setSources([])
    try {
      const res = await authFetch(`${API}/api/brain/query`, {
        method: 'POST',
        body: JSON.stringify({ question }),
      })
      const d = await res.json()
      setAnswer(d.answer ?? '')
      setSources(d.sources ?? [])
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch { setAnswer('Failed to query the brain.') }
    finally { setAsking(false) }
  }

  async function addNode() {
    if (!newTopic.trim() || !newContent.trim() || saving) return
    setSaving(true)
    try {
      const res = await authFetch(`${API}/api/brain/node`, {
        method: 'POST',
        body: JSON.stringify({ topic: newTopic, content: newContent, category: newCategory }),
      })
      const d = await res.json()
      if (d.node) { setNodes((p) => [d.node, ...p]); setNewTopic(''); setNewContent(''); setShowAdd(false) }
    } catch {}
    finally { setSaving(false) }
  }

  async function deleteNode(id: string) {
    await authFetch(`${API}/api/brain/node/${id}`, { method: 'DELETE' })
    setNodes((p) => p.filter((n) => n.id !== id))
  }

  const categories = ['all', ...Object.keys(CATEGORY_META)]
  const categoryCount = (cat: string) => cat === 'all' ? nodes.length : nodes.filter((n) => n.category === cat).length

  return (
    <>
      <motion.div
        key="brain-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ x: `calc(-50% + ${offset.x}px)`, y: `calc(-50% + ${offset.y}px)` }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(780px,calc(100vw-240px))] max-h-[82vh] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div onMouseDown={onDragStart} className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0 cursor-move select-none">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400/20 to-blue-500/20 border border-violet-400/30 flex items-center justify-center">
            <Brain size={14} className="text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-white text-sm font-bold">Company Brain</h2>
            <p className="text-panel-muted text-[10px]">{nodes.length} knowledge nodes · Your office's institutional memory</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAsk((v) => !v); setShowAdd(false) }}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all', showAsk ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 border border-white/10 text-panel-muted hover:text-white')}
            >
              <MessageSquare size={11} /> Ask
            </button>
            <button
              onClick={() => { setShowAdd((v) => !v); setShowAsk(false) }}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all', showAdd ? 'bg-panel-accent/20 text-panel-accent border border-panel-accent/30' : 'bg-white/5 border border-white/10 text-panel-muted hover:text-white')}
            >
              <Plus size={11} /> Add
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Ask the Office */}
        <AnimatePresence>
          {showAsk && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }} className="border-b border-white/[0.07] shrink-0"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-violet-400 shrink-0" />
                  <span className="text-xs text-white font-medium">Ask the Office</span>
                  <span className="text-[9px] text-panel-muted">— query your entire knowledge base</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && askBrain()}
                    placeholder="What did we learn about our pricing last month?"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-panel-muted/50 outline-none focus:border-violet-500/50"
                  />
                  <button
                    onClick={askBrain}
                    disabled={!question.trim() || asking}
                    className="px-3 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {asking ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                    {asking ? 'Thinking…' : 'Ask'}
                  </button>
                </div>
                {answer && (
                  <div ref={answerRef} className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 space-y-2">
                    <p className="text-white text-xs leading-relaxed">{answer}</p>
                    {sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-white/[0.06]">
                        <span className="text-[9px] text-panel-muted mr-1">Sources:</span>
                        {sources.map((s) => {
                          const meta = CATEGORY_META[s.category] ?? CATEGORY_META.general
                          return (
                            <span key={s.id} className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', meta.bg, meta.color)}>
                              {s.topic}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add node form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }} className="border-b border-white/[0.07] shrink-0"
            >
              <div className="p-4 space-y-2">
                <p className="text-xs text-white font-medium flex items-center gap-1.5"><Plus size={11} className="text-panel-accent" /> Add Knowledge Node</p>
                <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Topic or insight title"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-panel-muted/50 outline-none focus:border-panel-accent/50" />
                <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="What was learned, decided, or observed?"
                  rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-panel-muted/50 outline-none focus:border-panel-accent/50 resize-none" />
                <div className="flex items-center gap-2">
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none">
                    {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={addNode} disabled={saving || !newTopic.trim() || !newContent.trim()}
                    className="px-4 py-2 rounded-lg bg-panel-accent/20 border border-panel-accent/30 text-panel-accent text-xs font-medium hover:bg-panel-accent/30 transition-all disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter + search bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] shrink-0 overflow-x-auto scrollbar-none">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat]
            const count = categoryCount(cat)
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border shrink-0 transition-all',
                  filter === cat
                    ? (meta ? `${meta.bg} ${meta.color}` : 'bg-white/10 border-white/20 text-white')
                    : 'bg-transparent border-white/[0.06] text-panel-muted hover:border-white/15 hover:text-white/70'
                )}
              >
                {meta?.label ?? 'All'} <span className="opacity-60">{count}</span>
              </button>
            )
          })}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 shrink-0">
            <Search size={10} className="text-panel-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="bg-transparent text-white text-[10px] outline-none w-24 placeholder-panel-muted/50" />
          </div>
        </div>

        {/* Nodes grid */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {/* Uploaded company documents — sits inside the scroll area so it
              moves with the knowledge node list rather than competing for
              vertical space. */}
          <CompanyDocumentsSection />

          <div className="p-4">
          {loading && (
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Brain size={40} className="text-white/10" />
              {nodes.length === 0 ? (
                <div className="text-center space-y-1">
                  <p className="text-panel-muted text-sm">Your Company Brain is empty.</p>
                  <p className="text-panel-muted/60 text-[11px]">Task outputs are auto-ingested here as your agents work. Complete a task to start building knowledge.</p>
                </div>
              ) : (
                <p className="text-panel-muted text-sm">No nodes match your filter.</p>
              )}
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((node) => {
                const meta = CATEGORY_META[node.category] ?? CATEGORY_META.general
                return (
                  <div key={node.id} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] p-3 transition-colors flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium', meta.bg, meta.color)}>
                            {meta.label}
                          </span>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map((i) => (
                              <span key={i} className={cn('w-1 h-1 rounded-full', i <= node.importance ? IMPORTANCE_DOTS[node.importance - 1] : 'bg-white/10')} />
                            ))}
                          </div>
                        </div>
                        <p className="text-white text-[11px] font-medium leading-tight truncate">{node.topic}</p>
                      </div>
                      <button onClick={() => deleteNode(node.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-panel-muted hover:text-red-400 transition-all">
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <p className="text-panel-muted text-[10px] leading-relaxed line-clamp-3">{node.content}</p>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <p className="text-[9px] text-panel-muted/40">{timeAgo(node.createdAt)}</p>
                      <div className="flex items-center gap-1">
                        {node.category === 'task_output' && (
                          <span className="text-[8px] text-cyan-400/60">⚡ auto</span>
                        )}
                        {node.accessCount > 0 && (
                          <span className="text-[9px] text-panel-muted/40">{node.accessCount}×</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      </motion.div>
    </>
  )
}
