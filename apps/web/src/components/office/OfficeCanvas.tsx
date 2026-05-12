'use client'

import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { OfficeScene } from '@/lib/pixi/scene'
import { useAgentEvents } from '@/hooks/useAgentEvents'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { CommandBar } from '@/components/ui/CommandBar'
import { AgentRoster } from '@/components/ui/AgentRoster'
import { TaskTimeline } from '@/components/ui/TaskTimeline'
import { ApprovalToast } from '@/components/ui/ApprovalToast'
import { CommandLibrary } from '@/components/ui/CommandLibrary'
import { TaskResultPanel } from '@/components/ui/TaskResultPanel'
import { SettingsPanel } from '@/components/ui/SettingsPanel'
import { OfficeStatusBar } from '@/components/ui/OfficeStatusBar'
import { useAgentsStore } from '@/stores/agents.store'

export function OfficeCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<OfficeScene | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const setAgents  = useAgentsStore((s) => s.setAgents)
  const setTasks   = useAgentsStore((s) => s.setTasks)
  const authFetch  = useAuthFetch()

  // ── 1. Boot Pixi scene ──────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    let cancelled = false
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.init(canvasRef.current).then(() => {
      if (!cancelled) setSceneReady(true)
    })
    return () => {
      cancelled = true
      scene.destroy()
      sceneRef.current = null
      setSceneReady(false)
    }
  }, [])

  // ── 2. Load agents + tasks from API into Zustand ─────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    Promise.all([
      authFetch(`${base}/api/agents`).then((r) => r.json()),
      authFetch(`${base}/api/tasks?limit=20`).then((r) => r.json()),
    ])
      .then(([agentData, taskData]) => {
        if (agentData.agents) setAgents(agentData.agents)
        if (taskData.tasks)   setTasks(taskData.tasks)
      })
      .catch(() => {})
  }, [setAgents, setTasks, authFetch])

  // ── 3. Wire socket events → XState directors ────────────────────
  useAgentEvents(sceneReady ? sceneRef.current : null)

  return (
    <div className="relative w-full h-screen bg-office-wall overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {sceneReady && (
        <>
          <OfficeStatusBar />
          <CommandBar />
          <AgentRoster />
          <TaskTimeline />
          <CommandLibrary />
          <ApprovalToast />
          <TaskResultPanel />

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className="absolute bottom-4 left-4 z-20 p-2 rounded-xl border border-white/10 bg-panel-bg backdrop-blur-sm text-panel-muted hover:text-white hover:border-white/20 transition-all"
          >
            <Settings size={16} />
          </button>

          <AnimatePresence>
            {settingsOpen && (
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
