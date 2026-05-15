'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Clock, ShieldCheck } from 'lucide-react'

interface TaskInfo {
  id:          string
  title:       string
  agentName:   string
  agentAvatar: string
  agentRole:   string
  action:      string
  preview:     any
  expiresAt:   string
}

export default function ApprovePage({ params }: { params: { token: string } }) {
  const { token } = params
  const API = process.env.NEXT_PUBLIC_API_URL

  const [task,   setTask]   = useState<TaskInfo | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'approved' | 'rejected'>('idle')

  useEffect(() => {
    fetch(`${API}/api/public-approve/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.task) setTask(d.task)
        else setError(d.error ?? 'This approval link is invalid or has expired.')
      })
      .catch(() => setError('Could not load the approval request.'))
  }, [token, API])

  async function decide(action: 'APPROVED' | 'CANCELLED') {
    setStatus('loading')
    try {
      const res = await fetch(`${API}/api/public-approve/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: action }),
      })
      const data = await res.json()
      if (data.ok) setStatus(action === 'APPROVED' ? 'approved' : 'rejected')
      else setError(data.error ?? 'Something went wrong.')
    } catch {
      setError('Failed to submit decision.')
      setStatus('idle')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-4">
            <XCircle size={22} className="text-red-400" />
          </div>
          <p className="text-white font-semibold text-sm mb-1">Link unavailable</p>
          <p className="text-white/40 text-xs">{error}</p>
          <p className="text-white/20 text-[10px] mt-6">Powered by SlateOps</p>
        </div>
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={22} className="text-emerald-400" />
          </div>
          <p className="text-white font-semibold text-sm mb-1">Task approved</p>
          <p className="text-white/40 text-xs">The agent will continue working. You can close this page.</p>
          <p className="text-white/20 text-[10px] mt-6">Powered by SlateOps</p>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-4">
            <XCircle size={22} className="text-red-400" />
          </div>
          <p className="text-white font-semibold text-sm mb-1">Task rejected</p>
          <p className="text-white/40 text-xs">The task has been cancelled. The agent has been notified.</p>
          <p className="text-white/20 text-[10px] mt-6">Powered by SlateOps</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d14] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <ShieldCheck size={14} className="text-[#4d7fff]" />
            <span className="text-white/60 text-xs">SlateOps Approval</span>
          </div>
          <img src={task.agentAvatar} alt={task.agentName} className="w-14 h-14 rounded-2xl object-cover mx-auto mb-3 border border-white/10" />
          <p className="text-white/50 text-xs">{task.agentName} · {task.agentRole.replace(/_/g, ' ')}</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Task</p>
            <p className="text-white font-semibold text-sm leading-snug">{task.title}</p>
          </div>

          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Action requested</p>
            <p className="text-white/70 text-xs">{task.action}</p>
          </div>

          {task.preview && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Preview</p>
              <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                <p className="text-white/50 text-xs leading-relaxed whitespace-pre-wrap">
                  {typeof task.preview === 'string' ? task.preview : JSON.stringify(task.preview, null, 2).slice(0, 500)}
                </p>
              </div>
            </div>
          )}

          {task.expiresAt && (
            <div className="flex items-center gap-1.5 text-amber-400/70">
              <Clock size={10} />
              <span className="text-[10px]">
                Expires {new Date(task.expiresAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => decide('CANCELLED')}
            disabled={status === 'loading'}
            className="flex-1 py-3 rounded-2xl border border-red-400/20 bg-red-400/10 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Reject
          </button>
          <button
            onClick={() => decide('APPROVED')}
            disabled={status === 'loading'}
            className="flex-1 py-3 rounded-2xl bg-[#4d7fff] text-white text-sm font-semibold hover:bg-[#3a6aee] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Approve
          </button>
        </div>

        <p className="text-center text-[10px] text-white/20">
          This action is final. Powered by <span className="text-white/40">SlateOps</span>
        </p>
      </div>
    </div>
  )
}
