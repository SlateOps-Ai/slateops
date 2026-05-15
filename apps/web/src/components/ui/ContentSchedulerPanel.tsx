'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Calendar, Send, Clock, Loader2, CheckCircle2,
  XCircle, AlertCircle, Twitter, Linkedin, Youtube, Plus, Trash2,
  ExternalLink, RefreshCw, ChevronLeft, Filter,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type Platform = 'TWITTER' | 'LINKEDIN' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE' | 'TIKTOK' | 'THREADS' | 'PINTEREST'
type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED'

interface SocialAccountInfo {
  connected:    boolean
  handle?:      string
  displayName?: string
}

interface ScheduledPost {
  id:          string
  platforms:   Platform[]
  content:     string
  scheduledAt: string
  publishedAt?: string
  status:      PostStatus
  failReason?: string
  results?:    Array<{ platform: string; success: boolean; url?: string; error?: string }>
}

// ── Platform metadata ────────────────────────────────────────────────────────

function TikTokIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.17 8.17 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  )
}
function InstagramIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  )
}
function FacebookIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}
function ThreadsIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="currentColor">
      <path d="M141.537 88.988a66 66 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.452-15.153 9.898-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 6.981 10.009 15.86 12.832 26.48l16.221-4.333c-3.412-12.586-8.879-23.393-16.337-32.24C147.851 12.424 125.907 2.217 97.161 2h-.326C68.104 2.217 46.402 12.48 32.059 30.44 19.228 46.605 12.577 69.086 12.36 96.003l-.002.498.002.497c.217 26.917 6.868 49.398 19.699 65.563C46.402 179.52 68.104 189.783 96.835 190h.326c25.04-.174 42.637-6.708 57.084-21.146 19.011-19.009 18.428-42.967 12.177-57.625-4.461-10.406-13.009-18.976-24.885-24.241zm-44.54 38.013c-10.44.572-21.289-4.098-21.82-14.135-.397-7.441 5.296-15.746 22.461-16.735 1.966-.113 3.895-.169 5.79-.169 6.235 0 12.068.606 17.371 1.765-1.978 24.702-13.058 28.713-23.802 29.274z" />
    </svg>
  )
}
function PinterestIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  )
}

const ALL_PLATFORMS: Platform[] = ['TWITTER', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'THREADS', 'PINTEREST']

