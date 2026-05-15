import { setup, assign } from 'xstate'
import type { AgentEvent } from '@agentcity/types'
import type { AgentSpriteGroup } from '@/lib/pixi/agent-sprite'
import type { OfficeScene, DeskKey } from '@/lib/pixi/scene'
import { DESK_POSITIONS } from '@/lib/pixi/scene'

// ── Context & Events ───────────────────────────────────────────────────────

interface DirectorContext {
  agentId: string
  agentName: string
  deskKey: DeskKey
  taskId: string | null
  sprite: AgentSpriteGroup | null
  scene: OfficeScene | null
  pendingApproval: AgentEvent['payload']['approvalRequest'] | null
  taskResult: AgentEvent['payload']['result'] | null
  errorMessage: string | null
}

type DirectorEvent =
  | { type: 'INIT'; sprite: AgentSpriteGroup | null; scene: OfficeScene }
  | { type: 'TASK_ASSIGNED';   taskId: string; payload: AgentEvent['payload'] }
  | { type: 'STEP_STARTED';    payload: AgentEvent['payload'] }
  | { type: 'TOOL_CALLED';     payload: AgentEvent['payload'] }
  | { type: 'TOOL_RESULT';     payload: AgentEvent['payload'] }
  | { type: 'NEEDS_APPROVAL';  payload: AgentEvent['payload'] }
  | { type: 'APPROVAL_GRANTED'; payload: AgentEvent['payload'] }
  | { type: 'TASK_COMPLETE';   payload: AgentEvent['payload'] }
  | { type: 'TASK_FAILED';     payload: AgentEvent['payload'] }
  | { type: 'TASK_BLOCKED';    payload: AgentEvent['payload'] }
  | { type: 'RESULT_DISMISSED' }
  | { type: 'RETRY' }

// ── Machine ────────────────────────────────────────────────────────────────

