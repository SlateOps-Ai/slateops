'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { ArrowLeft, CheckCircle, XCircle, Clock, Inbox } from 'lucide-react'

interface PendingApproval {
  id:          string
  title:       string
  agentName:   string
  agentAvatar: string | null
  action:      string
  preview:     string | null
  createdAt:   string
  expiresAt:   string | null
}

interface ActivityItem {
  id:          string
  title:       string
  status:      string
  agentName:   string
  completedAt: string
}

interface Summary {
  pendingCount:     number
  pendingApprovals: PendingApproval[]
  recentActivity:   ActivityItem[]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function DailyBriefPage() {
  const router       = useRouter()
  const { getToken } = useAuth()
  const [data,    setData]    = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting,  setActing]  = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = await getToken()
    const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ceo-layer/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [getToken])

  useEffect(() => { load() }, [load])

  async function decide(taskId: string, decision: 'APPROVED' | 'CANCELLED') {
    setActing(taskId)
    const token = await getToken()
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/approvals/${taskId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status: decision }),
    })
    await load()
    setActing(null)
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const doneYesterday = data?.recentActivity.filter(
    (a) => a.status === 'COMPLETE' && new Date(a.completedAt) >= yesterday
  ) ?? []

  return (
    <div className="min-h-screen bg-[#12172b] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/office')}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm"
        >
          <ArrowLeft size={15} />
          Office
        </button>
        <div className="w-px h-4 bg-white/10" />
        <div>
          <h1 className="text-sm font-semibold text-white">What happened while you were away</h1>
          <p className="text-white/30 text-xs">Your daily office update</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="w-5 h-5 rounded-full border-2 border-[#4d7fff] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">

          {/* Pending approvals */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={14} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-white">
                {data?.pendingCount
                  ? `${data.pendingCount} action${data.pendingCount > 1 ? 's' : ''} waiting for you`
                  : 'No approvals needed'}
              </h2>
            </div>

            {!data?.pendingApprovals.length ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center">
                <CheckCircle size={24} className="text-emerald-400/40 mx-auto mb-2" />
                <p className="text-white/40 text-sm">All clear — your agents are running autonomously</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.pendingApprovals.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.agentAvatar
                          ? <img src={item.agentAvatar} alt={item.agentName} className="w-full h-full object-cover" />
                          : <span className="text-xs font-bold text-white/40">{item.agentName[0]}</span>
                        }
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{item.title}</p>
                        <p className="text-white/40 text-xs mt-0.5">{item.agentName} · {timeAgo(item.createdAt)}</p>
                        <p className="text-white/60 text-xs mt-2 leading-relaxed">{item.action}</p>
                        {item.preview && (
                          <p className="text-white/30 text-xs mt-1 italic line-clamp-2">{item.preview}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(item.id, 'APPROVED')}
                        disabled={acting === item.id}
                        className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                      >
                        {acting === item.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => decide(item.id, 'CANCELLED')}
                        disabled={acting === item.id}
                        className="flex-1 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Done yesterday */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={14} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">
                {doneYesterday.length
                  ? `${doneYesterday.length} task${doneYesterday.length > 1 ? 's' : ''} completed in the last 24h`
                  : 'No tasks completed in the last 24h'}
              </h2>
            </div>

            {!doneYesterday.length ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center">
                <Inbox size={24} className="text-white/10 mx-auto mb-2" />
                <p className="text-white/40 text-sm">Your agents haven't completed tasks yet today</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                {doneYesterday.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                    <span className="text-white/70 text-xs flex-1 truncate">{item.title}</span>
                    <span className="text-white/30 text-xs shrink-0">{item.agentName}</span>
                    <span className="text-white/20 text-xs shrink-0">{timeAgo(item.completedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="text-center">
            <button
              onClick={() => router.push('/office')}
              className="px-6 py-2.5 rounded-xl bg-[#4d7fff] text-white text-sm font-medium hover:bg-[#4d7fff]/90 transition-colors"
            >
              Open your office →
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
