'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plug, Plus } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

interface Connection {
  id:              string
  composioAppName: string
  label:           string
  emoji:           string
  description:     string
  connectedAt:     string
}

interface Props {
  onOpenConnections?: () => void
}

/**
 * ConnectionsShelf — a small horizontal strip of connected-service icons
 * anchored above the team chat trigger. Each icon is draggable; dropping
 * it onto an agent avatar (handled in AgentAvatarDock) creates a per-agent
 * grant. Empty/zero-state nudges the user toward the Connections panel.
 *
 * The drag payload is the Composio app name on the `text/composio-app`
 * media type — keep this in sync with AgentAvatarDock's onDrop handler.
 */
export function ConnectionsShelf({ onOpenConnections }: Props) {
  const authFetch          = useAuthFetch()
  const API                = process.env.NEXT_PUBLIC_API_URL
  const agents             = useAgentsStore((s) => s.agents)
  const setDraggingAppName = useAgentsStore((s) => s.setDraggingAppName)

  const [connections, setConnections] = useState<Connection[]>([])
  const [dragging,    setDragging]    = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res  = await authFetch(`${API}/api/integrations/connections`)
      const data = await res.json()
      setConnections(data.connections ?? [])
    } catch { /* silent — shelf just stays empty */ }
  }, [API, authFetch])

  useEffect(() => { refresh() }, [refresh])

  // Refresh whenever an OAuth popup completes (from the takeover, the
  // Connections panel, or an in-character grant prompt).
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin)        return
      if (ev.data?.type !== 'composio_oauth_complete') return
      // Give the parent handler time to record the connection first
      setTimeout(refresh, 350)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refresh])

  // Don't clutter the screen on a fresh login with no agents and nothing connected.
  if (agents.length === 0 && connections.length === 0) return null

  return (
    <div className="fixed bottom-9 left-0 right-0 z-20 flex justify-center pointer-events-none">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/10 bg-[#0d0f1a]/95 backdrop-blur-sm shadow-2xl pointer-events-auto">
        {connections.length === 0 ? (
          <button
            onClick={onOpenConnections}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-panel-muted hover:text-white text-[10px] transition-colors"
          >
            <Plug size={10} />
            <span>Connect tools your agents can use</span>
          </button>
        ) : (
          <>
            <span className="text-[9px] uppercase tracking-widest text-panel-muted/50 pl-1 pr-0.5 select-none">
              Drag onto an agent →
            </span>
            {connections.map((c) => (
              <button
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/composio-app', c.composioAppName)
                  e.dataTransfer.setData('text/composio-label', c.label)
                  e.dataTransfer.effectAllowed = 'link'
                  setDragging(c.composioAppName)
                  setDraggingAppName(c.composioAppName)
                }}
                onDragEnd={() => { setDragging(null); setDraggingAppName(null) }}
                title={`Drag onto an agent to grant ${c.label}`}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border transition-all cursor-grab active:cursor-grabbing',
                  dragging === c.composioAppName
                    ? 'border-panel-accent/60 bg-panel-accent/15 scale-110 shadow-lg shadow-panel-accent/20'
                    : 'border-white/10 bg-white/[0.03] hover:border-panel-accent/30 hover:bg-panel-accent/[0.06] hover:scale-105',
                )}
              >
                <span className="text-base leading-none">{c.emoji}</span>
              </button>
            ))}
            {onOpenConnections && (
              <button
                onClick={onOpenConnections}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-white/15 bg-white/[0.02] hover:border-panel-accent/40 hover:bg-panel-accent/[0.06] text-panel-muted hover:text-white transition-all ml-1"
                title="Connect more apps"
              >
                <Plus size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
