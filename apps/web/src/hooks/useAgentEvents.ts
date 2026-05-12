'use client'

import { useEffect } from 'react'
import { createActor } from 'xstate'
import { useAuth } from '@clerk/nextjs'
import type { AgentEvent } from '@agentcity/types'
import { connectSocket, onAgentEvent } from '@/lib/socket'
import { directorMachine } from '@/lib/machines/director.machine'
import { useAgentsStore } from '@/stores/agents.store'
import type { OfficeScene } from '@/lib/pixi/scene'
import { agentDeskKey } from '@/lib/pixi/scene'
import { AgentSpriteGroup } from '@/lib/pixi/agent-sprite'
import { SpriteFactory } from '@/lib/pixi/sprite-factory'

// Maps agentId → XState actor instance, lives for the component lifetime
const actorRegistry = new Map<string, ReturnType<typeof createActor>>()

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
  } = useAgentsStore()

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    async function bootstrap() {
      const token = await getToken()
      if (!token || !scene) return

      connectSocket(token)

      const factory = new SpriteFactory(scene.app.renderer as any)

      agents.forEach((agent, index) => {
        if (actorRegistry.has(agent.id)) return

        const deskKey = agentDeskKey(index)

        const actor = createActor(directorMachine, {
          input: { agentId: agent.id, agentName: agent.name, deskKey },
        })
        actor.start()

        const sprite = new AgentSpriteGroup(agent.id, agent.name, agent.avatarUrl, factory)
        scene.layers.agents.addChild(sprite.container)
        sprite.setPosition(80, 620)

        actor.send({ type: 'INIT', sprite, scene })
        scene.app.ticker.add(() => sprite.tick())

        actorRegistry.set(agent.id, actor)
        setDirectorActor(agent.id, actor as any)
      })

      unsubscribe = onAgentEvent((event: AgentEvent) => {
        const actor = actorRegistry.get(event.agentId)
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
              taskId:    event.taskId,
              agentId:   event.agentId,
              agentName: agentObj?.name ?? 'Agent',
              title:     (event.payload.result?.title ?? 'Task complete'),
              result:    event.payload.result ?? null,
              status:    'COMPLETE',
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
        }
      })
    }

    bootstrap()
    return () => { unsubscribe?.() }
  }, [scene, agents.length])
}
