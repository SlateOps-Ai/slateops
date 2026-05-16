'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Plug, Plus, Trash2, Loader2, Check } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { INTEGRATION_CATALOG, findCatalogApp, canRoleUseApp, AGENT_ROLE_LABELS } from '@agentcity/types'
import type { CatalogApp, AgentRole } from '@agentcity/types'
import { cn } from '@/lib/utils'

interface Connection {
  id:              string
  composioAppName: string
  label:           string
  emoji:           string
  description:     string
  connectedAt:     string
}

interface Grant {
  id:             string
  agentId:        string
  integrationId:  string
  mode:           'ALWAYS' | 'ASK_EACH'
  scopes:         string[]
  grantedAt:      string
  lastUsedAt:     string | null
  integration:    { composioAppName: string | null; provider: string }
  agent:          { name: string; role: string }
}

interface Props { onClose: () => void }

export function ConnectionsPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const agents    = useAgentsStore((s) => s.agents)

  const [tab, setTab] = useState<'services' | 'grants' | 'add'>('services')
  const [connections, setConnections] = useState<Connection[]>([])
  const [grants,      setGrants]      = useState<Grant[]>([])
  const [loading,     setLoading]     = useState(true)
  const [busy,        setBusy]        = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, gRes] = await Promise.all([
        authFetch(`${API}/api/integrations/connections`),
        authFetch(`${API}/api/integrations/grants`),
      ])
      const cData = await cRes.json()
      const gData = await gRes.json()
      setConnections(cData.connections ?? [])
      setGrants(gData.grants ?? [])
    } catch { /* keep prior data */ }
    finally { setLoading(false) }
  }, [API, authFetch])

  useEffect(() => { refresh() }, [refresh])

  // Listen for OAuth popup completion → finalize + refresh
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin)       return
      if (ev.data?.type !== 'composio_oauth_complete') return
      const appName = ev.data?.composioAppName as string | undefined
      if (!appName) return
      authFetch(`${API}/api/integrations/callback`, {
        method: 'POST',
        body:   JSON.stringify({ composioAppName: appName }),
      }).then(() => {
        setBusy(null)
        refresh()
      }).catch(() => setBusy(null))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [API, authFetch, refresh])

  async function startConnect(app: CatalogApp) {
    setBusy(app.composioAppName)
    try {
      const res = await authFetch(`${API}/api/integrations/connect`, {
        method: 'POST',
        body:   JSON.stringify({ composioAppName: app.composioAppName }),
      })
      const data = await res.json()
      if (data.redirectUrl) {
        const popup = window.open(data.redirectUrl, 'composio_oauth', 'width=600,height=720,popup=1')
        if (!popup) {
          window.location.href = data.redirectUrl
        }
      } else {
        setBusy(null)
      }
    } catch {
      setBusy(null)
    }
  }

  async function disconnect(c: Connection) {
    if (!confirm(`Disconnect ${c.label}? Agents will lose access immediately.`)) return
    try {
      await authFetch(`${API}/api/integrations/connections/${c.id}`, { method: 'DELETE' })
    } catch { /* ignore */ }
    refresh()
  }

  async function toggleGrant(
    agentId: string,
    app: CatalogApp,
    currentGrant: Grant | undefined,
    fitOk: boolean,
  ) {
    if (currentGrant) {
      try {
        await authFetch(`${API}/api/integrations/grants/${currentGrant.id}`, { method: 'DELETE' })
      } catch { /* ignore */ }
    } else {
      // Granting off-role from the matrix needs an explicit nudge so the
      // user knows they're overriding our default. The matrix is the
      // power-user surface; we want them to think before they grant.
      if (!fitOk) {
        const ok = window.confirm(
          `${app.label} isn't a typical fit for this agent's role.\n\nGrant access anyway?`,
        )
        if (!ok) return
      }
      try {
        await authFetch(`${API}/api/integrations/grants`, {
          method: 'POST',
          body:   JSON.stringify({ agentId, composioAppName: app.composioAppName, mode: 'ALWAYS' }),
        })
      } catch { /* ignore */ }
    }
    refresh()
  }

  const connectedAppNames = new Set(connections.map((c) => c.composioAppName))
  const unconnectedCatalog = INTEGRATION_CATALOG.filter((a) => !connectedAppNames.has(a.composioAppName))

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-4 top-16 bottom-4 z-40 w-[440px] flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Plug size={14} className="text-panel-accent shrink-0" />
        <p className="text-white text-sm font-semibold flex-1">Connections</p>
        <button onClick={onClose} className="text-panel-muted hover:text-white transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] shrink-0 px-2 pt-2 gap-1">
        {([
          { id: 'services', label: `Services (${connections.length})` },
          { id: 'grants',   label: `Grants (${grants.length})` },
          { id: 'add',      label: 'Connect new' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-1.5 rounded-t-md text-[11px] font-medium transition-colors',
              tab === t.id
                ? 'bg-white/[0.06] text-white'
                : 'text-panel-muted hover:text-white hover:bg-white/[0.03]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 size={18} className="text-panel-accent animate-spin" />
          </div>
        )}

        {!loading && tab === 'services' && (
          <>
            {connections.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-panel-muted text-xs mb-3">Nothing connected yet.</p>
                <button
                  onClick={() => setTab('add')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-accent text-white text-[11px] font-semibold hover:bg-panel-accent/85"
                >
                  <Plus size={11} /> Connect your first app
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                    <span className="text-xl leading-none shrink-0">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[12px] font-semibold truncate">{c.label}</p>
                      <p className="text-panel-muted text-[9px] truncate">
                        Connected {new Date(c.connectedAt).toLocaleDateString()} ·
                        {' '}{grants.filter((g) => g.integration.composioAppName === c.composioAppName).length} agent grants
                      </p>
                    </div>
                    <button
                      onClick={() => disconnect(c)}
                      className="p-1.5 rounded-md text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && tab === 'grants' && (
          <>
            {connections.length === 0 ? (
              <p className="text-panel-muted text-xs text-center py-10">Connect an app first to grant agents access.</p>
            ) : agents.length === 0 ? (
              <p className="text-panel-muted text-xs text-center py-10">Hire an agent first to grant access.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] uppercase tracking-widest text-panel-muted/50 px-1">
                  Tap a cell to grant or revoke
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left py-2 pr-2 text-panel-muted font-medium">Agent</th>
                        {connections.map((c) => (
                          <th key={c.id} className="text-center px-1 py-2 text-panel-muted font-medium" title={c.label}>
                            <span className="text-base">{c.emoji}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent) => {
                        const roleLabel = AGENT_ROLE_LABELS[agent.role as keyof typeof AGENT_ROLE_LABELS] ?? agent.role
                        return (
                        <tr key={agent.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="py-2 pr-2 text-white truncate max-w-[100px]" title={roleLabel}>{agent.name}</td>
                          {connections.map((c) => {
                            const g     = grants.find((gx) => gx.agentId === agent.id && gx.integration.composioAppName === c.composioAppName)
                            const app   = findCatalogApp(c.composioAppName)
                            if (!app) return <td key={c.id} className="text-center px-1 py-2">—</td>
                            const fitOk = canRoleUseApp(agent.role as AgentRole, app)
                            return (
                              <td key={c.id} className={cn('text-center px-1 py-2', !fitOk && !g && 'opacity-40')}>
                                <button
                                  onClick={() => toggleGrant(agent.id, app, g, fitOk)}
                                  className={cn(
                                    'w-5 h-5 rounded-md border transition-all inline-flex items-center justify-center',
                                    g
                                      ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/25'
                                      : fitOk
                                      ? 'bg-white/[0.03] border-white/10 text-transparent hover:border-panel-accent/40'
                                      : 'bg-white/[0.02] border-white/8 border-dashed text-transparent hover:border-amber-400/40',
                                  )}
                                  title={
                                    g
                                      ? `Revoke ${app.label} for ${agent.name}`
                                      : fitOk
                                      ? `Grant ${app.label} to ${agent.name}`
                                      : `${roleLabel}s don't usually use ${app.label} — click to grant anyway`
                                  }
                                >
                                  {g && <Check size={11} />}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && tab === 'add' && (
          <div className="space-y-2">
            {unconnectedCatalog.length === 0 ? (
              <p className="text-panel-muted text-xs text-center py-10">You've connected everything in the catalog 🎉</p>
            ) : (
              unconnectedCatalog.map((app) => (
                <button
                  key={app.composioAppName}
                  onClick={() => startConnect(app)}
                  disabled={!!busy}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 text-left transition-all',
                    busy === app.composioAppName
                      ? 'bg-panel-accent/10 border-panel-accent/30'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] hover:border-panel-accent/30',
                    busy && busy !== app.composioAppName && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <span className="text-xl leading-none shrink-0">{app.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[12px] font-semibold truncate">{app.label}</p>
                    <p className="text-panel-muted text-[10px] truncate">{app.description}</p>
                  </div>
                  {busy === app.composioAppName
                    ? <Loader2 size={12} className="text-panel-accent animate-spin shrink-0" />
                    : <span className="text-panel-muted text-[10px] shrink-0">Connect →</span>
                  }
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