export const directorMachine = setup({
  types: {} as {
    context: DirectorContext
    events: DirectorEvent
    input: {
      agentId: string
      agentName: string
      deskKey: DeskKey
    }
  },

  actions: {
    initSprite: assign(({ event }) => {
      if (event.type !== 'INIT') return {}
      return { sprite: event.sprite, scene: event.scene }
    }),

    storeTaskId: assign(({ event }) => {
      if (event.type !== 'TASK_ASSIGNED') return {}
      return { taskId: event.taskId }
    }),

    panToAgent: ({ context }) => {
      const pos = DESK_POSITIONS[context.deskKey]
      context.scene?.panTo(pos.x, pos.y)
    },

    panToCeo: ({ context }) => {
      context.scene?.panToDesk('ceo')
    },

    snapToDesk: ({ context }) => {
      const pos = DESK_POSITIONS[context.deskKey]
      context.sprite?.setPosition(pos.x, pos.y)
      context.sprite?.playAnimation('idle_seated')
    },

    walkToDeskAndSit: ({ context }) => {
      const pos = DESK_POSITIONS[context.deskKey]
      context.sprite?.walkTo(pos.x, pos.y, () => {
        context.sprite?.playAnimation('sit_down')
      })
    },

    walkToCeo: ({ context }) => {
      const pos = DESK_POSITIONS['ceo']
      context.sprite?.walkTo(pos.x + 60, pos.y, () => {
        context.sprite?.playAnimation('present')
      })
    },

    walkBackToDeskIdle: ({ context }) => {
      const pos = DESK_POSITIONS[context.deskKey]
      context.scene?.panTo(pos.x, pos.y)
      context.sprite?.walkTo(pos.x, pos.y, () => {
        context.sprite?.playAnimation('idle_seated')
        context.scene?.setLampState(context.deskKey, 'idle')
      })
    },

    startTyping: ({ context }) => {
      context.sprite?.playAnimation('typing')
      context.scene?.setLampState(context.deskKey, 'working')
    },

    showThought: ({ context, event }) => {
      const payload = (event as { payload?: AgentEvent['payload'] }).payload
      const text = payload?.thoughtBubble
      if (text) context.sprite?.showThought(text)
    },

    startThinking: ({ context }) => {
      context.sprite?.playAnimation('thinking')
    },

    startConfused: ({ context }) => {
      context.sprite?.playAnimation('confused')
      context.scene?.setLampState(context.deskKey, 'blocked')
    },

    celebrate: ({ context }) => {
      context.sprite?.playAnimation('celebrate')
      context.scene?.setLampState(context.deskKey, 'done')
    },

    storeApproval: assign(({ event }) => {
      const payload = (event as { payload?: AgentEvent['payload'] }).payload
      return { pendingApproval: payload?.approvalRequest ?? null }
    }),

    storeResult: assign(({ event }) => {
      const payload = (event as { payload?: AgentEvent['payload'] }).payload
      return { taskResult: payload?.result ?? null }
    }),

    storeError: assign(({ event }) => {
      const payload = (event as { payload?: AgentEvent['payload'] }).payload
      return { errorMessage: payload?.error?.userFacing ?? 'Something went wrong' }
    }),

    clearTask: assign(() => ({
      taskId: null,
      pendingApproval: null,
      taskResult: null,
      errorMessage: null,
    })),

    hideThought: ({ context }) => context.sprite?.hideThought(),
  },

  delays: {
    STAND_DURATION:      800,
    WALK_DURATION:       1500,
    CELEBRATE_DURATION:  2000,
  },
}).createMachine({
  id: 'director',
  initial: 'uninitialized',

  context: ({ input }) => ({
    agentId:         input.agentId,
    agentName:       input.agentName,
    deskKey:         input.deskKey,
    taskId:          null,
    sprite:          null,
    scene:           null,
    pendingApproval: null,
    taskResult:      null,
    errorMessage:    null,
  }),

  states: {
    uninitialized: {
      on: { INIT: { target: 'idle', actions: ['initSprite', 'snapToDesk'] } },
    },

    idle: {
      on: {
        TASK_ASSIGNED: {
          target: 'activating',
          actions: ['storeTaskId', 'panToAgent'],
        },
      },
    },

    activating: {
      entry: 'startTyping',  // stand-up + lamp on
      after: {
        STAND_DURATION: {
          target: 'walkingToDesk',
          actions: 'walkToDeskAndSit',
        },
      },
    },

    walkingToDesk: {
      after: { WALK_DURATION: 'working' },
    },

    working: {
      entry: 'startTyping',
      on: {
        STEP_STARTED:   { actions: 'showThought' },
        TOOL_CALLED:    { actions: 'showThought' },
        TOOL_RESULT:    { actions: 'showThought' },
        NEEDS_APPROVAL: {
          target: 'awaitingApproval',
          actions: ['storeApproval', 'startThinking'],
        },
        TASK_COMPLETE: {
          target: 'presenting',
          actions: ['storeResult', 'hideThought', 'panToCeo'],
        },
        TASK_FAILED: {
          target: 'failed',
          actions: ['storeError', 'startConfused'],
        },
        TASK_BLOCKED: {
          target: 'blocked',
          actions: 'startConfused',
        },
      },
    },

    awaitingApproval: {
      on: {
        APPROVAL_GRANTED: {
          target: 'working',
          actions: 'startTyping',
        },
        TASK_FAILED: {
          target: 'failed',
          actions: ['storeError', 'startConfused'],
        },
      },
    },

    presenting: {
      entry: 'walkToCeo',
      after: {
        WALK_DURATION: {
          target: 'showingResult',
          actions: 'celebrate',
        },
      },
    },

    showingResult: {
      on: {
        RESULT_DISMISSED: {
          target: 'idle',
          actions: ['walkBackToDeskIdle', 'clearTask'],
        },
      },
    },

    failed: {
      on: {
        RETRY:          { target: 'working', actions: 'startTyping' },
        RESULT_DISMISSED: {
          target: 'idle',
          actions: ['walkBackToDeskIdle', 'clearTask'],
        },
      },
    },

    blocked: {
      on: {
        TASK_ASSIGNED: {
          target: 'activating',
          actions: ['storeTaskId', 'panToAgent', 'clearTask'],
        },
        RESULT_DISMISSED: {
          target: 'idle',
          actions: ['walkBackToDeskIdle', 'clearTask'],
        },
      },
    },
  },
})

export type DirectorMachine = typeof directorMachine
