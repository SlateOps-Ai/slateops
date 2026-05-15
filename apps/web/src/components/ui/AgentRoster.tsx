'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Share2, X, Copy, Check, History, TrendingUp, Brain } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { MemoryPanel } from '@/components/ui/MemoryPanel'
import { KnowledgePanel } from '@/components/ui/KnowledgePanel'
import { SessionDrillDownPanel } from '@/components/ui/SessionDrillDownPanel'
import { AgentHealthPanel } from '@/components/ui/AgentHealthPanel'
import { cn } from '@/lib/utils'
import type { AgentStatus, Task } from '@agentcity/types'
import { AGENT_ROLE_LABELS } from '@agentcity/types'

const STATUS_COLOR: Record<AgentStatus, string> = {
  IDLE:    'bg-lamp-idle',
  WORKING: 'bg-lamp-working',
  BLOCKED: 'bg-lamp-blocked',
  OFFLINE: 'bg-white/20',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE:    'Idle',
  WORKING: 'Working…',
  BLOCKED: 'Needs input',
  OFFLINE: 'Offline',
}

type Panel = 'memory' | 'knowledge' | 'share' | 'sessions' | 'health'

interface ActivePanel {
  agentId:   string
  agentName: string
  isPublic:  boolean
  type:      Panel
}

// ── Share widget ──────────────────────────────────────────────────────────────

