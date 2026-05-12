'use client'

import { useEffect, useState } from 'react'
import { Zap, Users, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'

interface UserSettings {
  creditsRemaining: number
  plan: string
  byokConfigured: boolean
}

export function OfficeStatusBar() {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const agents    = useAgentsStore((s) => s.agents)
  const tasks     = useAgentsStore((s) => s.tasks)

  const [settings, setSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    authFetch(`${API}/api/user/settings`)
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {})
  }, [API, authFetch])

  const workingCount  = agents.filter((a) => a.status === 'WORKING').length
  const todayComplete = tasks.filter((t) => t.status === 'COMPLETE').length
  const credits       = settings?.creditsRemaining ?? null
  const creditsLow    = credits !== null && !settings?.byokConfigured && credits <= 5
  const creditsGone   = credits !== null && !settings?.byokConfigured && credits <= 0

  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5">

      {/* Credits pill */}
      {credits !== null && (
        <div className={cn(
          'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 backdrop-blur-sm text-xs transition-colors',
          creditsGone  ? 'bg-lamp-blocked/10 border-lamp-blocked/30 text-lamp-blocked'
          : creditsLow ? 'bg-lamp-idle/10 border-lamp-idle/30 text-lamp-idle'
          :              'bg-panel-bg border-white/10 text-panel-muted'
        )}>
          <Zap size={11} className="shrink-0" />
          {settings?.byokConfigured
            ? <span>BYOK</span>
            : <span>{credits} cr</span>
          }
        </div>
      )}

      {/* Active agents pill — only show when anyone is working */}
      {workingCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl border border-lamp-working/30 bg-lamp-working/10 px-2.5 py-1.5 backdrop-blur-sm text-xs text-lamp-working animate-pulse-slow">
          <Users size={11} className="shrink-0" />
          <span>{workingCount} working</span>
        </div>
      )}

      {/* Today's completions — show once there's at least one */}
      {todayComplete > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-panel-bg px-2.5 py-1.5 backdrop-blur-sm text-xs text-panel-muted">
          <CheckSquare size={11} className="shrink-0" />
          <span>{todayComplete} done</span>
        </div>
      )}
    </div>
  )
}
