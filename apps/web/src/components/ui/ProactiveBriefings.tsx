'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, ChevronRight, Lightbulb, AlertTriangle, TrendingUp, Megaphone, CheckCircle2 } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Briefing {
  id:        string
  agentId:   string
  agentName: string
  agentAvatar: string
  type:      'insight' | 'alert' | 'opportunity' | 'update'
  headline:  string
  body:      string
  createdAt: string
  read:      boolean
}

const TYPE_STYLES: Record<Briefing['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  insight:     { icon: <Lightbulb   size={11} />, color: 'text-amber-400',    bg: 'bg-amber-400/10 border-amber-400/20' },
  alert:       { icon: <AlertTriangle size={11}/>, color: 'text-red-400',      bg: 'bg-red-400/10 border-red-400/20' },
  opportunity: { icon: <TrendingUp  size={11} />, color: 'text-emerald-400',  bg: 'bg-emerald-400/10 border-emerald-400/20' },
  update:      { icon: <Megaphone   size={11} />, color: 'text-panel-accent', bg: 'bg-panel-accent/10 border-panel-accent/20' },
}

export function ProactiveBriefings() {
  const authFetch  = useAuthFetch()
  const API        = process.env.NEXT_PUBLIC_API_URL

  const [briefings, setBriefings]   = useState<Briefing[]>([])
  const [open,      setOpen]        = useState(false)
  const [expanded,  setExpanded]    = useState<string | null>(null)

  const unread = briefings.filter((b) => !b.read).length

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${API}/api/briefings`)
      const data = await res.json()
      if (data.briefings) setBriefings(data.briefings)
    } catch { /* silent */ }
  }, [API, authFetch])

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(t)
  }, [load])

  // Show bell toast when new unread arrives
  const [toastBriefing, setToastBriefing] = useState<Briefing | null>(null)
  useEffect(() => {
    const newest = briefings.find((b) => !b.read)
    if (newest && !open) setToastBriefing(newest)
  }, [briefings, open])

  async function markRead(id: string) {
    setBriefings((prev) => prev.map((b) => b.id === id ? { ...b, read: true } : b))
    await authFetch(`${API}/api/briefings/${id}/read`, { method: 'POST' }).catch(() => {})
  }

  async function markAllRead() {
    setBriefings((prev) => prev.map((b) => ({ ...b, read: true })))
    await authFetch(`${API}/api/briefings/read-all`, { method: 'POST' }).catch(() => {})
  }

  function dismiss(id: string) {
    setBriefings((prev) => prev.filter((b) => b.id !== id))
    authFetch(`${API}/api/briefings/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <>
      {/* Bell button — always visible in top-right area */}
      <div className="absolute top-4 right-[135px] z-40">
        <button
          onClick={() => { setOpen((v) => !v); setToastBriefing(null) }}
          className={cn(
            'relative p-2 rounded-xl border transition-all',
            open
              ? 'bg-panel-accent/20 border-panel-accent/40 text-panel-accent'
              : 'bg-panel-bg/80 border-white/10 text-panel-muted hover:text-white hover:bg-white/10',
          )}
        >
          <Bell size={14} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border border-panel-bg flex items-center justify-center text-[8px] text-white font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-10 w-[320px] max-h-[480px] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden z-50"
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
                <Bell size={11} className="text-panel-accent" />
                <span className="text-[11px] font-semibold text-white flex-1">Agent Briefings</span>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[9px] text-panel-accent hover:underline">Mark all read</button>
                )}
                <button onClick={() => setOpen(false)} className="p-0.5 text-panel-muted hover:text-white transition-colors">
                  <X size={11} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-none">
                {briefings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-6">
                    <CheckCircle2 size={20} className="text-panel-muted/30" />
                    <p className="text-panel-muted text-[11px]">All clear — your agents will surface insights here as they work.</p>
                  </div>
                ) : (
                  briefings.map((b) => {
                    const style = TYPE_STYLES[b.type]
                    return (
                      <div
                        key={b.id}
                        className={cn('border-b border-white/[0.05] last:border-0', !b.read && 'bg-white/[0.02]')}
                      >
                        <div
                          className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => { setExpanded((v) => v === b.id ? null : b.id); markRead(b.id) }}
                        >
                          {/* Agent avatar */}
                          <div className="relative shrink-0 mt-0.5">
                            <img src={b.agentAvatar} alt={b.agentName} className="w-6 h-6 rounded-full object-cover" />
                            <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-panel-bg flex items-center justify-center', style.bg)}>
                              <span className={style.color}>{style.icon}</span>
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-panel-muted">{b.agentName}</span>
                              {!b.read && <span className="w-1.5 h-1.5 rounded-full bg-panel-accent" />}
                            </div>
                            <p className="text-white text-[11px] font-medium leading-snug mt-0.5">{b.headline}</p>
                            <p className="text-panel-muted/50 text-[9px] mt-0.5">{new Date(b.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <ChevronRight size={10} className={cn('text-panel-muted transition-transform', expanded === b.id && 'rotate-90')} />
                            <button
                              onClick={(e) => { e.stopPropagation(); dismiss(b.id) }}
                              className="p-0.5 text-panel-muted hover:text-red-400 transition-colors"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded === b.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className={cn('mx-3 mb-2.5 rounded-xl border px-3 py-2', style.bg)}>
                                <p className={cn('text-[10px] leading-relaxed', style.color)}>{b.body}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pop-up toast for newest unread */}
      <AnimatePresence>
        {toastBriefing && !open && (
          <motion.div
            initial={{ opacity: 0, y: 16, x: 16 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 16, x: 16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-20 right-4 z-50 w-72 rounded-xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
          >
            <div className="flex items-start gap-3 p-3">
              <img src={toastBriefing.agentAvatar} alt={toastBriefing.agentName} className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-panel-muted">{toastBriefing.agentName} · just now</p>
                <p className="text-white text-[11px] font-medium mt-0.5 leading-snug">{toastBriefing.headline}</p>
              </div>
              <button onClick={() => setToastBriefing(null)} className="text-panel-muted hover:text-white shrink-0 transition-colors">
                <X size={11} />
              </button>
            </div>
            <button
              onClick={() => { setOpen(true); setToastBriefing(null) }}
              className="w-full px-3 py-2 border-t border-white/[0.07] text-[10px] text-panel-accent hover:bg-white/[0.04] transition-colors text-left"
            >
              View all briefings →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
