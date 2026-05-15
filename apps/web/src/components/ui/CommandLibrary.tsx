'use client'

import { useEffect, useState, useCallback, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Play, Calendar, Trash2, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface SavedCommand {
  id:         string
  title:      string
  rawCommand: string
  runCount:   number
  lastRunAt:  string
  agent: { id: string; name: string; avatarUrl: string; role: string }
}

interface Schedule {
  id:            string
  label:         string
  cronExpr:      string
  savedCommandId: string
  savedCommand:  { title: string }
}

const CRON_PRESETS = [
  { label: 'Every Monday 9am',   expr: '0 9 * * 1' },
  { label: 'Every day 8am',      expr: '0 8 * * *' },
  { label: 'Every Friday 5pm',   expr: '0 17 * * 5' },
  { label: 'Every Sunday 10am',  expr: '0 10 * * 0' },
]

const API = process.env.NEXT_PUBLIC_API_URL

interface CommandLibraryProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  anchorRef:    RefObject<HTMLElement>
}

export function CommandLibrary({ open, onOpenChange, anchorRef }: CommandLibraryProps) {
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setCoords({
        left:   rect.left,
        bottom: window.innerHeight - rect.top + 8,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  const [commands, setCommands]       = useState<SavedCommand[]>([])
  const [schedules, setSchedules]     = useState<Schedule[]>([])
  const [scheduling, setScheduling]   = useState<string | null>(null)  // savedCommandId
  const [cronExpr, setCronExpr]       = useState('0 9 * * 1')
  const [cronLabel, setCronLabel]     = useState('Every Monday 9am')
  const [running, setRunning]         = useState<string | null>(null)
  const authFetch = useAuthFetch()

  const load = useCallback(async () => {
    const [cmdRes, schRes] = await Promise.all([
      authFetch(`${API}/api/library`),
      authFetch(`${API}/api/library/schedules`),
    ])
    const [cmdData, schData] = await Promise.all([cmdRes.json(), schRes.json()])
    setCommands(cmdData.commands ?? [])
    setSchedules(schData.schedules ?? [])
  }, [authFetch])

  useEffect(() => { if (open) load() }, [open, load])

  async function runAgain(cmd: SavedCommand) {
    setRunning(cmd.id)
    await authFetch(`${API}/api/library/${cmd.id}/run`, { method: 'POST' })
    setRunning(null)
    onOpenChange(false)
  }

  async function remove(id: string) {
    await authFetch(`${API}/api/library/${id}`, { method: 'DELETE' })
    setCommands((prev) => prev.filter((c) => c.id !== id))
  }

  async function saveSchedule(savedCommandId: string) {
    await authFetch(`${API}/api/library/schedule`, {
      method:  'POST',
      body: JSON.stringify({ savedCommandId, cronExpr, label: cronLabel }),
    })
    setScheduling(null)
    await load()
  }

  async function cancelSchedule(id: string) {
    await authFetch(`${API}/api/library/schedules/${id}`, { method: 'DELETE' })
    setSchedules((prev) => prev.filter((s) => s.id !== id))
  }

  const hasSchedule = (cmdId: string) => schedules.some((s) => s.savedCommandId === cmdId)

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && coords && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'fixed', left: coords.left, bottom: coords.bottom }}
          className="z-50 w-[640px] max-w-[90vw]"
        >
            <div className="rounded-2xl border border-white/10 bg-panel-bg backdrop-blur-sm overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center px-4 py-3 border-b border-white/10">
                <p className="text-white text-sm font-medium flex-1">
                  Saved commands
                  <span className="text-panel-muted text-xs ml-2">({commands.length})</span>
                </p>
                <button onClick={() => onOpenChange(false)} className="text-panel-muted hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>

              {/* List */}
              <div className="max-h-72 overflow-y-auto">
                {commands.length === 0 && (
                  <p className="text-panel-muted text-xs text-center py-10">
                    No saved commands yet. Complete a task and it appears here automatically.
                  </p>
                )}

                {commands.map((cmd) => (
                  <div key={cmd.id} className="border-b border-white/5 last:border-0">
                    <div className="flex items-start gap-3 px-4 py-3 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cmd.agent.avatarUrl}
                        alt={cmd.agent.name}
                        className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{cmd.title}</p>
                        <p className="text-panel-muted text-[10px] truncate mt-0.5">{cmd.rawCommand}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-panel-muted text-[10px]">
                            {cmd.agent.name} · run {cmd.runCount}×
                          </span>
                          {hasSchedule(cmd.id) && (
                            <span className="text-lamp-done text-[10px]">● scheduled</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {/* Schedule */}
                        {!hasSchedule(cmd.id) && (
                          <button
                            onClick={() => setScheduling(scheduling === cmd.id ? null : cmd.id)}
                            className="p-1.5 rounded-lg text-panel-muted hover:text-panel-accent hover:bg-white/10 transition-colors"
                            title="Schedule recurring run"
                          >
                            <Calendar size={13} />
                          </button>
                        )}
                        {/* Run again */}
                        <button
                          onClick={() => runAgain(cmd)}
                          disabled={running === cmd.id}
                          className="p-1.5 rounded-lg text-panel-muted hover:text-lamp-done hover:bg-white/10 transition-colors disabled:opacity-50"
                          title="Run again"
                        >
                          <Play size={13} />
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => remove(cmd.id)}
                          className="p-1.5 rounded-lg text-panel-muted hover:text-lamp-blocked hover:bg-white/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Schedule picker */}
                    <AnimatePresence>
                      {scheduling === cmd.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3 pt-1 bg-white/5 flex flex-wrap items-center gap-2">
                            {CRON_PRESETS.map((p) => (
                              <button
                                key={p.expr}
                                onClick={() => { setCronExpr(p.expr); setCronLabel(p.label) }}
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-[11px] border transition-all',
                                  cronExpr === p.expr
                                    ? 'bg-panel-accent/20 border-panel-accent/50 text-panel-accent'
                                    : 'bg-white/5 border-white/10 text-panel-muted hover:text-white'
                                )}
                              >
                                {p.label}
                              </button>
                            ))}
                            <button
                              onClick={() => saveSchedule(cmd.id)}
                              className="ml-auto px-3 py-1 rounded-lg bg-panel-accent text-white text-[11px] font-medium"
                            >
                              Schedule →
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Active schedules footer */}
              {schedules.length > 0 && (
                <div className="border-t border-white/10 px-4 py-2 flex flex-wrap gap-2">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-1.5 rounded-lg bg-lamp-done/10 border border-lamp-done/20 px-2.5 py-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-lamp-done" />
                      <span className="text-lamp-done text-[10px]">{s.label}</span>
                      <button
                        onClick={() => cancelSchedule(s.id)}
                        className="text-lamp-done/60 hover:text-lamp-blocked ml-0.5 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
