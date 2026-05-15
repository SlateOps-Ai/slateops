'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Store, Star, Download, Check, Loader2, Search, Sparkles } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES } from '@/lib/agent-templates'

interface Props { onClose: () => void }

export function AgentMarketplace({ onClose }: Props) {
  const authFetch  = useAuthFetch()
  const addAgent   = useAgentsStore((s) => s.addAgent)
  const API        = process.env.NEXT_PUBLIC_API_URL

  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('All')
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed,  setInstalled]  = useState<Set<string>>(new Set())
  const [selected,   setSelected]   = useState<typeof AGENT_TEMPLATES[0] | null>(null)

  const filtered = AGENT_TEMPLATES.filter((t) => {
    const matchesCategory = category === 'All' || t.category === category
    const matchesSearch   = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  async function install(template: typeof AGENT_TEMPLATES[0]) {
    setInstalling(template.id)
    try {
      const res  = await authFetch(`${API}/api/marketplace/install`, {
        method: 'POST',
        body:   JSON.stringify({ templateId: template.id }),
      })
      const data = await res.json()
      if (data.agent) {
        addAgent(data.agent)
        setInstalled((prev) => new Set([...prev, template.id]))
      }
    } catch { /* silent */ } finally {
      setInstalling(null)
      setSelected(null)
    }
  }

  return (
    <motion.div
      key="marketplace-panel"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-[56px] right-4 z-50 w-[380px] max-h-[calc(100vh-72px)] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
        <Store size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">Agent Marketplace</span>
        <span className="text-[9px] text-white/25">{AGENT_TEMPLATES.length} agents</span>
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06] shrink-0 space-y-2">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <Search size={11} className="text-panel-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="flex-1 bg-transparent text-white text-[11px] placeholder-panel-muted/50 outline-none"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-[9px] font-semibold transition-all border',
                category === cat
                  ? 'bg-panel-accent border-panel-accent text-white'
                  : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template detail overlay */}
      {selected && (
        <div className="absolute inset-0 z-10 bg-panel-bg flex flex-col rounded-2xl">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
            <button onClick={() => setSelected(null)} className="text-panel-muted hover:text-white text-[10px] transition-colors">← Back</button>
            <span className="text-[12px] font-semibold text-white flex-1 truncate">{selected.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
            <div className="text-center">
              <div className="text-5xl mb-2">{selected.avatarEmoji}</div>
              <p className="text-white font-semibold text-sm">{selected.name}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Star size={10} className="text-amber-400 fill-amber-400" />
                <span className="text-amber-400 text-[10px]">{selected.rating}</span>
                <span className="text-panel-muted text-[10px]">· {selected.installs.toLocaleString()} installs</span>
              </div>
              <div className="flex gap-1 justify-center mt-2">
                {selected.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-panel-accent/10 border border-panel-accent/20 text-panel-accent text-[9px]">{tag}</span>
                ))}
              </div>
            </div>
            <p className="text-white/70 text-[11px] leading-relaxed">{selected.description}</p>
            <div>
              <p className="text-[9px] text-panel-muted uppercase tracking-widest mb-2">Starter memory</p>
              <div className="space-y-1">
                {selected.memory.map((m) => (
                  <div key={m} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                    <Sparkles size={9} className="text-panel-accent shrink-0 mt-0.5" />
                    <p className="text-white/60 text-[10px]">{m}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => install(selected)}
              disabled={installing === selected.id || installed.has(selected.id)}
              className={cn(
                'w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all flex items-center justify-center gap-2',
                installed.has(selected.id)
                  ? 'bg-lamp-done/20 border border-lamp-done/30 text-lamp-done'
                  : 'bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white shadow-sm disabled:opacity-50',
              )}
            >
              {installing === selected.id
                ? <Loader2 size={14} className="animate-spin" />
                : installed.has(selected.id)
                ? <><Check size={14} /> Installed</>
                : <><Download size={14} /> Install agent</>}
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Search size={24} className="text-white/10" />
            <p className="text-white/30 text-xs">No agents match your search</p>
          </div>
        ) : filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className="w-full text-left rounded-xl border border-white/10 bg-white/[0.025] hover:bg-white/[0.05] hover:border-panel-accent/30 transition-all p-3"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{t.avatarEmoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-[12px] font-semibold truncate">{t.name}</p>
                  {installed.has(t.id) && <Check size={10} className="text-lamp-done shrink-0" />}
                </div>
                <p className="text-panel-muted text-[10px] mt-0.5 line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex items-center gap-0.5">
                    <Star size={9} className="text-amber-400 fill-amber-400" />
                    <span className="text-amber-400 text-[9px]">{t.rating}</span>
                  </div>
                  <span className="text-panel-muted/40 text-[9px]">{t.installs.toLocaleString()} installs</span>
                  <div className="flex gap-1 ml-auto">
                    {t.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded-full bg-panel-accent/10 text-panel-accent text-[8px]">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
