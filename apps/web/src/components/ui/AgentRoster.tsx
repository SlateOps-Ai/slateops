'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { MemoryPanel } from '@/components/ui/MemoryPanel'
import { cn } from '@/lib/utils'
import type { AgentStatus } from '@agentcity/types'

const STATUS_COLOR: Record<AgentStatus, string> = {
  IDLE:    'bg-lamp-idle',
  WORKING: 'bg-lamp-working animate-pulse-slow',
  BLOCKED: 'bg-lamp-blocked',
  OFFLINE: 'bg-white/20',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE:    'idle',
  WORKING: 'working',
  BLOCKED: 'needs input',
  OFFLINE: 'offline',
}

export function AgentRoster() {
  const agents        = useAgentsStore((s) => s.agents)
  const activeTaskIds = useAgentsStore((s) => s.activeTaskIds)
  const [openMemory, setOpenMemory] = useState<{ id: string; name: string } | null>(null)
  const router = useRouter()

  return (
    <>
      <aside className="absolute right-4 top-16 bottom-16 z-20 w-52 flex flex-col gap-2">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() =>
              setOpenMemory(
                openMemory?.id === agent.id ? null : { id: agent.id, name: agent.name }
              )
            }
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-sm text-left w-full transition-all',
              openMemory?.id === agent.id
                ? 'bg-white/10 border-panel-accent/50'
                : 'bg-panel-bg border-white/10 hover:bg-white/10 hover:border-white/20'
            )}
          >
            <div className="relative shrink-0">
              <Image
                src={agent.avatarUrl}
                alt={agent.name}
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-panel-bg',
                  STATUS_COLOR[agent.status]
                )}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{agent.name}</p>
              <p className="text-panel-muted text-[10px] truncate">
                {STATUS_LABEL[agent.status]}
                {agent.status === 'WORKING' && activeTaskIds[agent.id] && ' …'}
              </p>
            </div>
          </button>
        ))}

        <button
          onClick={() => router.push('/onboarding')}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 w-full text-left text-panel-muted hover:text-white hover:border-white/30 hover:bg-white/5 transition-all mt-auto"
        >
          <UserPlus size={14} className="shrink-0" />
          <span className="text-xs">Hire another agent</span>
        </button>
      </aside>

      <AnimatePresence>
        {openMemory && (
          <MemoryPanel
            key={openMemory.id}
            agentId={openMemory.id}
            agentName={openMemory.name}
            onClose={() => setOpenMemory(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
