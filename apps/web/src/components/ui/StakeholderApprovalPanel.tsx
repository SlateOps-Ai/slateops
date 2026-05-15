'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, CheckCircle2, XCircle, Share2, Clock, Loader2, ClipboardCheck, ExternalLink, Copy, Check } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface PendingTask {
  id:        string
  title:     string
  agentName: string
  agentAvatar: string
  action:    string
  preview:   any
  createdAt: string
  expiresAt: string
}

interface Props { onClose: () => void }

export function StakeholderApprovalPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [tasks,     setTasks]     = useState<PendingTask[]>([])
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<{ taskId: string; url: string } | null>(null)
  const [copied,    setCopied]    = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${API}/api/approvals/pending`)
      const data = await res.json()
      if (data.tasks) setTasks(data.tasks)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [API, authFetch])

  useEffect(() => { load() }, [load])

  async function act(taskId: string, status: 'APPROVED' | 'CANCELLED') {
    setActing(taskId)
    try {
      await authFetch(`${API}/api/tasks/${taskId}/approve`, {
        method: 'POST',
        body:   JSON.stringify({ status }),
      })
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch { /* silent */ } finally {
      setActing(null)
    }
  }

  async function generateShareLink(taskId: string) {
    try {
      const res  = await authFetch(`${API}/api/approvals/share`, {
        method: 'POST',
        body:   JSON.stringify({ taskId }),
      })
      const data = await res.json()
      if (data.url) setShareLink({ taskId, url: data.url })
    } catch { /* silent */ }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const msLeft = (exp: string) => {
    const ms = new Date(exp).getTime() - Date.now()
    if (ms < 0) return 'Expired'
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <motion.div
      key="approval-panel"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute left-[192px] top-[215px] bottom-4 z-20 w-[340px] flex flex-col bg-panel-bg border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
        <ClipboardCheck size={12} className="text-panel-accent shrink-0" />
        <span className="text-[12px] font-semibold text-white flex-1">Pending Approvals</span>
        {tasks.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 text-[9px] font-bold">{tasks.length}</span>
        )}
        <button onClick={onClose} className="p-1 rounded text-panel-muted hover:text-white hover:bg-white/10 transition-all">
          <X size={12} />
        </button>
      </div>

      {/* Share link toast */}
      {shareLink && (
        <div className="mx-3 mt-2.5 rounded-xl border border-panel-accent/30 bg-panel-accent/10 p-3 space-y-2 shrink-0">
          <p className="text-[10px] text-panel-accent font-medium">Shareable approval link ready</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareLink.url}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white/70 outline-none truncate"
            />
            <button
              onClick={() => copyLink(shareLink.url)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            >
              {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
            </button>
            <button
              onClick={() => window.open(shareLink.url, '_blank')}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            >
              <ExternalLink size={11} />
            </button>
          </div>
          <button
            onClick={() => setShareLink(null)}
            className="text-[9px] text-panel-muted hover:text-white transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-panel-muted/40" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
            <CheckCircle2 size={22} className="text-panel-muted/20" />
            <p className="text-panel-muted text-[11px]">No pending approvals. Tasks requiring your sign-off will appear here.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <img src={task.agentAvatar} alt={task.agentName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-medium leading-snug">{task.title}</p>
                  <p className="text-panel-muted text-[9px] mt-0.5">{task.agentName} · {task.action}</p>
                </div>
                <div className="flex items-center gap-1 text-amber-400/80 shrink-0">
                  <Clock size={9} />
                  <span className="text-[9px]">{msLeft(task.expiresAt)}</span>
                </div>
              </div>

              {task.preview && typeof task.preview === 'object' && (
                <div className="rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-2">
                  <p className="text-white/50 text-[9px] leading-relaxed line-clamp-3">
                    {JSON.stringify(task.preview).slice(0, 200)}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => act(task.id, 'APPROVED')}
                  disabled={acting === task.id}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all',
                    'bg-lamp-done/20 border border-lamp-done/30 text-lamp-done hover:bg-lamp-done/30',
                    acting === task.id && 'opacity-50',
                  )}
                >
                  {acting === task.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <CheckCircle2 size={10} />
                  }
                  Approve
                </button>
                <button
                  onClick={() => act(task.id, 'CANCELLED')}
                  disabled={acting === task.id}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 bg-red-400/10 border border-red-400/20 text-red-400 hover:bg-red-400/20 transition-all disabled:opacity-50"
                >
                  <XCircle size={10} />
                  Reject
                </button>
                <button
                  onClick={() => generateShareLink(task.id)}
                  title="Generate shareable approval link"
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-panel-muted hover:text-panel-accent hover:border-panel-accent/30 transition-all"
                >
                  <Share2 size={10} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}
