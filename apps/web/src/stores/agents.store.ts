import { create } from 'zustand'
import type { Agent, AgentStatus, Task, TaskResult, ConfidenceBand } from '@agentcity/types'
import type { ActorRef } from 'xstate'

interface AgentWithActor extends Agent {
  directorActor?: ActorRef<any, any>
}

export interface PendingApproval {
  requestId:   string
  taskId:      string
  agentId:     string
  agentName:   string
  action:      string
  preview:     unknown
  previewType: string
}

export interface CompletedTask {
  taskId:     string
  agentId:    string
  agentName:  string
  title:      string
  result:     TaskResult | null
  status:     'COMPLETE' | 'FAILED'
  error?:     string
  confidence?: ConfidenceBand
  userRating?: 'POSITIVE' | 'NEGATIVE' | null
}

export interface EvolutionToast {
  agentId:   string
  agentName: string
  level:     number
  title:     string
}

interface AgentsState {
  agents:                 AgentWithActor[]
  tasks:                  Task[]
  activeTaskIds:          Record<string, string>
  pendingApproval:        PendingApproval | null
  completedTask:          CompletedTask | null
  activeChatAgentId:      string | null
  teamChatOpen:           boolean
  selectedCanvasAgentId:  string | null
  selectedAgentScreenPos: { x: number; y: number } | null
  evolutionToast:         EvolutionToast | null
  schedulerOpen:          boolean
  schedulerAgentScope:    string | null
  pendingFirstTask:       { agentId: string; taskText: string } | null
  arrivingAgentIds:       string[]
  agentNotifications:     Record<string, AgentNotification | null>
  agentPositions:         Record<string, { x: number; y: number }>
  pendingDraft:           { content: string; platform: string; suggestedAt?: string } | null
  draggingAppName:        string | null

  setAgents:               (agents: Agent[]) => void
  addAgent:                (agent: Agent) => void
  removeAgent:             (agentId: string) => void
  updateStatus:            (agentId: string, status: AgentStatus) => void
  setDirectorActor:        (agentId: string, actor: ActorRef<any, any>) => void
  setActiveTask:           (agentId: string, taskId: string | null) => void
  setPendingApproval:      (approval: PendingApproval | null) => void
  setTasks:                (tasks: Task[]) => void
  upsertTask:              (patch: Partial<Task> & { id: string }) => void
  setCompletedTask:        (task: CompletedTask | null) => void
  setCompletedTaskRating:  (rating: 'POSITIVE' | 'NEGATIVE') => void
  setActiveChatAgent:      (agentId: string | null) => void
  setTeamChatOpen:         (open: boolean) => void
  updateAgent:             (agentId: string, patch: Partial<Agent>) => void
  setSelectedCanvasAgent:  (id: string | null, pos?: { x: number; y: number }) => void
  setEvolutionToast:       (toast: EvolutionToast | null) => void
  openScheduler:           (scope?: string | null) => void
  closeScheduler:          () => void
  setPendingFirstTask:     (task: { agentId: string; taskText: string } | null) => void
  setArrivingAgentIds:     (ids: string[]) => void
  markAgentArrived:        (id: string) => void
  pushAgentNotification:   (agentId: string, notif: AgentNotification) => void
  dismissAgentNotification:(agentId: string) => void
  setPendingDraft:         (draft: { content: string; platform: string; suggestedAt?: string } | null) => void
  setAgentPosition:        (agentId: string, offset: { x: number; y: number }) => void
  resetAllAgentPositions:  () => void
  setDraggingAppName:      (composioAppName: string | null) => void
}

