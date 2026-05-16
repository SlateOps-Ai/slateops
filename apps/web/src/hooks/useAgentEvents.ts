'use client'

import { useEffect, useRef } from 'react'
import { createActor } from 'xstate'
import { useAuth } from '@clerk/nextjs'
import type { AgentEvent } from '@agentcity/types'
import { connectSocket, onAgentEvent } from '@/lib/socket'
import { directorMachine } from '@/lib/machines/director.machine'
import { useAgentsStore } from '@/stores/agents.store'
import type { EvolutionToast } from '@/stores/agents.store'
import { useGamificationStore } from '@/stores/gamification.store'
import type { GamificationUpdate } from '@/stores/gamification.store'
import type { OfficeScene } from '@/lib/pixi/scene'
import { agentDeskKey } from '@/lib/pixi/scene'

export function useAgentEvents(scene: OfficeScene | null) {
  const { getToken } = useAuth()
  const {
    agents,
    setDirectorActor,
    updateStatus,
    setActiveTask,
    setPendingApproval,
    upsertTask,
    setCompletedTask,
    setEvolutionToast,
    pushAgentNotification,
  } = useAgentsStore()

  const applyGamificationUpdate = useGamificationStore((s) => s.applyUpdate)

  const actorRegistry = useRef<Map<string, ReturnType<typeof createActor>>>(new Map())

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    async function bootstrap() {
      const token = await getToken()
      if (!token || !scene) return

      connectSocket(token)

      agents.forEach((agent, index) => {
        if (actorRegistry.current.has(agent.id)) return

        const deskKey = agentDeskKey(index)

        const actor = createActor(directorMachine, {
          input: { agentId: agent.id, agentName: agent.name, deskKey },
        })
        actor.start()

        // No pixi sprite — agent is represented by the React AgentAvatarDock
        actor.send({ type: 'INIT', sprite: null, scene })

        actorRegistry.current.set(agent.id, actor)
        setDirectorActor(agent.id, actor as any)
      })

      // Gamification real-time updates
      const socket = (await import('@/lib/socket')).getSocket()
      socket.on('gamification:update', (update: GamificationUpdate) => {
        applyGamificationUpdate(update)
      })
      socket.on('agent:evolution', (toast: EvolutionToast) => {
        setEvolutionToast(toast)
        setTimeout(() => setEvolutionToast(null), 5000)
      })

      unsubscribe = onAgentEvent((event: AgentEvent) => {
        const actor = actorRegistry.current.get(event.agentId)
        if (!actor) return

        const agentObj = agents.find((a) => a.id === event.agentId)

        switch (event.type) {
          case 'TASK_ASSIGNED':
            upsertTask({ id: event.taskId, agentId: event.agentId, status: 'IN_PROGRESS' })
            setActiveTask(event.agentId, event.taskId)
            updateStatus(event.agentId, 'WORKING')
            actor.send({ type: 'TASK_ASSIGNED', taskId: event.taskId, payload: event.payload })
            break
          case 'STEP_STARTED':
          case 'TOOL_CALLED':
          case 'TOOL_RESULT':
            actor.send({ type: event.type, payload: event.payload })
            break
          case 'NEEDS_APPROVAL': {
            updateStatus(event.agentId, 'BLOCKED')
            actor.send({ type: 'NEEDS_APPROVAL', payload: event.payload })
            const ar = (event.payload as any).approvalRequest
            if (ar) {
              setPendingApproval({
                requestId:   ar.id,
                taskId:      ar.taskId,
                agentId:     event.agentId,
                agentName:   agentObj?.name ?? 'Agent',
                action:      ar.action,
                preview:     ar.preview,
                previewType: ar.previewType,
              })
            }
            break
          }
          case 'APPROVAL_GRANTED':
            updateStatus(event.agentId, 'WORKING')
            setPendingApproval(null)
            actor.send({ type: 'APPROVAL_GRANTED', payload: event.payload })
            break
          case 'TASK_COMPLETE':
            updateStatus(event.agentId, 'IDLE')
            setActiveTask(event.agentId, null)
            setPendingApproval(null)
            upsertTask({ id: event.taskId, agentId: event.agentId, status: 'COMPLETE' })
            setCompletedTask({
              taskId:     event.taskId,
              agentId:    event.agentId,
              agentName:  agentObj?.name ?? 'Agent',
              title:      (event.payload.result?.title ?? 'Task complete'),
              result:     event.payload.result ?? null,
              status:     'COMPLETE',
              confidence: event.payload.result?.confidence,
              userRating: null,
            })
            actor.send({ type: 'TASK_COMPLETE', payload: event.payload })
            break
          case 'TASK_FAILED':
            updateStatus(event.agentId, 'IDLE')
            setActiveTask(event.agentId, null)
            setPendingApproval(null)
            upsertTask({ id: event.taskId, agentId: event.agentId, status: 'FAILED' })
            setCompletedTask({
              taskId:    event.taskId,
              agentId:   event.agentId,
              agentName: agentObj?.name ?? 'Agent',
              title:     'Task failed',
              result:    null,
              status:    'FAILED',
              error:     event.payload.error?.userFacing ?? 'Something went wrong',
            })
            actor.send({ type: 'TASK_FAILED', payload: event.payload })
            break
          case 'TASK_BLOCKED':
            updateStatus(event.agentId, 'BLOCKED')
            actor.send({ type: 'TASK_BLOCKED', payload: event.payload })
            break
          case 'GRANT_REQUESTED': {
            const gr = (event.payload as any).grantRequest
            if (gr) {
              pushAgentNotification(event.agentId, {
                id:        `grant-${gr.requestId}`,
                type:      'grant',
                headline:  gr.isAppConnected
                  ? `Grant me access to ${gr.label}?`
                  : `Connect ${gr.label} so I can help?`,
                body:      gr.reason,
                createdAt: new Date().toISOString(),
                actions:   gr.isAppConnected
                  ? [
                      { id: 'grant_always', label: 'Always',  style: 'primary' },
                      { id: 'grant_once',   label: 'Just once', style: 'subtle' },
                      { id: 'deny',         label: 'Not now',   style: 'subtle' },
                    ]
                  : [
                      { id: 'connect_and_grant', label: `Connect ${gr.emoji ?? ''} ${gr.label}`.trim(), style: 'primary' },
                      { id: 'deny',              label: 'Not now', style: 'subtle' },
                    ],
                grant: {
                  requestId:       gr.requestId,
                  composioAppName: gr.composioAppName,
                  isAppConnected:  gr.isAppConnected,
                },
              })
            }
            break
          }
        }
      })
    }

    bootstrap()
    return () => {
      unsubscribe?.()
      import('@/lib/socket').then(({ getSocket }) => {
        getSocket().off('gamification:update')
        getSocket().off('agent:evolution')
      })
      actorRegistry.current.forEach((actor) => actor.stop())
      actorRegistry.current.clear()
    }
  }, [scene, agents.length])
}
