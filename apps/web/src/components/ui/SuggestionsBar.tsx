'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ChevronRight, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'

interface Suggestion {
  agentId:   string
  agentName: string
  command:   string
  rationale: string
}

interface SuggestionsBarProps {
  onSelect: (command: string) => void
}

export function SuggestionsBar({ onSelect }: SuggestionsBarProps) {
  const authFetch  = useAuthFetch()
  const agents     = useAgentsStore((s) => s.agents)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [dismissed, setDismissed]     = useState(false)
  const [loading, setLoading]         = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL

  const load = useCallback(async () => {
    if (!agents.length) return
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/agents/suggestions`)
      const data = await res.json()
      if (data.suggestions?.length) setSuggestions(data.suggestions)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [agents.length, API, authFetch])

  useEffect(() => { load() }, [load])

  if (dismissed || (!loading && !suggestions.length)) return null

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4"
        >
          <div className="rounded-xl border border-white/10 bg-panel-bg/90 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <Sparkles size={11} className="text-panel-accent shrink-0" />
              <p className="text-panel-muted text-[10px] font-medium uppercase tracking-widest flex-1">
                Your team suggests
              </p>
              <button
                onClick={() => setDismissed(true)}
                className="text-panel-muted hover:text-white transition-colors p-0.5"
              >
                <X size={12} />
              </button>
            </div>

            {loading ? (
              <div className="flex gap-2 px-3 py-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-7 rounded-lg bg-white/5 animate-pulse flex-1" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { onSelect(s.command); setDismissed(true) }}
                    className="group flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-panel-accent/40 px-2.5 py-1.5 text-left transition-all"
                    title={`${s.agentName} · ${s.rationale}`}
                  >
                    <span className="text-white text-xs truncate max-w-[200px]">{s.command}</span>
                    <ChevronRight size={10} className="text-panel-muted group-hover:text-panel-accent transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
