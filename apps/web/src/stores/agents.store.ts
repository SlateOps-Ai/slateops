import { create } from 'zustand'
import type { Agent, AgentStatus } from '@agentcity/types'
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

interface AgentsState {
  agents:          AgentWithActor[]
  activeTaskIds:   Record<string, string>   // agentId → taskId
  pendingApproval: PendingApproval | null

  setAgents:         (agents: Agent[]) => void
  addAgent:          (agent: Agent) => void
  updateStatus:      (agentId: string, status: AgentStatus) => void
  setDirectorActor:  (agentId: string, actor: ActorRef<any, any>) => void
  setActiveTask:     (agentId: string, taskId: string | null) => void
  setPendingApproval:(approval: PendingApproval | null) => void
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents:          [],
  activeTaskIds:   {},
  pendingApproval: null,

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) =>
    set((s) => ({ agents: [...s.agents, agent] })),

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
}))