export interface AgentNotification {
  id:        string
  type:      'insight' | 'alert' | 'opportunity' | 'update' | 'grant'
  headline:  string
  body?:     string
  createdAt: string
  /**
   * Optional inline action buttons. Renders inside the speech bubble.
   * The handler is identified by `id` and resolved in AgentAvatarDock.
   */
  actions?: Array<{
    id:    'grant_once' | 'grant_always' | 'deny' | 'connect_and_grant'
    label: string
    style?: 'primary' | 'subtle' | 'danger'
  }>
  /**
   * Carrier for action handlers — these fields are set when type === 'grant'.
   */
  grant?: {
    requestId:       string
    composioAppName: string
    isAppConnected:  boolean
  }
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents:            [],
  tasks:             [],
  activeTaskIds:     {},
  pendingApproval:   null,
  completedTask:     null,
  activeChatAgentId:      null,
  teamChatOpen:           false,
  selectedCanvasAgentId:  null,
  selectedAgentScreenPos: null,
  evolutionToast:         null,
  schedulerOpen:          false,
  schedulerAgentScope:    null,
  pendingFirstTask:       null,
  arrivingAgentIds:       [],
  agentNotifications:     {},
  pendingDraft:           null,
  agentPositions:         {},
  draggingAppName:        null,

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) =>
    set((s) => ({ agents: [...s.agents, agent] })),

  removeAgent: (agentId) =>
    set((s) => ({
      agents:             s.agents.filter((a) => a.id !== agentId),
      // If the deleted agent was the active chat target, drop back to CEO mode.
      activeChatAgentId:  s.activeChatAgentId === agentId ? null : s.activeChatAgentId,
      // Clear related per-agent state so we don't leak references.
      activeTaskIds:      Object.fromEntries(Object.entries(s.activeTaskIds).filter(([k]) => k !== agentId)),
      agentNotifications: Object.fromEntries(Object.entries(s.agentNotifications).filter(([k]) => k !== agentId)),
      agentPositions:     Object.fromEntries(Object.entries(s.agentPositions).filter(([k]) => k !== agentId)),
    })),

  updateStatus: (agentId, status) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, status } : a)),
    })),

  setDirectorActor: (agentId, actor) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, directorActor: actor } : a
      ),
    })),

  setActiveTask: (agentId, taskId) =>
    set((s) => {
      const next = { ...s.activeTaskIds }
      if (taskId === null) delete next[agentId]
      else next[agentId] = taskId
      return { activeTaskIds: next }
    }),

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  setTasks: (tasks) => set({ tasks }),

  upsertTask: (patch) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === patch.id)
      if (idx >= 0) {
        const next = [...s.tasks]
        next[idx] = { ...next[idx], ...patch }
        return { tasks: next }
      }
      return { tasks: [patch as Task, ...s.tasks].slice(0, 30) }
    }),

  setCompletedTask: (task) => set({ completedTask: task }),

  setCompletedTaskRating: (rating) =>
    set((s) => s.completedTask
      ? { completedTask: { ...s.completedTask, userRating: rating } }
      : {}
    ),

  setActiveChatAgent: (agentId) => set({ activeChatAgentId: agentId }),
  setTeamChatOpen:    (open)    => set({ teamChatOpen: open }),

  updateAgent: (agentId, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)),
    })),

  setSelectedCanvasAgent: (id, pos) => set({
    selectedCanvasAgentId:  id,
    selectedAgentScreenPos: pos ?? null,
  }),

  setEvolutionToast: (toast) => set({ evolutionToast: toast }),

  openScheduler:  (scope = null) => set({ schedulerOpen: true,  schedulerAgentScope: scope }),
  closeScheduler: ()             => set({ schedulerOpen: false, schedulerAgentScope: null }),

  setPendingFirstTask: (task) => set({ pendingFirstTask: task }),

  setArrivingAgentIds: (ids) => set({ arrivingAgentIds: ids }),
  markAgentArrived:    (id)  => set((s) => ({ arrivingAgentIds: s.arrivingAgentIds.filter((x) => x !== id) })),

  pushAgentNotification:    (agentId, notif) => set((s) => ({ agentNotifications: { ...s.agentNotifications, [agentId]: notif } })),
  dismissAgentNotification: (agentId)        => set((s) => ({ agentNotifications: { ...s.agentNotifications, [agentId]: null } })),
  setPendingDraft:          (draft)           => set({ pendingDraft: draft }),

  setAgentPosition:       (agentId, offset) => set((s) => ({ agentPositions: { ...s.agentPositions, [agentId]: offset } })),
  resetAllAgentPositions: ()                => set({ agentPositions: {} }),
  setDraggingAppName:     (composioAppName) => set({ draggingAppName: composioAppName }),
}))
