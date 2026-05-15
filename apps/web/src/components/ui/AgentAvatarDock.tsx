'use client'

import { motion } from 'framer-motion'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'
import { AGENT_ROLE_LABELS } from '@agentcity/types'
import type { AgentStatus } from '@agentcity/types'

const DOOR_PIXI = { x: 80, y: 680 }

const STATUS_DOT: Record<AgentStatus, string> = {
  IDLE:    'bg-lamp-idle',
  WORKING: 'bg-lamp-working animate-pulse-slow',
  BLOCKED: 'bg-lamp-blocked',
  OFFLINE: 'bg-white/20',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE:    'Idle',
  WORKING: 'Working…',
  BLOCKED: 'Needs input',
  OFFLINE: 'Offline',
}

// Clustered slot positions — agents arranged closer together so they read as a team,
// not as isolated workers at the far edges of the office.
const SLOT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 480, y: 420 }, // back-far-left
  { x: 800, y: 420 }, // back-far-right
  { x: 580, y: 420 }, // back-mid-left
  { x: 700, y: 420 }, // back-mid-right
  { x: 540, y: 540 }, // front-left
  { x: 740, y: 540 }, // front-right
]

const CANVAS_W = 1280
const CANVAS_H = 800
// Camera starts centred at (640, 420) so offset is 0 on a 1280×800 screen
const CAM_CX = 640
const CAM_CY = 420

export function AgentAvatarDock() {
  const agents                 = useAgentsStore((s) => s.agents)
  const activeChatAgentId      = useAgentsStore((s) => s.activeChatAgentId)
  const teamChatOpen           = useAgentsStore((s) => s.teamChatOpen)
  const setActiveChatAgent     = useAgentsStore((s) => s.setActiveChatAgent)
  const setTeamChatOpen        = useAgentsStore((s) => s.setTeamChatOpen)
  const arrivingAgentIds       = useAgentsStore((s) => s.arrivingAgentIds)
  const markAgentArrived       = useAgentsStore((s) => s.markAgentArrived)

  if (!agents.length) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth  : CANVAS_W
  const vh = typeof window !== 'undefined' ? window.innerHeight : CANVAS_H

  return (
    <>
      {agents.map((agent, index) => {
        const slotPos = SLOT_POSITIONS[index % SLOT_POSITIONS.length]

        // Map PIXI coords → screen coords
        const sx = slotPos.x + (vw / 2 - CAM_CX)
        const sy = slotPos.y + (vh / 2 - CAM_CY)

        const isSelected = teamChatOpen && activeChatAgentId === agent.id
        const role = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role

        function toggle() {
          setActiveChatAgent(agent.id)
          setTeamChatOpen(true)
        }

        const arrivalIdx = arrivingAgentIds.indexOf(agent.id)
        const isArriving = arrivalIdx >= 0
        const doorOffset = isArriving
          ? { x: DOOR_PIXI.x - slotPos.x, y: DOOR_PIXI.y - slotPos.y }
          : null

        return (
          <motion.button
            key={agent.id}
            onClick={toggle}
            className={cn(
              'absolute z-20 group -translate-x-1/2 -translate-y-1/2 cursor-pointer',
            )}
            style={{ left: sx, top: sy }}
            {...(isArriving && doorOffset && {
              initial:    { x: doorOffset.x, y: doorOffset.y, opacity: 0 },
              animate:    { x: 0, y: 0, opacity: 1 },
              transition: {
                duration: 1.4,
                delay:    arrivalIdx * 0.7,
                ease:     [0.16, 1, 0.3, 1],
                opacity:  { duration: 0.4, delay: arrivalIdx * 0.7 },
              },
              onAnimationComplete: () => markAgentArrived(agent.id),
            })}
          >
            {/* Continuous idle bounce — inner motion layer doesn't fight the outer arrival translate */}
            <motion.div
              className="flex flex-col items-center gap-1"
              animate={isArriving ? undefined : { y: [0, -3, 0] }}
              transition={isArriving ? undefined : {
                duration: 2.4 + (index * 0.31) % 1.2, // de-sync per agent so they don't bob in lockstep
                repeat:   Infinity,
                ease:     'easeInOut',
              }}
            >
            {/* Avatar ring */}
            <div className={cn(
              'relative w-12 h-12 rounded-full border-2 transition-all duration-200 shadow-lg',
              isSelected
                ? 'border-panel-accent shadow-panel-accent/30'
                : 'border-white/20 group-hover:border-white/50',
            )}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={agent.avatarUrl}
                alt={agent.name}
                className="w-full h-full rounded-full object-cover"
              />
              {/* Status dot */}
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-panel-bg',
                STATUS_DOT[agent.status],
              )} />
            </div>

            {/* Name + status label */}
            <div className="flex flex-col items-center pointer-events-none">
              <span className="text-[11px] font-semibold text-white/90 drop-shadow-sm whitespace-nowrap">
                {agent.name}
              </span>
              <span className="text-[9px] text-white/50 whitespace-nowrap">
                {role}
              </span>
              <span className={cn(
                'text-[8px] font-medium whitespace-nowrap',
                agent.status === 'WORKING' ? 'text-lamp-working' :
                agent.status === 'BLOCKED' ? 'text-lamp-blocked' :
                'text-white/30',
              )}>
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
            </motion.div>
          </motion.button>
        )
      })}
    </>
  )
}
