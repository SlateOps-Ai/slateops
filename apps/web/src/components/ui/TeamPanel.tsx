'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Users, Plus, Trash2, Crown, Shield, Eye,
  User, Loader2, Mail, Copy, Check, AlertCircle,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

interface Member {
  id:        string
  name:      string
  email:     string
  avatarUrl: string | null
}

interface TeamMembership {
  id:      string
  role:    TeamRole
  joinedAt: string
  user:    Member
}

interface Team {
  id:          string
  name:        string
  slug:        string
  ownerId:     string
  myRole:      TeamRole
  memberships: TeamMembership[]
  _count:      { memberships: number }
}

const ROLE_ICONS: Record<TeamRole, React.ReactNode> = {
  OWNER:  <Crown  size={11} className="text-amber-400" />,
  ADMIN:  <Shield size={11} className="text-panel-accent" />,
  MEMBER: <User   size={11} className="text-panel-muted" />,
  VIEWER: <Eye    size={11} className="text-panel-muted/60" />,
}

const ROLE_LABEL: Record<TeamRole, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Viewer',
}

interface Props { onClose: () => void }

export function TeamPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [teams,       setTeams]       = useState<Team[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [view,        setView]        = useState<'list' | 'detail' | 'create' | 'invite'>('list')
  const [newName,     setNewName]     = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'MEMBER' | 'ADMIN' | 'VIEWER'>('MEMBER')
  const [inviteUrl,       setInviteUrl]       = useState<string | null>(null)
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null)
  const [copied,          setCopied]          = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const selectedTeam = teams.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    authFetch(`${API}/api/teams`)
      .then((r) => r.json())
      .then((d) => {
        setTeams(d.teams ?? [])
        if ((d.teams ?? []).length > 0) {
          setSelectedId(d.teams[0].id)
          setView('detail')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [API, authFetch])

  async function createTeam() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res  = await authFetch(`${API}/api/teams`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setTeams((prev) => [data.team, ...prev])
      setSelectedId(data.team.id)
      setNewName('')
      setView('detail')
    } catch { setError('Something went wrong') }
    finally { setSaving(false) }
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !selectedId) return
    setSaving(true)
    setError(null)
    try {
      const res  = await authFetch(`${API}/api/teams/${selectedId}/invite`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      // API nests the URL under data.invite.inviteUrl
      const url = data.invite?.inviteUrl ?? null
      setInviteUrl(url)
      setInviteEmailSent(data.emailSent ?? null)
      if (data.joined) {
        const refresh = await authFetch(`${API}/api/teams`).then((r) => r.json())
        setTeams(refresh.teams ?? [])
      }
      setInviteEmail('')
    } catch { setError('Something went wrong') }
    finally { setSaving(false) }
  }

  async function removeMember(teamId: string, userId: string) {
    try {
      await authFetch(`${API}/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
      setTeams((prev) => prev.map((t) =>
        t.id === teamId
          ? { ...t, memberships: t.memberships.filter((m) => m.user.id !== userId) }
          : t
      ))
    } catch { /* non-fatal */ }
  }

  async function deleteTeam(teamId: string) {
    try {
      await authFetch(`${API}/api/teams/${teamId}`, { method: 'DELETE' })
      setTeams((prev) => prev.filter((t) => t.id !== teamId))
      setSelectedId(null)
      setView('list')
    } catch { /* non-fatal */ }
  }

  function copyInviteUrl() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-60 top-16 bottom-4 z-30 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Users size={13} className="text-panel-accent shrink-0" />
        <span className="text-white text-xs font-medium flex-1">
          {view === 'create' ? 'Create Team'
           : view === 'invite' ? `Invite to ${selectedTeam?.name ?? 'team'}`
           : view === 'detail' && selectedTeam ? selectedTeam.name
           : 'Teams'}
        </span>
        {view !== 'list' && (
          <button
            onClick={() => { setView(selectedTeam ? 'detail' : 'list'); setError(null); setInviteUrl(null) }}
            className="text-[10px] text-panel-muted hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors mr-1"
          >
            ← Back
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center pt-8 gap-2 text-panel-muted text-xs">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-lamp-blocked/25 bg-lamp-blocked/8 px-3 py-2 flex items-center gap-2">
            <AlertCircle size={12} className="text-lamp-blocked shrink-0" />
            <p className="text-lamp-blocked text-[10px]">{error}</p>
          </div>
        )}

        {/* List view */}
        {!loading && view === 'list' && (
          <>
            {teams.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <Users size={20} className="text-panel-muted/30" />
                <p className="text-panel-muted text-xs">No teams yet.</p>
                <p className="text-panel-muted/60 text-[10px]">Create a team to collaborate with colleagues.</p>
              </div>
            )}
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedId(t.id); setView('detail') }}
                className="w-full flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 hover:border-white/15 hover:bg-white/6 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-panel-accent/15 flex items-center justify-center shrink-0">
                  <span className="text-panel-accent text-xs font-bold">{t.name[0].toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-semibold truncate">{t.name}</p>
                  <p className="text-panel-muted text-[10px]">{t._count.memberships} member{t._count.memberships !== 1 ? 's' : ''} · {ROLE_LABEL[t.myRole]}</p>
                </div>
              </button>
            ))}
          </>
        )}

        {/* Detail view */}
        {!loading && view === 'detail' && selectedTeam && (
          <>
            <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 space-y-1">
              <p className="text-panel-muted text-[9px] uppercase tracking-widest">Members — {selectedTeam.memberships.length}</p>
              <div className="space-y-1.5 mt-1.5">
                {selectedTeam.memberships.filter((m) => m.user).map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    {m.user.avatarUrl
                      ? <img src={m.user.avatarUrl} alt={m.user.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                      : <div className="w-6 h-6 rounded-full bg-panel-accent/20 flex items-center justify-center shrink-0 text-[9px] text-panel-accent font-bold">{(m.user.name ?? '?')[0]}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs truncate">{m.user.name}</p>
                      <p className="text-panel-muted text-[9px] truncate">{m.user.email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ROLE_ICONS[m.role]}
                      <span className="text-[9px] text-panel-muted">{ROLE_LABEL[m.role]}</span>
                    </div>
                    {selectedTeam.myRole === 'OWNER' && m.role !== 'OWNER' && (
                      <button
                        onClick={() => removeMember(selectedTeam.id, m.user.id)}
                        className="p-0.5 rounded text-panel-muted/40 hover:text-lamp-blocked transition-colors"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {(selectedTeam.myRole === 'OWNER' || selectedTeam.myRole === 'ADMIN') && (
                <button
                  onClick={() => { setView('invite'); setInviteUrl(null); setInviteEmailSent(null); setError(null) }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/15 text-panel-muted hover:text-white hover:border-white/25 text-xs transition-colors"
                >
                  <Mail size={11} /> Invite members
                </button>
              )}
              {selectedTeam.myRole === 'OWNER' && (
                <button
                  onClick={() => deleteTeam(selectedTeam.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-lamp-blocked/60 hover:text-lamp-blocked text-[10px] transition-colors"
                >
                  <Trash2 size={10} /> Delete team
                </button>
              )}
            </div>
          </>
        )}

        {/* Create team view */}
        {view === 'create' && (
          <div className="space-y-3">
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Team name</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Marketing Team"
                autoFocus
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && createTeam()}
              />
            </div>
            <button
              onClick={createTeam}
              disabled={!newName.trim() || saving}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-panel-accent text-white text-xs font-semibold disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Create team
            </button>
          </div>
        )}

        {/* Invite view */}
        {view === 'invite' && (
          <div className="space-y-3">
            {inviteUrl && (
              <div className={cn(
                'rounded-xl border px-3 py-2.5 space-y-1.5',
                inviteEmailSent === false
                  ? 'border-amber-400/25 bg-amber-400/5'
                  : 'border-lamp-done/20 bg-lamp-done/5'
              )}>
                <p className={cn(
                  'text-[10px] font-medium',
                  inviteEmailSent === false ? 'text-amber-400' : 'text-lamp-done'
                )}>
                  {inviteEmailSent === true  && 'Invite email sent — share link as backup'}
                  {inviteEmailSent === false && 'Email delivery failed — share this link directly'}
                  {inviteEmailSent === null  && 'Invite link ready'}
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-panel-muted text-[9px] flex-1 truncate font-mono">{inviteUrl}</p>
                  <button onClick={copyInviteUrl} className="p-1 rounded text-panel-muted hover:text-white transition-colors shrink-0" title="Copy invite link">
                    {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Email address</p>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                autoFocus
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-xs placeholder:text-panel-muted outline-none focus:border-panel-accent transition-colors"
              />
            </div>
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Role</p>
              <div className="flex gap-1.5">
                {(['MEMBER', 'ADMIN', 'VIEWER'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] border transition-colors',
                      inviteRole === r
                        ? 'bg-panel-accent/20 border-panel-accent/40 text-white'
                        : 'bg-white/4 border-white/8 text-panel-muted hover:text-white'
                    )}
                  >
                    {ROLE_ICONS[r]} {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || saving}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-panel-accent text-white text-xs font-semibold disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
              Send invite
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      {(view === 'list' || view === 'detail') && (
        <div className="px-3 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={() => { setView('create'); setError(null) }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/15 text-panel-muted hover:text-white hover:border-white/25 text-xs transition-colors"
          >
            <Plus size={11} /> Create new team
          </button>
        </div>
      )}
    </motion.div>
  )
}
