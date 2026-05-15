'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface RecentTask {
  id:          string
  title:       string
  status:      string
  completedAt: string | null
  agentId:     string
}

export function WelcomeBackPanel() {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const [task, setTask]       = useState<RecentTask | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    authFetch(`${API}/api/tasks?limit=1`)
      .then((r) => r.json())
      .then((d) => {
        const latest: RecentTask | undefined = d.tasks?.[0]
        if (!latest) return
        if (latest.status !== 'COMPLETE') return
        if (!latest.completedAt) return
        const age = Date.now() - new Date(latest.completedAt).getTime()
        if (age > 24 * 60 * 60 * 1000) return
        setTask(latest)
        setVisible(true)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API])

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <AnimatePresence>
      {visible && task && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-lamp-done/20 bg-panel-bg/95 backdrop-blur-sm px-4 py-3 shadow-xl"
        >
          <CheckCircle size={16} className="text-lamp-done shrink-0" />
          <div className="min-w-0">
            <p className="text-white text-xs font-medium">Welcome back!</p>
            <p className="text-panel-muted text-[10px] truncate max-w-[220px]">
              Last completed: {task.title}
            </p>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
