'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, TrendingUp } from 'lucide-react'
import { useGamificationStore } from '@/stores/gamification.store'

export function AchievementToast() {
  const pendingToasts  = useGamificationStore((s) => s.pendingToasts)
  const dismissToast   = useGamificationStore((s) => s.dismissToast)
  const toast          = pendingToasts[0] ?? null

  // Auto-dismiss after 5 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismissToast, 5000)
    return () => clearTimeout(t)
  }, [toast, dismissToast])

  const hasAchievements = toast && toast.newAchievements.length > 0
  const levelled        = toast?.levelled

  if (!toast || (!hasAchievements && !levelled && !toast.xpAwarded)) return null

  return (
    <div className="absolute bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {/* XP award pill */}
        {toast.xpAwarded > 0 && (
          <motion.div
            key="xp"
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2 rounded-xl border border-panel-accent/30 bg-panel-bg/90 backdrop-blur-sm px-3 py-2 shadow-lg pointer-events-auto"
          >
            <span className="text-panel-accent text-sm font-bold">+{toast.xpAwarded} XP</span>
            {levelled && (
              <span className="flex items-center gap-1 text-amber-400 text-xs font-medium">
                <TrendingUp size={11} /> Level up → {toast.levelName}
              </span>
            )}
          </motion.div>
        )}

        {/* Achievement cards */}
        {hasAchievements && toast.newAchievements.map((a, i) => (
          <motion.div
            key={a.key}
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}
            className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-panel-bg/90 backdrop-blur-sm px-3 py-2.5 shadow-lg pointer-events-auto"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
              <span className="text-base leading-none">{a.emoji}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Trophy size={9} className="text-amber-400 shrink-0" />
                <span className="text-amber-400 text-[9px] uppercase tracking-widest font-medium">Achievement</span>
              </div>
              <p className="text-white text-xs font-semibold">{a.name}</p>
              <p className="text-panel-muted text-[10px]">{a.desc}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
