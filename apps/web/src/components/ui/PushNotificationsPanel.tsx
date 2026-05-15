'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Bell, BellOff, Smartphone, CheckCircle2, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDraggable } from '@/hooks/useDraggable'

interface Props { onClose: () => void }

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

const NOTIFICATION_TYPES = [
  { key: 'taskComplete',   label: 'Task completed',        description: 'When an agent finishes a task' },
  { key: 'taskFailed',     label: 'Task failed',           description: 'When an agent encounters an error' },
  { key: 'needsApproval',  label: 'Approval required',     description: 'When a task needs your sign-off' },
  { key: 'weeklyBrief',    label: 'Weekly digest',         description: 'Sunday office performance summary' },
  { key: 'agentIdle',      label: 'Agent idle reminder',   description: 'When agents have been idle >48h' },
]

export function PushNotificationsPanel({ onClose }: Props) {
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const [permission, setPermission] = useState<PermissionState>('default')
  const [requesting, setRequesting] = useState(false)
  const [prefs,      setPrefs]      = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.key, true]))
  )
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission as PermissionState)

    // Load saved prefs from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem('slateops_push_prefs') ?? '{}')
      if (Object.keys(stored).length > 0) setPrefs(stored)
    } catch { /* ignore */ }
  }, [])

  async function requestPermission() {
    if (!('Notification' in window)) return
    setRequesting(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result as PermissionState)
      if (result === 'granted') {
        new Notification('SlateOps notifications enabled', {
          body: 'You\'ll now receive updates from your AI agents.',
          icon: '/assets/icon-192.png',
        })
      }
    } finally {
      setRequesting(false)
    }
  }

  function savePref(key: string, value: boolean) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    localStorage.setItem('slateops_push_prefs', JSON.stringify(next))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function sendTestNotification() {
    if (permission !== 'granted') return
    new Notification('SlateOps — Test notification', {
      body: 'Your agents are working hard. Everything is running smoothly.',
      icon: '/assets/icon-192.png',
    })
  }

  return (
    <motion.div
      key="push-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ x: offset.x, y: offset.y }}
      className="absolute left-[192px] top-[215px] bottom-4 z-20 w-[320px] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0 cursor-move select-none">
        <Smartphone size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">Push Notifications</span>
        {saved && <span className="text-[9px] text-lamp-done">Saved</span>}
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-4">
        {/* Permission status */}
        <div className={cn(
          'rounded-xl border p-3 space-y-2',
          permission === 'granted'     ? 'border-lamp-done/30 bg-lamp-done/10' :
          permission === 'denied'      ? 'border-red-400/30 bg-red-400/10' :
          permission === 'unsupported' ? 'border-white/10 bg-white/[0.02]' :
                                         'border-panel-accent/30 bg-panel-accent/10',
        )}>
          <div className="flex items-center gap-2">
            {permission === 'granted'     ? <CheckCircle2 size={14} className="text-lamp-done" /> :
             permission === 'denied'      ? <BellOff size={14} className="text-red-400" /> :
             permission === 'unsupported' ? <Info size={14} className="text-panel-muted" /> :
                                            <Bell size={14} className="text-panel-accent" />}
            <p className={cn(
              'text-[11px] font-semibold',
              permission === 'granted'     ? 'text-lamp-done' :
              permission === 'denied'      ? 'text-red-400' :
              permission === 'unsupported' ? 'text-panel-muted' :
                                              'text-panel-accent',
            )}>
              {permission === 'granted'     ? 'Notifications enabled' :
               permission === 'denied'      ? 'Notifications blocked' :
               permission === 'unsupported' ? 'Not supported in this browser' :
                                               'Enable notifications'}
            </p>
          </div>

          {permission === 'default' && (
            <button
              onClick={requestPermission}
              disabled={requesting}
              className="w-full py-2 rounded-xl bg-panel-accent text-white text-[11px] font-semibold hover:bg-panel-accent/80 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {requesting ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
              Allow notifications
            </button>
          )}

          {permission === 'denied' && (
            <p className="text-[10px] text-red-400/70 leading-relaxed">
              Notifications are blocked in your browser settings. Go to your browser's site settings to re-enable them for this site.
            </p>
          )}

          {permission === 'granted' && (
            <button
              onClick={sendTestNotification}
              className="text-[10px] text-lamp-done/70 hover:text-lamp-done transition-colors underline underline-offset-2"
            >
              Send test notification
            </button>
          )}
        </div>

        {/* Notification type preferences */}
        {permission !== 'unsupported' && (
          <div className="space-y-1">
            <p className="text-[9px] text-panel-muted uppercase tracking-widest px-1 mb-2">Notify me when…</p>
            {NOTIFICATION_TYPES.map((type) => (
              <label
                key={type.key}
                className="flex items-start gap-3 px-2.5 py-2.5 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0 mt-px">
                  <p className="text-white text-[11px] font-medium">{type.label}</p>
                  <p className="text-panel-muted text-[9px] mt-0.5">{type.description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs[type.key]}
                  onClick={() => savePref(type.key, !prefs[type.key])}
                  className={cn(
                    'relative w-7 h-4 rounded-full transition-colors shrink-0 mt-0.5',
                    prefs[type.key] ? 'bg-panel-accent' : 'bg-white/10',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    prefs[type.key] ? 'translate-x-3.5' : 'translate-x-0.5',
                  )} />
                </button>
              </label>
            ))}
          </div>
        )}

        {/* PWA install hint */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-1">
          <p className="text-white/50 text-[10px] font-medium flex items-center gap-1.5">
            <Smartphone size={10} />
            Install SlateOps as an app
          </p>
          <p className="text-panel-muted text-[9px] leading-relaxed">
            Add SlateOps to your home screen for a native app experience with faster access and offline support. Use your browser's "Add to Home Screen" option.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
