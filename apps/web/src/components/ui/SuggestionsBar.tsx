'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RotateCw, X, ChevronRight } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

const REFRESH_INTERVAL = 3 * 60 * 1000 // 3 minutes

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
  const authFetch = useAuthFetch()
  const agents    = useAgentsStore((s) => s.agents)
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [dismissed,   setDismissed]   = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [spinning,    setSpinning]    = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const avatarMap = Object.fromEntries(agents.map((a) => [a.id, a.avatarUrl]))

  const load = useCallback(async (manual = false) => {
    if (!agents.length) return
    if (manual) setSpinning(true)
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/agents/suggestions`)
      const data = await res.json()
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions)
        setDismissed(false)
      }
    } catch { /* silent */ } finally {
      setLoading(false)
      if (manual) setTimeout(() => setSpinning(false), 600)
    }
  }, [agents.length, API, authFetch])

  // Initial load + auto-refresh every 3 minutes
  useEffect(() => {
    load()
    timerRef.current = setInterval(() => load(), REFRESH_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [load])

  if (dismissed || (!loading && !suggestions.length)) return null

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          <div className="rounded-xl border border-white/10 bg-panel-bg/90 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <Sparkles size={11} className="text-panel-accent shrink-0" />
              <p className="text-panel-muted text-[10px] font-medium uppercase tracking-widest flex-1">
                Your team suggests
              </p>
              <button
                onClick={() => load(true)}
                title="Refresh suggestions"
                className="p-0.5 text-panel-muted hover:text-white transition-colors"
              >
                <RotateCw
                  size={11}
                  className={cn('transition-transform duration-500', spinning && 'animate-spin')}
                />
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-0.5 text-panel-muted hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            </div>

            {/* Suggestion chips */}
            {loading && !suggestions.length ? (
              <div className="flex gap-2 px-3 py-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse flex-1" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                {suggestions.map((s, i) => {
                  const avatar = avatarMap[s.agentId]
                  return (
                    <button
                      key={i}
                      onClick={() => { onSelect(s.command); setDismissed(true) }}
                      title={s.rationale}
                      className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-panel-accent/40 pl-1.5 pr-3 py-1.5 text-left transition-all"
                    >
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={s.agentName}
                          className="w-5 h-5 rounded-full object-cover shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-panel-accent/20 flex items-center justify-center text-[8px] text-panel-accent shrink-0 font-semibold">
                          {s.agentName[0]}
                        </span>
                      )}
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-panel-muted/60 text-[9px] leading-none mb-0.5">{s.agentName}</span>
                        <span className="text-white text-[11px] leading-snug truncate max-w-[200px]">{s.command}</span>
                      </div>
                      <ChevronRight size={10} className="text-panel-muted group-hover:text-panel-accent transition-colors shrink-0 ml-0.5" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
