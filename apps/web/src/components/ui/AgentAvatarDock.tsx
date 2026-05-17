'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lightbulb, AlertTriangle, TrendingUp, Megaphone, RotateCcw, Plug } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import type { AgentNotification } from '@/stores/agents.store'
import { SlateText } from '@/components/ui/SlateText'
import { HandoffPath } from '@/components/ui/HandoffPath'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'
import { AGENT_ROLE_LABELS, findCatalogApp, canRoleUseApp } from '@agentcity/types'
import type { AgentStatus, AgentRole } from '@agentcity/types'

const DOOR_PIXI = { x: 80, y: 680 }

const NOTIF_AUTO_DISMISS_MS = 14_000

const NOTIF_ICON: Record<AgentNotification['type'], React.ReactNode> = {
  insight:     <Lightbulb     size={11} className="text-amber-400" />,
  alert:       <AlertTriangle size={11} className="text-red-400" />,
  opportunity: <TrendingUp    size={11} className="text-emerald-400" />,
  update:      <Megaphone     size={11} className="text-panel-accent" />,
  grant:       <Plug          size={11} className="text-panel-accent" />,
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
// not as isolated workers at the far edges of the office. Horizontal spread is
// widened to accommodate the 72px avatars (was 48px) without crowding.
const SLOT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 400, y: 420 }, // back-far-left
  { x: 880, y: 420 }, // back-far-right
  { x: 550, y: 420 }, // back-mid-left
  { x: 730, y: 420 }, // back-mid-right
  { x: 490, y: 560 }, // front-left
  { x: 790, y: 560 }, // front-right
]

const CANVAS_W = 1280
const CANVAS_H = 800
// Camera starts centred at (640, 420) so offset is 0 on a 1280×800 screen
const CAM_CX = 640
const CAM_CY = 420

