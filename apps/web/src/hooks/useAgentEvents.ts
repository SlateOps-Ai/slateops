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
  const { agents, setDirectorActor, updateStatus, setActiveTask, setPendingApproval } = useAgentsStore()

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    async function bootstrap() {
      const token = await getToken()
      if (!token || !scene) return

      connectSocket(token)

      // One factory per scene — shared across all agent sprites
      const factory = new SpriteFactory(scene.app.renderer as any)

      agents.forEach((agent, index) => {
        if (actorRegistry.has(agent.id)) return

        const deskKey = agentDeskKey(index)

        const actor = createActor(directorMachine, {
          input: { agentId: agent.id, agentName: agent.name, deskKey },
        })
        actor.start()

        // Spawn Pixi sprite, hand it the shared factory
        const sprite = new AgentSpriteGroup(agent.id, agent.name, agent.avatarUrl, factory)
        scene.layers.agents.addChild(sprite.container)
        sprite.setPosition(80, 620)

        // Wire Pixi into the XState machine
        actor.send({ type: 'INIT', sprite, scene })

        // Drive walk animation each frame
        scene.app.ticker.add(() => sprite.tick())

        actorRegistry.set(agent.id, actor)
        setDirectorActor(agent.id, actor as any)
      })

      unsubscribe = onAgentEvent((event: AgentEvent) => {
        const actor = actorRegistry.get(event.agentId)
        if (!actor) return

        switch (event.type) {
          case 'TASK_ASSIGNED':
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
              const agentObj = agents.find((a) => a.id === event.agentId)
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
            actor.send({ type: 'TASK_COMPLETE', payload: event.payload })
            break
          case 'TASK_FAILED':
            updateStatus(event.agentId, 'IDLE')
            setActiveTask(event.agentId, null)
            setPendingApproval(null)
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
