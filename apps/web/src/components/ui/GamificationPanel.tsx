'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Trophy, Flame, Zap, TrendingUp, Lock } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useGamificationStore } from '@/stores/gamification.store'
import type { AchievementDef } from '@/stores/gamification.store'
import { cn } from '@/lib/utils'

// ── Level bar ─────────────────────────────────────────────────────────────────

function LevelBar({ pct, level, levelName, nextXp, totalXp }: {
  pct:      number
  level:    number
  levelName: string
  nextXp:   number | null
  totalXp:  number
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-semibold">{levelName}</p>
          <p className="text-panel-muted text-[10px]">Level {level}</p>
        </div>
        <div className="text-right">
          <p className="text-panel-accent text-sm font-bold">{totalXp.toLocaleString()} XP</p>
          {nextXp && <p className="text-panel-muted text-[10px]">{nextXp.toLocaleString()} to next</p>}
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full bg-panel-accent"
        />
      </div>
      <p className="text-panel-muted text-[10px] text-right">{pct}% to level {level + 1}</p>
    </div>
  )
}

// ── Streak card ───────────────────────────────────────────────────────────────

function StreakCard({ days }: { days: number }) {
  const flame = days >= 30 ? '⚡🔥' : days >= 7 ? '🔥🔥' : days >= 3 ? '🔥' : '❄️'
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 flex items-center gap-3">
      <span className="text-xl leading-none">{flame}</span>
      <div>
        <p className="text-white text-sm font-semibold">{days}-day streak</p>
        <p className="text-panel-muted text-[10px]">
          {days === 0
            ? 'Complete a task today to start your streak'
            : days >= 7
              ? 'Incredible consistency!'
              : 'Keep it going!'}
        </p>
      </div>
      <Flame size={14} className={cn('ml-auto shrink-0', days >= 3 ? 'text-amber-400' : 'text-panel-muted/40')} />
    </div>
  )
}

// ── Achievement grid ──────────────────────────────────────────────────────────

function AchievementGrid({
  allDefs,
  unlocked,
}: {
  allDefs:  AchievementDef[]
  unlocked: AchievementDef[]
}) {
  const unlockedKeys = new Set(unlocked.map((a) => a.key))

  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">
        Achievements — {unlocked.length}/{allDefs.length}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {allDefs.map((def) => {
          const earned  = unlockedKeys.has(def.key)
          const earnedDef = unlocked.find((a) => a.key === def.key)
          return (
            <div
              key={def.key}
              title={`${def.name}: ${def.desc}`}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors relative group',
                earned
                  ? 'border-amber-400/25 bg-amber-400/8'
                  : 'border-white/5 bg-white/3 opacity-40'
              )}
            >
              <span className={cn('text-xl leading-none', !earned && 'grayscale')}>{def.emoji}</span>
              <span className="text-[7px] text-panel-muted text-center leading-tight px-0.5 truncate w-full text-center">{def.name.split(' ')[0]}</span>
              {earned && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border border-panel-bg" />
              )}
              {!earned && (
                <Lock size={8} className="absolute top-1 right-1 text-panel-muted/40" />
              )}
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-panel-bg border border-white/10 rounded-lg px-2 py-1.5 shadow-lg w-36 text-center">
                  <p className="text-white text-[10px] font-medium">{def.name}</p>
                  <p className="text-panel-muted text-[9px] leading-relaxed">{def.desc}</p>
                  {earnedDef?.unlockedAt && (
                    <p className="text-amber-400 text-[8px] mt-0.5">
                      {new Date(earnedDef.unlockedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Recent XP feed ────────────────────────────────────────────────────────────

function XpFeed({ events }: { events: Array<{ xp: number; label: string; createdAt: string }> }) {
  if (!events.length) return null
  return (
    <div>
      <p className="text-panel-muted text-[9px] uppercase tracking-widest mb-2">Recent XP</p>
      <div className="space-y-1">
        {events.slice(0, 8).map((ev, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="text-panel-accent font-semibold w-10 shrink-0 text-right">+{ev.xp}</span>
            <span className="text-panel-muted flex-1 truncate">{ev.label}</span>
            <span className="text-panel-muted/50 shrink-0">
              {new Date(ev.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function GamificationPanel({ onClose }: Props) {
  const authFetch  = useAuthFetch()
  const API        = process.env.NEXT_PUBLIC_API_URL
  const { profile, setProfile } = useGamificationStore()
  const [loading, setLoading]   = useState(!profile)

  useEffect(() => {
    authFetch(`${API}/api/gamification/profile`)
      .then((r) => r.json())
      .then((d) => { if (d.profile) setProfile(d.profile) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [API, authFetch, setProfile])

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-60 top-16 bottom-4 z-30 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Trophy size={13} className="text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium">Progress</p>
          {profile && (
            <p className="text-panel-muted text-[10px]">
              {profile.levelName} · {profile.achievements.length} achievements
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-none">
        {loading && (
          <div className="flex items-center justify-center pt-10 gap-2 text-panel-muted text-xs">
            <TrendingUp size={14} className="animate-pulse" /> Loading…
          </div>
        )}

        {!loading && !profile && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <Trophy size={20} className="text-panel-muted/40" />
            <p className="text-panel-muted text-xs">Complete a task to earn your first XP.</p>
          </div>
        )}

        {!loading && profile && (
          <>
            <LevelBar
              pct={profile.progressPct}
              level={profile.level}
              levelName={profile.levelName}
              nextXp={profile.nextLevelXp}
              totalXp={profile.totalXp}
            />

            <StreakCard days={profile.streakDays} />

            {/* XP stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <Zap size={11} />,       label: 'Total XP', value: profile.totalXp.toLocaleString() },
                { icon: <Trophy size={11} />,    label: 'Earned',   value: `${profile.achievements.length}` },
                { icon: <Flame size={11} />,     label: 'Streak',   value: `${profile.streakDays}d` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/5 bg-white/4 px-2 py-2 text-center">
                  <span className="text-panel-muted">{s.icon}</span>
                  <p className="text-white text-sm font-semibold mt-0.5">{s.value}</p>
                  <p className="text-panel-muted text-[9px]">{s.label}</p>
                </div>
              ))}
            </div>

            <AchievementGrid
              allDefs={profile.allDefs}
              unlocked={profile.achievements}
            />

            <XpFeed events={profile.recentEvents} />
          </>
        )}
      </div>
    </motion.div>
  )
}
