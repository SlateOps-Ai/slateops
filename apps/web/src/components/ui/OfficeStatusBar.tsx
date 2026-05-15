'use client'

import { useEffect, useState } from 'react'
import { Zap, Users, CheckSquare, Star, Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { useGamificationStore } from '@/stores/gamification.store'

interface UserSettings {
  creditsRemaining: number
  plan: string
  byokConfigured: boolean
}

interface Props {
  onOpenUpgrade?:     () => void
  onOpenMarketplace?: () => void
}

export function OfficeStatusBar({ onOpenUpgrade, onOpenMarketplace }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const agents    = useAgentsStore((s) => s.agents)
  const tasks     = useAgentsStore((s) => s.tasks)
  const { profile, setProfile } = useGamificationStore()

  const [settings, setSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    authFetch(`${API}/api/user/settings`)
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {})
  }, [API, authFetch])

  // Fetch gamification profile silently on mount if not already in store
  useEffect(() => {
    if (profile) return
    authFetch(`${API}/api/gamification/profile`)
      .then((r) => r.json())
      .then((d) => { if (d.profile) setProfile(d.profile) })
      .catch(() => {})
  }, [API, authFetch, profile, setProfile])

  const workingCount  = agents.filter((a) => a.status === 'WORKING').length
  const todayComplete = tasks.filter((t) => t.status === 'COMPLETE').length
  const credits       = settings?.creditsRemaining ?? null
  const creditsLow    = credits !== null && !settings?.byokConfigured && credits <= 5
  const creditsGone   = credits !== null && !settings?.byokConfigured && credits <= 0

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">

      {/* Action buttons */}
      {onOpenMarketplace && (
        <button
          onClick={onOpenMarketplace}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-panel-bg px-2.5 py-1.5 backdrop-blur-sm text-xs text-panel-muted hover:text-white hover:border-white/20 transition-colors"
        >
          <Store size={11} className="shrink-0" />
          <span>Marketplace</span>
        </button>
      )}
      {onOpenUpgrade && (
        <button
          onClick={onOpenUpgrade}
          className={cn(
            'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 backdrop-blur-sm text-xs font-semibold transition-colors',
            creditsGone
              ? 'border-[#4d7fff]/50 bg-[#4d7fff]/10 text-[#4d7fff] hover:bg-[#4d7fff]/20'
              : creditsLow
              ? 'border-amber-400/40 bg-amber-400/8 text-amber-400 hover:bg-amber-400/15'
              : 'border-white/10 bg-panel-bg text-panel-muted hover:text-white hover:border-white/20',
          )}
        >
          <Zap size={11} className="shrink-0" />
          <span>{creditsGone || creditsLow ? 'Upgrade' : 'Plans'}</span>
        </button>
      )}

      {/* Credits pill */}
      {credits !== null && (
        <div className={cn(
          'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 backdrop-blur-sm text-xs transition-colors',
          creditsGone  ? 'bg-panel-bg border-lamp-blocked/50 text-lamp-blocked'
          : creditsLow ? 'bg-panel-bg border-lamp-idle/50 text-lamp-idle'
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
        <div className="flex items-center gap-1.5 rounded-xl border border-lamp-working/50 bg-panel-bg px-2.5 py-1.5 backdrop-blur-sm text-xs text-lamp-working animate-pulse-slow">
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

      {/* XP level pill */}
      {profile && (
        <div className="flex items-center gap-1.5 rounded-xl border border-panel-accent/20 bg-panel-bg px-2.5 py-1.5 backdrop-blur-sm text-xs text-panel-accent relative overflow-hidden">
          {/* Progress bg fill */}
          <span
            className="absolute inset-0 bg-panel-accent/8 origin-left"
            style={{ transform: `scaleX(${profile.progressPct / 100})`, transformOrigin: 'left' }}
          />
          <Star size={11} className="shrink-0 relative z-10" />
          <span className="relative z-10 font-medium">Lv {profile.level}</span>
          <span className="relative z-10 text-panel-muted">·</span>
          <span className="relative z-10">{profile.totalXp.toLocaleString()} XP</span>
        </div>
      )}
    </div>
  )
}
