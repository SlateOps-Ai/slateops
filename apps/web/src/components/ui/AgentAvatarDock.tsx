'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lightbulb, AlertTriangle, TrendingUp, Megaphone } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import type { AgentNotification } from '@/stores/agents.store'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { cn } from '@/lib/utils'
import { AGENT_ROLE_LABELS } from '@agentcity/types'
import type { AgentStatus } from '@agentcity/types'

const VISIBLE_MESSAGES = 3

const DOOR_PIXI = { x: 80, y: 680 }

const NOTIF_AUTO_DISMISS_MS = 14_000

const NOTIF_ICON: Record<AgentNotification['type'], React.ReactNode> = {
  insight:     <Lightbulb     size={11} className="text-amber-400" />,
  alert:       <AlertTriangle size={11} className="text-red-400" />,
  opportunity: <TrendingUp    size={11} className="text-emerald-400" />,
  update:      <Megaphone     size={11} className="text-panel-accent" />,
}

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
  const setActiveChatAgent     = useAgentsStore((s) => s.setActiveChatAgent)
  const arrivingAgentIds       = useAgentsStore((s) => s.arrivingAgentIds)
  const markAgentArrived       = useAgentsStore((s) => s.markAgentArrived)
  const agentNotifications     = useAgentsStore((s) => s.agentNotifications)
  const dismissAgentNotification = useAgentsStore((s) => s.dismissAgentNotification)
  const threads                = useAgentsStore((s) => s.threads)

  // Auto-dismiss notifications after NOTIF_AUTO_DISMISS_MS. One timer per (agentId, notif.id).
  const scheduledRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const [agentId, n] of Object.entries(agentNotifications)) {
      if (!n) continue
      const key = `${agentId}:${n.id}`
      if (scheduledRef.current.has(key)) continue
      scheduledRef.current.add(key)
      setTimeout(() => {
        dismissAgentNotification(agentId)
        scheduledRef.current.delete(key)
      }, NOTIF_AUTO_DISMISS_MS)
    }
  }, [agentNotifications, dismissAgentNotification])

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

        const isSelected = activeChatAgentId === agent.id
        const role = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role

        function toggle() {
          setActiveChatAgent(agent.id)
        }

        // Last N messages for the selected agent — shown stacked above the avatar
        const messages = threads[agent.id] ?? []
        const visibleStart = Math.max(0, messages.length - VISIBLE_MESSAGES)
        const visibleMessages = isSelected ? messages.slice(visibleStart) : []
        const earlierCount = isSelected ? visibleStart : 0

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
            {/* Bubbles column above the avatar — chat reply (closest to avatar) + notification (above) */}
            <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-3 flex flex-col items-center gap-2 pointer-events-none">
              <AnimatePresence>
                {agentNotifications[agent.id] && (
                  <motion.div
                    key={agentNotifications[agent.id]!.id}
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="pointer-events-auto w-[230px] rounded-xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm cursor-default"
                  >
                    <div className="flex items-start gap-2 p-2.5">
                      <span className="mt-0.5 shrink-0">{NOTIF_ICON[agentNotifications[agent.id]!.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] text-panel-muted">{agent.name} · just now</p>
                        <p className="text-white text-[10px] font-medium mt-0.5 leading-snug">
                          {agentNotifications[agent.id]!.headline}
                        </p>
                      </div>
                      <button
                        onClick={() => dismissAgentNotification(agent.id)}
                        className="text-panel-muted hover:text-white shrink-0 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat thread for selected agent — last N messages stacked, newest closest to avatar */}
              {isSelected && earlierCount > 0 && (
                <p className="text-[9px] text-panel-muted/60 italic pointer-events-none">↑ {earlierCount} earlier</p>
              )}
              <AnimatePresence>
                {visibleMessages.map((msg, i) => (
                  <MessageBubble
                    key={visibleStart + i}
                    message={msg}
                    messageIndex={visibleStart + i}
                    agentId={agent.id}
                    agentName={agent.name}
                  />
                ))}
              </AnimatePresence>
            </div>

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
