'use client'

import { useEffect, useRef, useState } from 'react'
import { OfficeScene } from '@/lib/pixi/scene'
import { useAgentEvents } from '@/hooks/useAgentEvents'
import { CommandBar } from '@/components/ui/CommandBar'
import { AgentRoster } from '@/components/ui/AgentRoster'
import { TaskTimeline } from '@/components/ui/TaskTimeline'
import { ApprovalToast } from '@/components/ui/ApprovalToast'
import { CommandLibrary } from '@/components/ui/CommandLibrary'
import { useAgentsStore } from '@/stores/agents.store'

export function OfficeCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<OfficeScene | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const setAgents  = useAgentsStore((s) => s.setAgents)

  // ── 1. Boot Pixi scene ──────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.init(canvasRef.current).then(() => setSceneReady(true))
    return () => {
      scene.destroy()
      sceneRef.current = null
      setSceneReady(false)
    }
  }, [])

  // ── 2. Load agents from API into Zustand ────────────────────────
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => { if (data.agents) setAgents(data.agents) })
      .catch(() => {})
  }, [setAgents])

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
          <CommandBar />
          <AgentRoster />
          <TaskTimeline />
          <CommandLibrary />
          <ApprovalToast />
        </>
      )}
    </div>
  )
}
