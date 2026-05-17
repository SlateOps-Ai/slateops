'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { Brain, BookOpen, Share2, History, TrendingUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MemoryPanel } from '@/components/ui/MemoryPanel'
import { KnowledgePanel } from '@/components/ui/KnowledgePanel'
import { SessionDrillDownPanel } from '@/components/ui/SessionDrillDownPanel'
import { AgentHealthPanel } from '@/components/ui/AgentHealthPanel'
import { ShareWidget } from '@/components/ui/ShareWidget'
import { DeleteAgentDialog } from '@/components/ui/DeleteAgentDialog'

type ActionType = 'memory' | 'knowledge' | 'share' | 'sessions' | 'health'

const ACTIONS: Array<{ type: ActionType; label: string; icon: React.ReactNode }> = [
  { type: 'memory',    label: 'Memory',    icon: <Brain      size={12} /> },
  { type: 'knowledge', label: 'Knowledge', icon: <BookOpen   size={12} /> },
  { type: 'share',     label: 'Share',     icon: <Share2     size={12} /> },
  { type: 'sessions',  label: 'Sessions',  icon: <History    size={12} /> },
  { type: 'health',    label: 'Health',    icon: <TrendingUp size={12} /> },
]

interface Props {
  agentId:   string
  agentName: string
  isPublic:  boolean
}

export function AgentActionsHeader({ agentId, agentName, isPublic }: Props) {
  const [active, setActive]   = useState<ActionType | null>(null)
  const [mounted, setMounted] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function toggle(type: ActionType) {
    setActive((current) => current === type ? null : type)
  }
  function close() { setActive(null) }

  const panel = (
    <AnimatePresence>
      {active === 'memory' && (
        <MemoryPanel key={agentId + '-memory'} agentId={agentId} agentName={agentName} onClose={close} />
      )}
      {active === 'knowledge' && (
        <KnowledgePanel key={agentId + '-knowledge'} agentId={agentId} agentName={agentName} onClose={close} />
      )}
      {active === 'share' && (
        <ShareWidget key={agentId + '-share'} agentId={agentId} agentName={agentName} isPublic={isPublic} onClose={close} />
      )}
      {active === 'sessions' && (
        <SessionDrillDownPanel key={agentId + '-sessions'} agentId={agentId} agentName={agentName} onClose={close} />
      )}
      {active === 'health' && (
        <AgentHealthPanel key={agentId + '-health'} agentId={agentId} agentName={agentName} onClose={close} />
      )}
    </AnimatePresence>
  )

  return (
    <>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-1 py-0.5 shrink-0"
      >
        {ACTIONS.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => toggle(type)}
            title={label}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              active === type
                ? 'text-panel-accent bg-panel-accent/15'
                : 'text-panel-muted hover:text-white hover:bg-white/[0.06]',
            )}
          >
            {icon}
          </button>
        ))}
        {/* Destructive action lives in its own segment, separated by a thin
            divider, so it never sits adjacent to the routine actions. */}
        <span className="w-px self-stretch bg-white/[0.08] mx-0.5" aria-hidden />
        <button
          onClick={() => setDeleteOpen(true)}
          title="Delete agent"
          className="p-1.5 rounded-md text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {/* Portal to document.body so the panel escapes the chat panel's transform context */}
      {mounted ? createPortal(panel, document.body) : null}
      {mounted && deleteOpen ? createPortal(
        <DeleteAgentDialog agentId={agentId} agentName={agentName} onClose={() => setDeleteOpen(false)} />,
        document.body,
      ) : null}
    </>
  )
}
