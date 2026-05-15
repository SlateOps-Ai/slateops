import { create } from 'zustand'

export interface AchievementDef {
  key:        string
  name:       string
  emoji:      string
  desc:       string
  unlockedAt?: string
}

export interface GamificationProfile {
  totalXp:        number
  level:          number
  levelName:      string
  currentLevelXp: number
  nextLevelXp:    number | null
  progressPct:    number
  streakDays:     number
  achievements:   AchievementDef[]
  recentEvents:   Array<{ xp: number; reason: string; label: string; createdAt: string }>
  allDefs:        AchievementDef[]
}

export interface GamificationUpdate {
  xpAwarded:       number
  totalXp:         number
  level:           number
  levelName:       string
  nextLevelXp:     number | null
  progressPct:     number
  newAchievements: AchievementDef[]
  levelled:        boolean
}

interface GamificationState {
  profile:        GamificationProfile | null
  pendingToasts:  GamificationUpdate[]
  setProfile:     (p: GamificationProfile) => void
  applyUpdate:    (u: GamificationUpdate) => void
  dismissToast:   () => void
}

export const useGamificationStore = create<GamificationState>((set) => ({
  profile:       null,
  pendingToasts: [],

  setProfile: (profile) => set({ profile }),

  applyUpdate: (update) => set((state) => {
    const profile = state.profile
    return {
      pendingToasts: [...state.pendingToasts, update],
      profile: profile ? {
        ...profile,
        totalXp:    update.totalXp,
        level:      update.level,
        levelName:  update.levelName,
        nextLevelXp: update.nextLevelXp,
        progressPct: update.progressPct,
        achievements: [
          ...profile.achievements,
          ...update.newAchievements
            .filter((a) => !profile.achievements.some((e) => e.key === a.key))
            .map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
        ],
      } : profile,
    }
  }),

  dismissToast: () => set((state) => ({
    pendingToasts: state.pendingToasts.slice(1),
  })),
}))
