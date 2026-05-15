'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface Props {
  visible: boolean
  onDismiss: () => void
}

export function DailyBriefPrompt({ visible, onDismiss }: Props) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL

  async function enable() {
    await authFetch(`${API}/api/user/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ dailyBriefEnabled: true }),
    }).catch(() => {})
    onDismiss()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="daily-brief-prompt"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-24 right-6 z-[250] w-72 rounded-2xl border border-panel-accent/30 bg-panel-bg shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-panel-accent/15 border border-panel-accent/30 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={13} className="text-panel-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold">Want a daily brief?</p>
              <p className="text-panel-muted text-[10px] mt-0.5 leading-relaxed">
                Get an 8am email with tasks done, approvals pending, and agent highlights.
              </p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={enable}
                  className="flex-1 py-1.5 rounded-lg bg-panel-accent text-white text-[11px] font-medium hover:bg-panel-accent/80 transition-colors"
                >
                  Enable
                </button>
                <button
                  onClick={onDismiss}
                  className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-panel-muted text-[11px] hover:text-white transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
            <button onClick={onDismiss} className="p-0.5 text-panel-muted hover:text-white transition-colors shrink-0">
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