const PLATFORM_META: Record<Platform, { label: string; shortLabel: string; icon: React.ReactNode; color: string; bg: string }> = {
  TWITTER:   { label: 'X / Twitter', shortLabel: 'Twitter',   icon: <Twitter          size={14} />, color: 'text-sky-400',    bg: 'bg-sky-400/10' },
  LINKEDIN:  { label: 'LinkedIn',    shortLabel: 'LinkedIn',  icon: <Linkedin         size={14} />, color: 'text-blue-500',   bg: 'bg-blue-500/10' },
  INSTAGRAM: { label: 'Instagram',   shortLabel: 'Instagram', icon: <InstagramIcon    size={14} />, color: 'text-pink-400',   bg: 'bg-pink-400/10' },
  FACEBOOK:  { label: 'Facebook',    shortLabel: 'Facebook',  icon: <FacebookIcon     size={14} />, color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  YOUTUBE:   { label: 'YouTube',     shortLabel: 'YouTube',   icon: <Youtube          size={14} />, color: 'text-red-500',    bg: 'bg-red-500/10' },
  TIKTOK:    { label: 'TikTok',      shortLabel: 'TikTok',    icon: <TikTokIcon       size={14} />, color: 'text-white',      bg: 'bg-white/10' },
  THREADS:   { label: 'Threads',     shortLabel: 'Threads',   icon: <ThreadsIcon      size={14} />, color: 'text-white/80',   bg: 'bg-white/10' },
  PINTEREST: { label: 'Pinterest',   shortLabel: 'Pinterest', icon: <PinterestIcon    size={14} />, color: 'text-red-400',    bg: 'bg-red-400/10' },
}

const STATUS_BADGE: Record<PostStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  DRAFT:      { label: 'Draft',      cls: 'bg-white/10 text-white/40',            icon: <Clock          size={9} /> },
  SCHEDULED:  { label: 'Scheduled',  cls: 'bg-panel-accent/20 text-panel-accent', icon: <Clock          size={9} /> },
  PUBLISHING: { label: 'Publishing', cls: 'bg-amber-500/20 text-amber-400',       icon: <Loader2        size={9} className="animate-spin" /> },
  PUBLISHED:  { label: 'Published',  cls: 'bg-emerald-500/20 text-emerald-400',   icon: <CheckCircle2   size={9} /> },
  FAILED:     { label: 'Failed',     cls: 'bg-red-500/20 text-red-400',           icon: <XCircle        size={9} /> },
  CANCELLED:  { label: 'Cancelled',  cls: 'bg-white/10 text-white/30',            icon: <XCircle        size={9} /> },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultScheduledAt() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

function groupByDate(posts: ScheduledPost[]): Array<{ label: string; posts: ScheduledPost[] }> {
  const map = new Map<string, ScheduledPost[]>()
  for (const p of posts) {
    const d   = new Date(p.scheduledAt)
    const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return Array.from(map.entries()).map(([label, posts]) => ({ label, posts }))
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function ContentSchedulerPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const agentScope    = useAgentsStore((s) => s.schedulerAgentScope)
  const scopedAgent   = useAgentsStore((s) => s.agents.find((a) => a.id === agentScope))

  // data
  const [posts,    setPosts]    = useState<ScheduledPost[]>([])
  const [accounts, setAccounts] = useState<Record<Platform, SocialAccountInfo>>(
    Object.fromEntries(ALL_PLATFORMS.map((p) => [p, { connected: false }])) as Record<Platform, SocialAccountInfo>
  )
  const [loading,  setLoading]  = useState(true)

  // nav
  const [composing, setComposing] = useState(false)

  // filters
  const [filterPlatform, setFilterPlatform] = useState<Platform | null>(null)
  const [filterStatus,   setFilterStatus]   = useState<PostStatus | 'ALL'>('ALL')

  // compose form
  const [content,      setContent]      = useState('')
  const [platforms,    setPlatforms]    = useState<Platform[]>(['TWITTER'])
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('later')
  const [scheduledAt,  setScheduledAt]  = useState(defaultScheduledAt())
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const qs = agentScope ? `?agentId=${encodeURIComponent(agentScope)}` : ''
      const [postsRes, statusRes] = await Promise.all([
        authFetch(`${API}/api/content/posts${qs}`),
        authFetch(`${API}/api/content/social/status`),
      ])
      const [postsData, statusData] = await Promise.all([postsRes.json(), statusRes.json()])
      if (postsData.posts)    setPosts(postsData.posts)
      if (statusData.accounts) setAccounts(statusData.accounts)
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [authFetch, API, agentScope])

  useEffect(() => { loadData() }, [loadData])

  const submitPost = async () => {
    if (!content.trim() || platforms.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body: Record<string, unknown> = { content: content.trim(), platforms }
      if (scheduleMode === 'later') body.scheduledAt = new Date(scheduledAt).toISOString()
      if (agentScope) body.agentId = agentScope

      const res  = await authFetch(`${API}/api/content/posts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create post')

      setContent('')
      setPlatforms(['TWITTER'])
      setScheduleMode('later')
      setScheduledAt(defaultScheduledAt())
      setComposing(false)
      await loadData()
    } catch (err) {
      setSubmitError((err as Error).message)
    }
    setSubmitting(false)
  }

  const deletePost = async (id: string) => {
    await authFetch(`${API}/api/content/posts/${id}`, { method: 'DELETE' })
    setPosts((p) => p.filter((x) => x.id !== id))
  }

  const retryPost = async (id: string) => {
    await authFetch(`${API}/api/content/posts/${id}/publish`, { method: 'POST' })
    await loadData()
  }

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])

  // derived
  const charLimit  = platforms.includes('TWITTER') || platforms.includes('THREADS') ? 280
    : platforms.includes('TIKTOK') ? 2200 : 3000
  const overLimit  = content.length > charLimit

  const filteredPosts = posts.filter((p) => {
    if (filterPlatform && !p.platforms.includes(filterPlatform)) return false
    if (filterStatus !== 'ALL' && p.status !== filterStatus) return false
    return true
  })
  const grouped = groupByDate(filteredPosts)

  const connectedCount = ALL_PLATFORMS.filter((p) => accounts[p]?.connected).length

  return (
    <>
      <motion.div
        key="sched-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ x: `calc(-50% + ${offset.x}px)`, y: `calc(-50% + ${offset.y}px)` }}
        className="fixed left-1/2 top-1/2 z-[60] w-[min(720px,calc(100vw-240px))] max-h-[82vh] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
      >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div onMouseDown={onDragStart} className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0 cursor-move select-none">
        <div className="flex items-center gap-3">
          {composing ? (
            <button onClick={() => setComposing(false)} className="p-1 rounded-lg text-panel-muted hover:text-white transition-all">
              <ChevronLeft size={15} />
            </button>
          ) : (
            <Calendar size={15} className="text-panel-accent" />
          )}
          <span className="text-sm font-semibold text-white">
            {composing ? 'New Post' : 'Content Scheduler'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!composing && (
            <>
              <button
                onClick={() => { setComposing(true); setSubmitError(null) }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-panel-accent text-white text-xs font-medium hover:bg-panel-accent/80 transition-all"
              >
                <Plus size={12} /> New Post
              </button>
              <button onClick={loadData} className="p-2 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all">
                <RefreshCw size={12} />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-2 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-all">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Scope chip (when filtered to one agent) ─────────────────── */}
      {!composing && scopedAgent && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-white/[0.05] shrink-0 bg-white/[0.02]">
          <Filter size={11} className="text-panel-accent" />
          <span className="text-[11px] text-panel-muted">Showing posts by</span>
          <img src={scopedAgent.avatarUrl} alt={scopedAgent.name} className="w-4 h-4 rounded-full object-cover" />
          <span className="text-[11px] font-medium text-white">{scopedAgent.name}</span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* COMPOSE VIEW */}
          {composing && (
            <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">

              {/* Platform selector */}
              <div>
                <p className="text-[11px] text-panel-muted uppercase tracking-widest mb-2">Post to</p>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_PLATFORMS.map((p) => {
                    const meta      = PLATFORM_META[p]
                    const selected  = platforms.includes(p)
                    const acct      = accounts[p]
                    return (
                      <button
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          'flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-medium border transition-all relative',
                          selected
                            ? `border-panel-accent/50 ${meta.bg} ${meta.color}`
                            : 'border-white/10 text-panel-muted hover:border-white/20',
                        )}
                      >
                        {meta.icon}
                        <span className="text-[11px] truncate">{meta.shortLabel}</span>
                        {acct?.handle ? (
                          <span className="text-[9px] opacity-60 truncate w-full text-center">@{acct.handle}</span>
                        ) : !acct?.connected ? (
                          <span className="text-[9px] text-amber-400/70">not connected</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                {platforms.some((p) => !accounts[p]?.connected) && (
                  <p className="text-[11px] text-amber-400/70 mt-2 flex items-center gap-1.5">
                    <AlertCircle size={11} />
                    Some platforms need to be connected first — open Settings to connect them.
                  </p>
                )}
              </div>

              {/* Content */}
              <div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your post content…"
                  rows={5}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-panel-muted resize-none focus:outline-none focus:border-panel-accent/50 transition-colors"
                />
                <div className={cn('text-right text-[11px] mt-1', overLimit ? 'text-red-400' : 'text-panel-muted')}>
                  {content.length} / {charLimit}
                  {platforms.includes('TWITTER') && platforms.length > 1 && (
                    <span className="ml-2 opacity-60">(Twitter limit applies)</span>
                  )}
                </div>
              </div>

              {/* Schedule */}
              <div>
                <p className="text-[11px] text-panel-muted uppercase tracking-widest mb-2">When to post</p>
                <div className="flex gap-2 mb-3">
                  {(['now', 'later'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setScheduleMode(m)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        scheduleMode === m
                          ? 'border-panel-accent/40 bg-panel-accent/10 text-panel-accent'
                          : 'border-white/10 text-panel-muted hover:border-white/20',
                      )}
                    >
                      {m === 'now' ? 'Post Now' : 'Schedule for Later'}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'later' && (
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-panel-accent/50 transition-colors"
                  />
                )}
              </div>

              {submitError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <AlertCircle size={13} /> {submitError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setComposing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-panel-muted hover:text-white hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={submitPost}
                  disabled={submitting || overLimit || !content.trim() || platforms.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-panel-accent text-white text-sm font-medium hover:bg-panel-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {scheduleMode === 'now' ? 'Post Now' : 'Add to Schedule'}
                </button>
              </div>
            </motion.div>
          )}

          {/* SCHEDULE TAB */}
          {!composing && (
            <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Filter bar */}
              <div className="px-5 py-3 flex items-center gap-2 border-b border-white/[0.05] shrink-0 flex-wrap">
                <Filter size={11} className="text-panel-muted shrink-0" />
                {/* Platform filter */}
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => setFilterPlatform(null)}
                    className={cn('px-2 py-0.5 rounded text-[11px] transition-all', filterPlatform === null ? 'bg-panel-accent/20 text-panel-accent' : 'text-panel-muted hover:text-white')}
                  >
                    All
                  </button>
                  {ALL_PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilterPlatform(filterPlatform === p ? null : p)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-all',
                        filterPlatform === p ? `${PLATFORM_META[p].bg} ${PLATFORM_META[p].color}` : 'text-panel-muted hover:text-white',
                      )}
                    >
                      {PLATFORM_META[p].icon}
                      {PLATFORM_META[p].shortLabel}
                    </button>
                  ))}
                </div>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                {/* Status filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="bg-transparent border border-white/10 rounded px-2 py-0.5 text-[11px] text-panel-muted focus:outline-none focus:border-panel-accent/40"
                >
                  <option value="ALL">All statuses</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="FAILED">Failed</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>

              {/* Post list */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-panel-muted" />
                </div>
              ) : grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-panel-muted">
                  <Calendar size={28} className="opacity-30" />
                  <p className="text-sm">{posts.length === 0 ? 'No posts scheduled yet' : 'No posts match your filters'}</p>
                  {posts.length === 0 && (
                    <button onClick={() => setComposing(true)} className="text-xs text-panel-accent hover:underline">
                      Create your first post
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {grouped.map(({ label, posts: dayPosts }) => (
                    <div key={label}>
                      {/* Date group header */}
                      <div className="px-5 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                        <span className="text-[11px] font-semibold text-panel-muted uppercase tracking-widest">{label}</span>
                      </div>
                      {dayPosts.map((post) => {
                        const badge = STATUS_BADGE[post.status]
                        return (
                          <div key={post.id} className="px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {/* Platform + time row */}
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    {post.platforms.map((p) => (
                                      <span key={p} title={PLATFORM_META[p]?.label} className={cn('flex items-center', PLATFORM_META[p]?.color ?? 'text-panel-muted')}>
                                        {PLATFORM_META[p]?.icon}
                                      </span>
                                    ))}
                                  </div>
                                  <span className="text-[11px] text-panel-muted">
                                    {new Date(post.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                  <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ml-auto', badge.cls)}>
                                    {badge.icon} {badge.label}
                                  </span>
                                </div>

                                {/* Content */}
                                <p className="text-sm text-white/80 line-clamp-2 mb-1">{post.content}</p>

                                {/* Fail reason */}
                                {post.status === 'FAILED' && post.failReason && (
                                  <p className="text-[11px] text-red-400 mt-1">{post.failReason}</p>
                                )}

                                {/* Published links */}
                                {post.status === 'PUBLISHED' && post.results && (
                                  <div className="flex gap-2 mt-1">
                                    {post.results.filter((r) => r.success && r.url).map((r) => (
                                      <a key={r.platform} href={r.url} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-[11px] text-panel-accent hover:underline">
                                        <ExternalLink size={10} /> View on {r.platform}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Row actions */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {post.status === 'FAILED' && (
                                  <button onClick={() => retryPost(post.id)} title="Retry"
                                    className="p-1.5 rounded-lg text-panel-muted hover:text-amber-400 hover:bg-white/10 transition-all">
                                    <RefreshCw size={12} />
                                  </button>
                                )}
                                {['SCHEDULED', 'DRAFT', 'FAILED'].includes(post.status) && (
                                  <button onClick={() => deletePost(post.id)} title="Delete"
                                    className="p-1.5 rounded-lg text-panel-muted hover:text-red-400 hover:bg-white/10 transition-all">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Footer: quick stats ─────────────────────────────────────── */}
      {!composing && (
        <div className="px-5 py-2.5 border-t border-white/[0.05] flex items-center gap-4 shrink-0 bg-white/[0.01]">
          {(['SCHEDULED', 'PUBLISHED', 'FAILED'] as PostStatus[]).map((s) => {
            const count = posts.filter((p) => p.status === s).length
            const badge = STATUS_BADGE[s]
            return (
              <div key={s} className="flex items-center gap-1.5 text-[11px] text-panel-muted">
                <span className={badge.cls.replace('bg-', 'text-').split(' ')[0]}>{badge.icon}</span>
                {count} {badge.label.toLowerCase()}
              </div>
            )
          })}
          <div className="flex-1" />
          <span className="text-[11px] text-panel-muted">{posts.length} total posts</span>
        </div>
      )}
    </motion.div>
    </>
  )
}