function ShareWidget({ agentId, agentName, isPublic: initialIsPublic, onClose }: {
  agentId:   string
  agentName: string
  isPublic:  boolean
  onClose:   () => void
}) {
  const [copied,   setCopied]   = useState(false)
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)
  const authFetch   = useAuthFetch()
  const updateAgent = useAgentsStore((s) => s.updateAgent)
  const API = process.env.NEXT_PUBLIC_API_URL

  const widgetUrl  = `${window.location.origin}/widget/${agentId}`
  const embedCode  = `<iframe src="${widgetUrl}" width="380" height="600" frameborder="0" allow="microphone"></iframe>`

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function togglePublic() {
    const next = !isPublic
    setIsPublic(next)
    setToggling(true)
    try {
      await authFetch(`${API}/api/agents/${agentId}`, {
        method: 'PATCH',
        body:   JSON.stringify({ isPublic: next }),
      })
      updateAgent(agentId, { isPublic: next })
    } catch {
      setIsPublic(!next)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="fixed right-[139px] top-1/2 -translate-y-1/2 z-50 w-[384px] rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <Share2 size={13} className="text-panel-accent" />
        <span className="text-white text-sm font-medium flex-1 truncate">{agentName} · Share Widget</span>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
          <div>
            <p className="text-white text-xs font-medium">Make agent public</p>
            <p className="text-panel-muted text-[10px] mt-0.5">Required for the widget to work</p>
          </div>
          <button
            onClick={togglePublic}
            disabled={toggling}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              isPublic ? 'bg-panel-accent' : 'bg-white/10'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              isPublic ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {isPublic ? (
          <>
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Direct link</p>
              <div className="flex gap-2 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white text-[10px] flex-1 truncate">{widgetUrl}</span>
                <button onClick={() => copy(widgetUrl)} className="text-panel-muted hover:text-panel-accent transition-colors shrink-0">
                  {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Embed code</p>
              <div className="relative rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <pre className="text-white/60 text-[9px] leading-relaxed whitespace-pre-wrap break-all">{embedCode}</pre>
                <button onClick={() => copy(embedCode)} className="absolute top-2 right-2 text-panel-muted hover:text-panel-accent transition-colors">
                  {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <a
              href={widgetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2 rounded-xl bg-panel-accent/20 border border-panel-accent/30 text-panel-accent text-xs font-medium hover:bg-panel-accent/30 transition-colors"
            >
              Preview widget ↗
            </a>
          </>
        ) : (
          <p className="text-panel-muted text-xs text-center py-2">
            Enable the toggle above to get the embed link.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Agent card ────────────────────────────────────────────────────────────────

const ACTIONS: Array<{ type: Panel; label: string; icon: React.ReactNode }> = [
  { type: 'memory',    label: 'Memory',    icon: <Brain      size={12} /> },
  { type: 'knowledge', label: 'Knowledge', icon: <BookOpen   size={12} /> },
  { type: 'share',     label: 'Share',     icon: <Share2     size={12} /> },
  { type: 'sessions',  label: 'Sessions',  icon: <History    size={12} /> },
  { type: 'health',    label: 'Health',    icon: <TrendingUp size={12} /> },
]

function AgentCard({
  agentId,
  activePanel,
  onOpenPanel,
  activeTask,
  batonState,
}: {
  agentId:      string
  activePanel:  Panel | null
  onOpenPanel:  (type: Panel) => void
  activeTask:   Task | null
  batonState:   'incoming' | 'outgoing' | null
}) {
  const agent = useAgentsStore((s) => s.agents.find((a) => a.id === agentId))

  if (!agent) return null

  const isWorking = agent.status === 'WORKING'
  const role      = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role

  return (
    <motion.div
      layout
      className={cn(
        'relative rounded-xl border w-full shrink-0 overflow-hidden',
        isWorking
          ? 'border-lamp-working/40 bg-lamp-working/[0.04]'
          : batonState === 'outgoing'
          ? 'border-lamp-idle/30 bg-white/[0.03]'
          : 'border-white/[0.08] bg-white/[0.03]',
      )}
      animate={isWorking ? {
        boxShadow: [
          '0 0 0px 0px rgba(74,222,128,0)',
          '0 0 18px 3px rgba(74,222,128,0.14)',
          '0 0 0px 0px rgba(74,222,128,0)',
        ],
      } : { boxShadow: '0 0 0px 0px rgba(0,0,0,0)' }}
      transition={isWorking
        ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.4 }}
    >
      {/* Activity bar at top */}
      <AnimatePresence>
        {isWorking && (
          <motion.div
            key="activity-bar"
            className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="h-full bg-lamp-working/80"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '60%' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Baton-pass flash */}
      <AnimatePresence>
        {batonState && (
          <motion.div
            key="baton-flash"
            className={cn(
              'absolute inset-0 rounded-xl pointer-events-none',
              batonState === 'incoming' ? 'bg-lamp-working/15' : 'bg-lamp-idle/10',
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, times: [0, 0.25, 1] }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
        <div className="relative shrink-0">
          {/* Pulsing ring when working */}
          <AnimatePresence>
            {isWorking && (
              <motion.span
                key="pulse-ring"
                className="absolute inset-[-3px] rounded-full border border-lamp-working/70"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.7, 0, 0.7] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>
          <img
            src={agent.avatarUrl}
            alt={agent.name}
            className={cn(
              'w-8 h-8 rounded-full object-cover transition-all duration-300',
              isWorking && 'ring-1 ring-lamp-working/60',
            )}
          />
          <span className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-panel-bg',
            STATUS_COLOR[agent.status],
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate leading-tight">{agent.name}</p>
          <p className="text-panel-muted text-[10px] truncate">{role}</p>
          <p className={cn(
            'text-[10px] font-medium',
            agent.status === 'WORKING'  ? 'text-lamp-working' :
            agent.status === 'BLOCKED'  ? 'text-lamp-blocked' :
            'text-panel-muted/60',
          )}>
            {STATUS_LABEL[agent.status]}
          </p>
        </div>
      </div>

      {/* Active task — expands when working */}
      <AnimatePresence initial={false}>
        {isWorking && activeTask && (
          <motion.div
            key="active-task"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-lamp-working/10">
              <p className="text-[9px] uppercase tracking-widest text-lamp-working/55 mb-0.5">Working on</p>
              <p className="text-white/75 text-[10px] leading-snug line-clamp-2">{activeTask.title}</p>
              {/* Shimmer progress bar */}
              <div className="mt-1.5 h-0.5 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className="h-full w-[55%] bg-lamp-working/60 rounded-full"
                  animate={{ x: ['-100%', '210%'] }}
                  transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

{/* Action buttons */}
      <div className="grid grid-cols-5 px-2 pb-2.5 gap-1">
        {ACTIONS.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => onOpenPanel(type)}
            title={label}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg transition-all text-[8px]',
              activePanel === type
                ? 'text-panel-accent bg-panel-accent/10'
                : 'text-panel-muted hover:text-white hover:bg-white/[0.08]',
            )}
          >
            {icon}
            <span>{label.slice(0, 3)}</span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Agent roster ──────────────────────────────────────────────────────────────

export function AgentRoster() {
  const agents       = useAgentsStore((s) => s.agents)
  const tasks        = useAgentsStore((s) => s.tasks)
  const activeTaskIds = useAgentsStore((s) => s.activeTaskIds)

  const [activePanel,  setActivePanel]  = useState<ActivePanel | null>(null)
  const [batonStates,  setBatonStates]  = useState<Record<string, 'incoming' | 'outgoing'>>({})
  const prevWorkingRef = useRef<Set<string>>(new Set())

  // Detect agent handoffs — when one stops working and another starts
  useEffect(() => {
    const currentWorking = new Set(
      agents.filter((a) => a.status === 'WORKING').map((a) => a.id)
    )
    const prev = prevWorkingRef.current

    const justStarted = [...currentWorking].filter((id) => !prev.has(id))
    const justStopped = [...prev].filter((id) => !currentWorking.has(id))

    if (justStarted.length > 0 && justStopped.length > 0) {
      const next: Record<string, 'incoming' | 'outgoing'> = {}
      justStarted.forEach((id) => { next[id] = 'incoming' })
      justStopped.forEach((id) => { next[id] = 'outgoing' })
      setBatonStates(next)
      const t = setTimeout(() => setBatonStates({}), 1100)
      return () => clearTimeout(t)
    }

    prevWorkingRef.current = currentWorking
  }, [agents])

  if (!agents.length) return null

  function openPanel(agentId: string, type: Panel) {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    setActivePanel(
      activePanel?.agentId === agentId && activePanel?.type === type
        ? null
        : { agentId, agentName: agent.name, isPublic: agent.isPublic ?? false, type },
    )
  }

  function closePanel() { setActivePanel(null) }

  return (
    <>
      {/* Agents panel */}
      <div className="absolute right-4 top-[60px] bottom-4 z-30 w-[200px] flex flex-col bg-panel-bg/96 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07] shrink-0">
          <span className="text-[11px] font-semibold text-white tracking-wide">Agents</span>
          <div className="flex items-center gap-1.5">
            {agents.some((a) => a.status === 'WORKING') && (
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-lamp-working"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            <span className="text-[9px] font-medium text-panel-muted">{agents.length}</span>
          </div>
        </div>

        {/* Scrollable cards */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-2 flex flex-col gap-2">
          {agents.map((agent) => {
            const taskId     = activeTaskIds[agent.id]
            const activeTask = taskId
              ? (tasks.find((t) => t.id === taskId) ?? null)
              : (tasks.find((t) => t.agentId === agent.id && t.status === 'IN_PROGRESS') ?? null)

            return (
              <AgentCard
                key={agent.id}
                agentId={agent.id}
                activePanel={activePanel?.agentId === agent.id ? activePanel.type : null}
                onOpenPanel={(type) => openPanel(agent.id, type)}
                activeTask={activeTask}
                batonState={batonStates[agent.id] ?? null}
              />
            )
          })}
        </div>
      </div>

      {/* Panels — rendered outside the scroll container */}
      <AnimatePresence>
        {activePanel?.type === 'memory' && (
          <MemoryPanel
            key={activePanel.agentId + '-memory'}
            agentId={activePanel.agentId}
            agentName={activePanel.agentName}
            onClose={closePanel}
          />
        )}
        {activePanel?.type === 'knowledge' && (
          <KnowledgePanel
            key={activePanel.agentId + '-knowledge'}
            agentId={activePanel.agentId}
            agentName={activePanel.agentName}
            onClose={closePanel}
          />
        )}
        {activePanel?.type === 'share' && (
          <ShareWidget
            key={activePanel.agentId + '-share'}
            agentId={activePanel.agentId}
            agentName={activePanel.agentName}
            isPublic={activePanel.isPublic}
            onClose={closePanel}
          />
        )}
        {activePanel?.type === 'sessions' && (
          <SessionDrillDownPanel
            key={activePanel.agentId + '-sessions'}
            agentId={activePanel.agentId}
            agentName={activePanel.agentName}
            onClose={closePanel}
          />
        )}
        {activePanel?.type === 'health' && (
          <AgentHealthPanel
            key={activePanel.agentId + '-health'}
            agentId={activePanel.agentId}
            agentName={activePanel.agentName}
            onClose={closePanel}
          />
        )}
      </AnimatePresence>
    </>
  )
}
