'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Star, TrendingUp, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { useAgentsStore } from '@/stores/agents.store'

interface Evolution {
  id: string
  agentId: string
  level: number
  xp: number
  title: string
  skills: string[]
  tasksComplete: number
  progressPct: number
  nextThreshold: number
  lastLevelUpAt: string | null
  agent: { name: string; role: string; avatarUrl: string; status: string }
}

const LEVEL_COLORS = [
  'from-gray-400 to-gray-500',
  'from-green-400 to-emerald-500',
  'from-blue-400 to-cyan-500',
  'from-violet-400 to-purple-500',
  'from-orange-400 to-amber-500',
  'from-rose-400 to-pink-500',
  'from-yellow-300 to-orange-400',
  'from-cyan-300 to-blue-400',
  'from-fuchsia-400 to-violet-500',
  'from-amber-300 to-yellow-400',
]

const BADGE_BG = [
  'bg-gray-500/20 border-gray-500/30 text-gray-300',
  'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
  'bg-violet-500/20 border-violet-500/30 text-violet-300',
  'bg-amber-500/20 border-amber-500/30 text-amber-300',
  'bg-pink-500/20 border-pink-500/30 text-pink-300',
  'bg-orange-500/20 border-orange-500/30 text-orange-300',
  'bg-blue-500/20 border-blue-500/30 text-blue-300',
  'bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300',
  'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
]

function EvolutionCard({ evo }: { evo: Evolution }) {
  const [expanded, setExpanded] = useState(false)
  const colorIdx = Math.min(evo.level - 1, LEVEL_COLORS.length - 1)

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        {/* Avatar + level ring */}
        <div className="relative shrink-0">
          <div className={cn('w-10 h-10 rounded-full p-[2px] bg-gradient-to-br', LEVEL_COLORS[colorIdx])}>
            <img src={evo.agent.avatarUrl} alt={evo.agent.name} className="w-full h-full rounded-full object-cover" />
          </div>
          <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-panel-bg border border-white/20 rounded-full w-5 h-5 flex items-center justify-center text-white">
            {evo.level}
          </span>
        </div>

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-[13px] font-semibold truncate">{evo.agent.name}</p>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', BADGE_BG[colorIdx])}>
              {evo.title}
            </span>
          </div>
          {/* XP bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full bg-gradient-to-r', LEVEL_COLORS[colorIdx])}
                initial={{ width: 0 }}
                animate={{ width: `${evo.progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[9px] text-panel-muted shrink-0">{evo.xp} XP</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-panel-muted">{evo.tasksComplete} tasks</span>
          {expanded ? <ChevronDown size={12} className="text-panel-muted" /> : <ChevronRight size={12} className="text-panel-muted" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-3 border-t border-white/[0.06]">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'Level', value: evo.level },
                  { label: 'Tasks', value: evo.tasksComplete },
                  { label: 'Progress', value: `${evo.progressPct}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                    <p className="text-white text-sm font-bold">{value}</p>
                    <p className="text-panel-muted text-[9px]">{label}</p>
                  </div>
                ))}
              </div>

              {/* Unlocked skills */}
              {evo.skills.length > 0 && (
                <div className="mt-3">
                  <p className="text-[9px] text-panel-muted uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Sparkles size={9} /> Unlocked Skills
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {evo.skills.map((skill) => (
                      <span key={skill} className="text-[9px] px-2 py-0.5 rounded-full bg-panel-accent/15 border border-panel-accent/25 text-panel-accent">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {evo.lastLevelUpAt && (
                <p className="text-[9px] text-panel-muted/50 mt-2">
                  Last leveled up {new Date(evo.lastLevelUpAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface Props { onClose: () => void }

export function AgentEvolutionPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const agents = useAgentsStore((s) => s.agents)
  const [evolutions, setEvolutions] = useState<Evolution[]>([])
  const [loading, setLoading] = useState(true)
  const [totalXp, setTotalXp] = useState(0)
  const [avgLevel, setAvgLevel] = useState(0)

  useEffect(() => {
    setLoading(true)
    authFetch(`${API}/api/evolution`)
      .then((r) => r.json())
      .then((d) => {
        const evos: Evolution[] = d.evolutions ?? []
        setEvolutions(evos)
        setTotalXp(evos.reduce((s, e) => s + e.xp, 0))
        setAvgLevel(evos.length ? Math.round(evos.reduce((s, e) => s + e.level, 0) / evos.length) : 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [API, authFetch, agents.length])

  return (
    <>
      <motion.div
        key="evo-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ x: `calc(-50% + ${offset.x}px)`, y: `calc(-50% + ${offset.y}px)` }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(620px,calc(100vw-240px))] max-h-[78vh] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div onMouseDown={onDragStart} className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0 cursor-move select-none">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/30 flex items-center justify-center">
            <TrendingUp size={14} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-white text-sm font-bold">Agent Evolution</h2>
            <p className="text-panel-muted text-[10px]">Your team grows stronger with every task</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Office summary */}
        {!loading && evolutions.length > 0 && (
          <div className="flex items-center gap-px border-b border-white/[0.07] shrink-0">
            {[
              { icon: <Star size={12} className="text-amber-400" />, label: 'Avg Level', value: avgLevel },
              { icon: <Zap size={12} className="text-panel-accent" />, label: 'Total XP', value: totalXp.toLocaleString() },
              { icon: <TrendingUp size={12} className="text-emerald-400" />, label: 'Agents', value: evolutions.length },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex-1 flex flex-col items-center py-3 gap-0.5">
                <div className="flex items-center gap-1">{icon}<span className="text-white text-sm font-bold">{value}</span></div>
                <span className="text-panel-muted text-[9px]">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-2">
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          )}
          {!loading && evolutions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <TrendingUp size={32} className="text-white/10" />
              <p className="text-panel-muted text-sm text-center">Complete tasks with your agents<br />to start building their evolution.</p>
            </div>
          )}
          {!loading && evolutions.map((evo) => <EvolutionCard key={evo.id} evo={evo} />)}
        </div>
      </motion.div>
    </>
  )
}
