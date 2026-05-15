'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  ArrowLeft, Shield, RefreshCw, DollarSign, Activity, Users, AlertTriangle,
  Clock, ArrowDown, ArrowUp, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Summary {
  totalCalls: number; errorCalls: number; activeUsers: number
  inputTokens: number; outputTokens: number; totalSpendUsd: number
  avgLatencyMs: number
}
interface TopUser {
  userId: string; email: string; name: string; plan: string
  creditsRemaining: number; callCount: number
  inputTokens: number; outputTokens: number; spendUsd: number
}
interface ByModel  { model: string; callCount: number; inputTokens: number; outputTokens: number; spendUsd: number }
interface ByokSplit { platform: { callCount: number; spendUsd: number }; byok: { callCount: number; spendUsd: number } }
interface Anomaly  { userId: string; email: string; name: string; plan: string; todayUsd: number; avgUsd: number; multiple: number }
interface Timeline { days: Array<{ date: string; spendUsd: number; calls: number }> }

const WINDOWS = [
  { label: '24h',  days: 1  },
  { label: '7d',   days: 7  },
  { label: '30d',  days: 30 },
  { label: '90d',  days: 90 },
] as const

export default function AdminPage() {
  const router       = useRouter()
  const { getToken } = useAuth()

  const [windowDays, setWindowDays] = useState<number>(7)
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [topUsers,   setTopUsers]   = useState<TopUser[]>([])
  const [byModel,    setByModel]    = useState<ByModel[]>([])
  const [byok,       setByok]       = useState<ByokSplit | null>(null)
  const [anomalies,  setAnomalies]  = useState<Anomaly[]>([])
  const [timeline,   setTimeline]   = useState<Timeline['days']>([])
  const [loading,    setLoading]    = useState(true)
  const [forbidden,  setForbidden]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    const base = process.env.NEXT_PUBLIC_API_URL
    const qs = `?days=${windowDays}`

    const [s, u, m, b, a, t] = await Promise.all([
      fetch(`${base}/api/admin/usage/summary${qs}`,    { headers }),
      fetch(`${base}/api/admin/usage/top-users${qs}`,  { headers }),
      fetch(`${base}/api/admin/usage/by-model${qs}`,   { headers }),
      fetch(`${base}/api/admin/usage/byok-split${qs}`, { headers }),
      fetch(`${base}/api/admin/usage/anomalies`,       { headers }),
      fetch(`${base}/api/admin/usage/timeline${qs}`,   { headers }),
    ])

    if (s.status === 403) { setForbidden(true); setLoading(false); return }

    if (s.ok) setSummary(await s.json())
    if (u.ok) { const d = await u.json(); setTopUsers(d.users ?? []) }
    if (m.ok) { const d = await m.json(); setByModel(d.models ?? []) }
    if (b.ok) setByok(await b.json())
    if (a.ok) { const d = await a.json(); setAnomalies(d.anomalies ?? []) }
    if (t.ok) { const d = await t.json(); setTimeline(d.days ?? []) }

    setLoading(false)
  }, [getToken, windowDays])

  useEffect(() => { load() }, [load])

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#080b14] text-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-400/15 border border-red-400/25 flex items-center justify-center mx-auto">
            <Shield size={24} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold">Admin access required</h1>
          <p className="text-white/50 text-sm">Your account doesn't have the admin flag set. Ask an admin to set <code className="text-panel-accent">User.isAdmin = true</code> on your record.</p>
          <button onClick={() => router.push('/office')} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition">
            Back to office
          </button>
        </div>
      </div>
    )
  }

  const maxDaySpend = Math.max(...timeline.map((d) => d.spendUsd), 0.001)

  return (
    <div className="min-h-screen bg-[#080b14] text-white">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.05] bg-[#080b14] sticky top-0 z-10">
        <div className="px-6 h-14 flex items-center gap-4">
          <button onClick={() => router.push('/office')} className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition text-sm">
            <ArrowLeft size={14} /> Office
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center">
              <Shield size={14} className="text-amber-400" />
            </div>
            <span className="text-sm font-bold tracking-tight">Platform Admin · Usage</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {WINDOWS.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setWindowDays(days)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    windowDays === days
                      ? 'bg-panel-accent/20 text-panel-accent'
                      : 'text-white/40 hover:text-white hover:bg-white/[0.06]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-white/25 hover:text-white/65 hover:bg-white/5 transition disabled:opacity-30">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1400px] mx-auto space-y-6">

        {/* ── Summary KPIs ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total spend',     value: summary ? `$${summary.totalSpendUsd.toFixed(3)}` : '—', icon: <DollarSign size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-400/8 border-emerald-400/15' },
            { label: 'API calls',       value: summary ? summary.totalCalls.toLocaleString() : '—',   icon: <Activity   size={14} />, color: 'text-blue-400',    bg: 'bg-blue-400/8 border-blue-400/15' },
            { label: 'Active users',    value: summary ? String(summary.activeUsers) : '—',           icon: <Users      size={14} />, color: 'text-[#4d7fff]',   bg: 'bg-[#4d7fff]/8 border-[#4d7fff]/15' },
            { label: 'Avg latency',     value: summary ? `${summary.avgLatencyMs}ms` : '—',           icon: <Clock      size={14} />, color: 'text-amber-400',   bg: 'bg-amber-400/8 border-amber-400/15' },
          ].map(({ label, value, icon, color, bg }) => (
            <div key={label} className={cn('rounded-2xl border px-4 py-3', bg)}>
              <span className={cn(color)}>{icon}</span>
              <p className={cn('text-2xl font-bold tabular-nums mt-1.5', color)}>{value}</p>
              <p className="text-[#8892b0] text-[11px] mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Anomalies ─────────────────────────────────────────────────── */}
        {anomalies.length > 0 && (
          <div className="rounded-2xl border border-red-400/25 bg-red-400/[0.04] overflow-hidden">
            <div className="px-5 py-3 border-b border-red-400/20 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <h2 className="text-red-400 text-sm font-semibold">Spend anomalies</h2>
              <span className="text-red-400/60 text-[11px]">— today's spend ≥ 5× 7-day avg</span>
            </div>
            <div className="divide-y divide-red-400/10">
              {anomalies.map((a) => (
                <div key={a.userId} className="flex items-center gap-4 px-5 py-2.5">
                  <span className="text-red-300 text-xs font-mono tabular-nums w-12 text-right">{a.multiple}×</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{a.name} <span className="text-red-300/60">· {a.email}</span></p>
                    <p className="text-red-400/60 text-[10px]">{a.plan}</p>
                  </div>
                  <span className="text-red-400 text-xs tabular-nums">${a.todayUsd.toFixed(3)} today</span>
                  <span className="text-red-400/40 text-[10px] tabular-nums">avg ${a.avgUsd.toFixed(3)}/day</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Daily spend timeline ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold">Daily spend</h2>
            <p className="text-[#8892b0] text-[11px] mt-0.5">Last {windowDays} day{windowDays === 1 ? '' : 's'}, all users</p>
          </div>
          <div className="px-5 py-4">
            {timeline.length === 0 ? (
              <p className="text-[#8892b0]/60 text-xs italic py-6 text-center">No activity in this window.</p>
            ) : (
              <div className="flex items-end gap-1 h-24">
                {timeline.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="w-full rounded-sm bg-emerald-400/40 group-hover:bg-emerald-400/70 transition" style={{ height: `${Math.max((d.spendUsd / maxDaySpend) * 90, 2)}px` }} />
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#0a0f1e] border border-white/10 rounded px-1.5 py-1 whitespace-nowrap z-20">
                      <p className="text-white text-[10px] font-medium">${d.spendUsd.toFixed(3)}</p>
                      <p className="text-[#8892b0] text-[9px]">{d.calls} calls</p>
                    </div>
                    <span className="text-[8px] text-[#8892b0]/70">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Two columns ───────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* By model */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <Zap size={13} className="text-amber-400" />
              <h2 className="text-sm font-semibold">By model</h2>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {byModel.length === 0 ? (
                <p className="text-[#8892b0]/60 text-xs italic px-5 py-6 text-center">No calls in this window.</p>
              ) : byModel.map((m) => (
                <div key={m.model} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1 text-white/85 text-xs font-mono truncate">{m.model}</span>
                  <span className="text-[#8892b0] text-[10px] tabular-nums w-14 text-right">{m.callCount.toLocaleString()}</span>
                  <span className="text-emerald-400 text-xs font-semibold tabular-nums w-20 text-right">${m.spendUsd.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* BYOK split */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <DollarSign size={13} className="text-emerald-400" />
              <h2 className="text-sm font-semibold">Platform vs BYOK</h2>
            </div>
            <div className="p-5 space-y-3">
              {byok ? (
                <>
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-emerald-400 text-xs font-semibold">Platform-paid</p>
                      <p className="text-emerald-400/60 text-[10px]">{byok.platform.callCount.toLocaleString()} calls — your wallet</p>
                    </div>
                    <span className="text-emerald-400 text-lg font-bold tabular-nums">${byok.platform.spendUsd.toFixed(3)}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-white/65 text-xs font-semibold">BYOK</p>
                      <p className="text-[#8892b0] text-[10px]">{byok.byok.callCount.toLocaleString()} calls — user's key</p>
                    </div>
                    <span className="text-white/65 text-lg font-bold tabular-nums">${byok.byok.spendUsd.toFixed(3)}</span>
                  </div>
                </>
              ) : <p className="text-[#8892b0]/60 text-xs italic">Loading…</p>}
            </div>
          </div>
        </div>

        {/* ── Top users ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <Users size={13} className="text-[#4d7fff]" />
            <h2 className="text-sm font-semibold">Top spenders</h2>
            <span className="text-[#8892b0]/60 text-[11px]">— {windowDays}d window</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-[#8892b0] text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Plan</th>
                  <th className="text-right px-3 py-2 font-medium">Credits</th>
                  <th className="text-right px-3 py-2 font-medium">Calls</th>
                  <th className="text-right px-3 py-2 font-medium">Input</th>
                  <th className="text-right px-3 py-2 font-medium">Output</th>
                  <th className="text-right px-5 py-2 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {topUsers.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-6 text-center text-[#8892b0]/60 italic">No activity in this window.</td></tr>
                ) : topUsers.map((u) => (
                  <tr key={u.userId} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-2">
                      <div className="text-white/85 font-medium">{u.name}</div>
                      <div className="text-[#8892b0]/70 text-[10px]">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded',
                        u.plan === 'ENTERPRISE' ? 'bg-purple-400/15 text-purple-400' :
                        u.plan === 'PRO'        ? 'bg-emerald-400/15 text-emerald-400' :
                                                  'bg-white/8 text-white/40',
                      )}>{u.plan}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-white/55 tabular-nums">{u.creditsRemaining}</td>
                    <td className="px-3 py-2 text-right text-white/75 tabular-nums">{u.callCount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[#8892b0] tabular-nums">{u.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[#8892b0] tabular-nums">{u.outputTokens.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-emerald-400 font-semibold tabular-nums">${u.spendUsd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
