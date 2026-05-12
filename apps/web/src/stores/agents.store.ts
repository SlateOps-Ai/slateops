import { create } from 'zustand'
import type { Agent, AgentStatus, Task, TaskResult } from '@agentcity/types'
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
  taskId:    string
  agentId:   string
  agentName: string
  title:     string
  result:    TaskResult | null
  status:    'COMPLETE' | 'FAILED'
  error?:    string
}

interface AgentsState {
  agents:          AgentWithActor[]
  tasks:           Task[]
  activeTaskIds:   Record<string, string>
  pendingApproval: PendingApproval | null
  completedTask:   CompletedTask | null

  setAgents:          (agents: Agent[]) => void
  addAgent:           (agent: Agent) => void
  updateStatus:       (agentId: string, status: AgentStatus) => void
  setDirectorActor:   (agentId: string, actor: ActorRef<any, any>) => void
  setActiveTask:      (agentId: string, taskId: string | null) => void
  setPendingApproval: (approval: PendingApproval | null) => void
  setTasks:           (tasks: Task[]) => void
  upsertTask:         (patch: Partial<Task> & { id: string }) => void
  setCompletedTask:   (task: CompletedTask | null) => void
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents:          [],
  tasks:           [],
  activeTaskIds:   {},
  pendingApproval: null,
  completedTask:   null,

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
}))