function relativeAgo(iso: string | Date | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const diff = Math.max(0, Date.now() - t)
  const min  = Math.floor(diff / 60_000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

export function AgentAvatarDock() {
  const agents                 = useAgentsStore((s) => s.agents)
  const tasks                  = useAgentsStore((s) => s.tasks)
  const activeChatAgentId      = useAgentsStore((s) => s.activeChatAgentId)
  const teamChatOpen           = useAgentsStore((s) => s.teamChatOpen)
  const setActiveChatAgent     = useAgentsStore((s) => s.setActiveChatAgent)
  const setTeamChatOpen        = useAgentsStore((s) => s.setTeamChatOpen)
  const arrivingAgentIds       = useAgentsStore((s) => s.arrivingAgentIds)
  const markAgentArrived       = useAgentsStore((s) => s.markAgentArrived)
  const agentNotifications     = useAgentsStore((s) => s.agentNotifications)
  const dismissAgentNotification = useAgentsStore((s) => s.dismissAgentNotification)
  const pushAgentNotification    = useAgentsStore((s) => s.pushAgentNotification)
  const agentPositions         = useAgentsStore((s) => s.agentPositions)
  const setAgentPosition       = useAgentsStore((s) => s.setAgentPosition)
  const resetAllAgentPositions = useAgentsStore((s) => s.resetAllAgentPositions)
  const draggingAppName        = useAgentsStore((s) => s.draggingAppName)
  const authFetch              = useAuthFetch()
  const API                    = process.env.NEXT_PUBLIC_API_URL

  // Per-render ref to distinguish drag-then-release from click. Indexed by agentId.
  const dragStateRef = useRef<Record<string, { startX: number; startY: number; baseX: number; baseY: number; dragged: boolean }>>({})

  // ── Handoff detection ─────────────────────────────────────────────────────
  // Pair each "agent just stopped WORKING" with a "different agent just started
  // WORKING" within HANDOFF_WINDOW_MS and render an animated path between them.
  const prevStatusRef = useRef<Record<string, AgentStatus>>({})
  const recentStopRef = useRef<{ agentId: string; at: number } | null>(null)
  const handoffSeqRef = useRef(0)
  const [handoffs, setHandoffs] = useState<Array<{
    id:     string
    fromX:  number; fromY: number
    toX:    number; toY:   number
  }>>([])

  const HANDOFF_WINDOW_MS = 3500

  // Pending OAuth popups per agent — we auto-grant once the popup returns
  const pendingOauthRef = useRef<Record<string, { agentId: string; requestId: string; composioAppName: string }>>({})

  // The agentId currently being hovered by a shelf drag (for the drop ring)
  const [dropTargetAgentId, setDropTargetAgentId] = useState<string | null>(null)

  /** Drop a shelf icon onto this agent → create a grant. Shows a quick
   *  speech bubble for feedback so the gesture feels acknowledged. If the
   *  app isn't sensible for this role, refuses politely instead — the
   *  Connections panel matrix is the override path for power users. */
  async function handleDropGrant(agentId: string, composioAppName: string) {
    const cat   = findCatalogApp(composioAppName)
    const agent = agents.find((a) => a.id === agentId)
    if (cat && agent && !canRoleUseApp(agent.role as AgentRole, cat)) {
      const roleLabel = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role
      pushAgentNotification(agentId, {
        id:        `grant-rejected-${composioAppName}-${Date.now()}`,
        type:      'alert',
        headline:  `${cat.label} isn't really my thing.`,
        body:      `${roleLabel}s don't usually use ${cat.label}. Use the Connections panel if you want to grant it anyway.`,
        createdAt: new Date().toISOString(),
      })
      return
    }
    try {
      const res = await authFetch(`${API}/api/integrations/grants`, {
        method: 'POST',
        body:   JSON.stringify({ agentId, composioAppName, mode: 'ALWAYS' }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      pushAgentNotification(agentId, {
        id:        `granted-${composioAppName}-${Date.now()}`,
        type:      'opportunity',
        headline:  `Thanks — I can use ${cat?.label ?? composioAppName} now.`,
        createdAt: new Date().toISOString(),
      })
    } catch {
      pushAgentNotification(agentId, {
        id:        `grant-failed-${Date.now()}`,
        type:      'alert',
        headline:  `Couldn't add ${cat?.label ?? composioAppName} — please try again.`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Listen for OAuth popup completion (from /oauth-callback) and finalize
  // the grant by recording the connection + responding to the request.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin)            return
      if (ev.data?.type !== 'composio_oauth_complete')     return
      const appName = ev.data?.composioAppName as string | undefined
      if (!appName) return
      const match = Object.values(pendingOauthRef.current).find((p) => p.composioAppName === appName)
      if (!match) return
      delete pendingOauthRef.current[match.agentId]
      // 1) Record the connection 2) auto-grant via respond endpoint
      authFetch(`${API}/api/integrations/callback`, {
        method: 'POST',
        body:   JSON.stringify({ composioAppName: appName }),
      }).then(() => authFetch(`${API}/api/integrations/requests/${match.requestId}/respond`, {
        method: 'POST',
        body:   JSON.stringify({ action: 'grant_always' }),
      })).then(() => dismissAgentNotification(match.agentId))
        .catch(() => {})
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [API, authFetch, dismissAgentNotification])

  async function handleGrantAction(agentId: string, notif: AgentNotification, actionId: NonNullable<AgentNotification['actions']>[number]['id']) {
    const grant = notif.grant
    if (!grant) return

    if (actionId === 'connect_and_grant') {
      // Open OAuth in popup; auto-grant on completion via the message listener above
      try {
        const res  = await authFetch(`${API}/api/integrations/connect`, {
          method: 'POST',
          body:   JSON.stringify({ composioAppName: grant.composioAppName }),
        })
        const data = await res.json()
        if (data.redirectUrl) {
          pendingOauthRef.current[agentId] = {
            agentId,
            requestId:       grant.requestId,
            composioAppName: grant.composioAppName,
          }
          window.open(data.redirectUrl, 'composio_oauth', 'width=600,height=720,popup=1')
        }
      } catch { /* swallow — user can retry */ }
      return
    }

    // grant_once | grant_always | deny — direct respond
    try {
      await authFetch(`${API}/api/integrations/requests/${grant.requestId}/respond`, {
        method: 'POST',
        body:   JSON.stringify({ action: actionId }),
      })
    } catch { /* non-fatal */ }
    dismissAgentNotification(agentId)
  }

  // Auto-dismiss notifications after NOTIF_AUTO_DISMISS_MS. Grant prompts
  // require an explicit response so they're excluded from auto-dismiss.
  const scheduledRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const [agentId, n] of Object.entries(agentNotifications)) {
      if (!n) continue
      if (n.type === 'grant') continue
      const key = `${agentId}:${n.id}`
      if (scheduledRef.current.has(key)) continue
      scheduledRef.current.add(key)
      setTimeout(() => {
        dismissAgentNotification(agentId)
        scheduledRef.current.delete(key)
      }, NOTIF_AUTO_DISMISS_MS)
    }
  }, [agentNotifications, dismissAgentNotification])

  // Watch status transitions and create handoff paths whenever one agent stops
  // working and another starts working within a short window.
  useEffect(() => {
    const now      = Date.now()
    const stoppers: string[] = []
    const starters: string[] = []

    for (const agent of agents) {
      const prev = prevStatusRef.current[agent.id]
      const next = agent.status
      if (prev === undefined) { prevStatusRef.current[agent.id] = next; continue }
      if (prev === next) continue
      if (prev === 'WORKING' && next !== 'WORKING') stoppers.push(agent.id)
      if (prev !== 'WORKING' && next === 'WORKING') starters.push(agent.id)
      prevStatusRef.current[agent.id] = next
    }
    if (stoppers.length === 0 && starters.length === 0) return

    const vwLocal = typeof window !== 'undefined' ? window.innerWidth  : CANVAS_W
    const vhLocal = typeof window !== 'undefined' ? window.innerHeight : CANVAS_H
    const screenPos = (agentId: string) => {
      const idx = agents.findIndex((a) => a.id === agentId)
      if (idx < 0) return null
      const slot = SLOT_POSITIONS[idx % SLOT_POSITIONS.length]
      const off  = agentPositions[agentId] ?? { x: 0, y: 0 }
      return {
        x: slot.x + (vwLocal / 2 - CAM_CX) + off.x,
        // anchor handoff line to top-of-avatar (avatar is 48px, center is `sy`)
        y: slot.y + (vhLocal / 2 - CAM_CY) + off.y - 24,
      }
    }

    const newHandoffs: typeof handoffs = []
    const pending = [...stoppers]

    for (const starterId of starters) {
      let fromId: string | null = null
      const idx = pending.findIndex((s) => s !== starterId)
      if (idx >= 0) {
        fromId = pending.splice(idx, 1)[0]
      } else if (
        recentStopRef.current &&
        recentStopRef.current.agentId !== starterId &&
        now - recentStopRef.current.at <= HANDOFF_WINDOW_MS
      ) {
        fromId = recentStopRef.current.agentId
        recentStopRef.current = null
      }
      if (!fromId) continue

      const from = screenPos(fromId)
      const to   = screenPos(starterId)
      if (!from || !to) continue

      newHandoffs.push({
        id:    `handoff-${now}-${++handoffSeqRef.current}`,
        fromX: from.x, fromY: from.y,
        toX:   to.x,   toY:   to.y,
      })
    }

    if (pending.length > 0) {
      recentStopRef.current = { agentId: pending[pending.length - 1], at: now }
    }
    if (newHandoffs.length > 0) {
      setHandoffs((prev) => [...prev, ...newHandoffs])
    }
    // agentPositions intentionally omitted — handoff positions are captured
    // at detection time and don't need to react to subsequent drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents])

  if (!agents.length) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth  : CANVAS_W
  const vh = typeof window !== 'undefined' ? window.innerHeight : CANVAS_H

  const hasMovedAgents = Object.keys(agentPositions).length > 0

  return (
    <>
      {/* Active handoff trails between agents */}
      {handoffs.map((h) => (
        <HandoffPath
          key={h.id}
          fromX={h.fromX} fromY={h.fromY}
          toX={h.toX}     toY={h.toY}
          onComplete={() => setHandoffs((prev) => prev.filter((p) => p.id !== h.id))}
        />
      ))}

      {/* Reset office layout — appears once any agent has been dragged */}
      <AnimatePresence>
        {hasMovedAgents && (
          <motion.button
            key="reset-layout"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            onClick={resetAllAgentPositions}
            className="fixed top-4 left-[200px] z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-panel-bg/95 backdrop-blur-sm text-panel-muted hover:text-white hover:bg-white/[0.06] transition-colors text-[11px] font-medium shadow-lg"
            title="Snap all agents back to their default desk positions"
          >
            <RotateCcw size={11} />
            Reset office layout
          </motion.button>
        )}
      </AnimatePresence>

      {agents.map((agent, index) => {
        const slotPos = SLOT_POSITIONS[index % SLOT_POSITIONS.length]

        const arrivalIdx = arrivingAgentIds.indexOf(agent.id)
        const isArriving = arrivalIdx >= 0
        const doorOffset = isArriving
          ? { x: DOOR_PIXI.x - slotPos.x, y: DOOR_PIXI.y - slotPos.y }
          : null

        // User drag offset (applied only when not arriving — don't fight the walk-in)
        const userOffset = isArriving ? { x: 0, y: 0 } : (agentPositions[agent.id] ?? { x: 0, y: 0 })

        // Map PIXI coords → screen coords, plus the user's drag offset
        const sx = slotPos.x + (vw / 2 - CAM_CX) + userOffset.x
        const sy = slotPos.y + (vh / 2 - CAM_CY) + userOffset.y

        const isSelected = teamChatOpen && activeChatAgentId === agent.id
        const role = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role

        // Most recent completed task this agent owned — used for the glance
        // line under the status. Skipped while the agent is mid-WORKING so
        // we don't crowd the "Working…" indicator with stale history.
        const lastCompleted = agent.status === 'WORKING'
          ? null
          : tasks
              .filter((t) => t.agentId === agent.id && t.status === 'COMPLETE' && t.completedAt)
              .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]
        const lastSummary = lastCompleted
          ? `${truncate(lastCompleted.title ?? lastCompleted.rawCommand ?? 'task', 28)} · ${relativeAgo(lastCompleted.completedAt) ?? ''}`.trim()
          : null

        function handleClick() {
          if (dragStateRef.current[agent.id]?.dragged) {
            // Click suppressed because the user just finished dragging
            delete dragStateRef.current[agent.id]
            return
          }
          setActiveChatAgent(agent.id)
          setTeamChatOpen(true)
        }

        function handleMouseDown(e: React.MouseEvent) {
          if (e.button !== 0 || isArriving) return
          const base = agentPositions[agent.id] ?? { x: 0, y: 0 }
          dragStateRef.current[agent.id] = {
            startX: e.clientX, startY: e.clientY,
            baseX:  base.x,    baseY:  base.y,
            dragged: false,
          }
          const onMove = (ev: MouseEvent) => {
            const s = dragStateRef.current[agent.id]
            if (!s) return
            const dx = ev.clientX - s.startX
            const dy = ev.clientY - s.startY
            if (!s.dragged && Math.hypot(dx, dy) > 5) s.dragged = true
            if (s.dragged) setAgentPosition(agent.id, { x: s.baseX + dx, y: s.baseY + dy })
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            // Leave the dragged flag for handleClick to read on the same gesture
            setTimeout(() => { delete dragStateRef.current[agent.id] }, 0)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }

        const isDropTarget = dropTargetAgentId === agent.id
        // Is the currently-dragged app a sensible fit for this agent's role?
        // Used to color the drop ring green vs amber during drag-over.
        const draggedApp     = draggingAppName ? findCatalogApp(draggingAppName) : null
        const dropFitOk      = !draggedApp || canRoleUseApp(agent.role as AgentRole, draggedApp)

        return (
          <motion.button
            key={agent.id}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/composio-app')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'link'
                if (dropTargetAgentId !== agent.id) setDropTargetAgentId(agent.id)
              }
            }}
            onDragLeave={() => {
              if (dropTargetAgentId === agent.id) setDropTargetAgentId(null)
            }}
            onDrop={(e) => {
              const app = e.dataTransfer.getData('text/composio-app')
              setDropTargetAgentId(null)
              if (app) {
                e.preventDefault()
                handleDropGrant(agent.id, app)
              }
            }}
            className={cn(
              'absolute z-20 group -translate-x-1/2 -translate-y-1/2',
              isArriving ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
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
            {/* Speech bubble for this agent's most recent notification */}
            <AnimatePresence>
              {agentNotifications[agent.id] && (() => {
                const notif    = agentNotifications[agent.id]!
                const isGrant  = notif.type === 'grant'
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-3 rounded-xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm cursor-default',
                      isGrant ? 'w-[270px]' : 'w-[230px]',
                    )}
                  >
                    <div className="flex items-start gap-2 p-2.5">
                      <span className="mt-0.5 shrink-0">{NOTIF_ICON[notif.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] text-panel-muted">{agent.name} · just now</p>
                        <p className="text-white text-[10px] font-medium mt-0.5 leading-snug">
                          <SlateText text={notif.headline} maxDurationMs={1200} />
                        </p>
                        {isGrant && notif.body && (
                          <p className="text-panel-muted text-[9px] leading-snug mt-1">{notif.body}</p>
                        )}
                      </div>
                      <button
                        onClick={() => dismissAgentNotification(agent.id)}
                        className="text-panel-muted hover:text-white shrink-0 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    {isGrant && notif.actions && notif.actions.length > 0 && (
                      <div className="px-2.5 pb-2.5 flex flex-wrap gap-1.5">
                        {notif.actions.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => handleGrantAction(agent.id, notif, a.id)}
                            className={cn(
                              'px-2 py-1 rounded-md text-[10px] font-semibold transition-colors',
                              a.style === 'primary'
                                ? 'bg-panel-accent text-white hover:bg-panel-accent/85'
                                : a.style === 'danger'
                                ? 'bg-lamp-blocked/20 text-lamp-blocked hover:bg-lamp-blocked/30'
                                : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white',
                            )}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Tail pointing down to the avatar */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-panel-bg" />
                  </motion.div>
                )
              })()}
            </AnimatePresence>

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
              'relative w-[72px] h-[72px] rounded-full border-2 transition-all duration-200 shadow-lg',
              isDropTarget && dropFitOk
                ? 'border-emerald-400 ring-4 ring-emerald-400/40 scale-110 shadow-emerald-400/40'
                : isDropTarget && !dropFitOk
                ? 'border-amber-400 ring-4 ring-amber-400/30 scale-105 shadow-amber-400/30'
                : isSelected
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
                'absolute -bottom-1 -right-1 w-[21px] h-[21px] rounded-full border-2 border-panel-bg',
                STATUS_DOT[agent.status],
              )} />
            </div>

            {/* Name + status label + last-task glance line */}
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
              {lastSummary && (
                <span
                  className="text-[8px] text-white/40 whitespace-nowrap max-w-[180px] truncate mt-0.5"
                  title={lastCompleted?.title ?? lastCompleted?.rawCommand ?? ''}
                >
                  {lastSummary}
                </span>
              )}
            </div>
            </motion.div>
          </motion.button>
        )
      })}
    </>
  )
}
