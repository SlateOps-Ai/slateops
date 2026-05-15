'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plug, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Loader2, ExternalLink, ChevronRight,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CatalogEntry {
  id:          string
  name:        string
  description: string
  url:         string
  category:    string
  icon:        string
}

interface ConnectedServer {
  id:          string
  name:        string
  description: string | null
  url:         string
  toolCount:   number
  isActive:    boolean
  lastTestedAt: string | null
  createdAt:   string
}

type Tab = 'catalog' | 'custom' | 'connected'

const CATEGORY_COLOR: Record<string, string> = {
  developer:    'bg-blue-500/20 text-blue-300',
  communication:'bg-purple-500/20 text-purple-300',
  productivity: 'bg-green-500/20 text-green-300',
  project:      'bg-amber-500/20 text-amber-300',
  data:         'bg-cyan-500/20 text-cyan-300',
  crm:          'bg-rose-500/20 text-rose-300',
  automation:   'bg-orange-500/20 text-orange-300',
}

// ── Catalog entry card ────────────────────────────────────────────────────────

function CatalogCard({
  entry,
  connected,
  onConnect,
}: {
  entry:     CatalogEntry
  connected: boolean
  onConnect: (id: string, authHeader?: string) => Promise<void>
}) {
  const [loading,    setLoading]    = useState(false)
  const [authPrompt, setAuthPrompt] = useState(false)
  const [authValue,  setAuthValue]  = useState('')

  async function handleConnect() {
    if (authPrompt) {
      setLoading(true)
      await onConnect(entry.id, authValue || undefined)
      setLoading(false)
      setAuthPrompt(false)
      setAuthValue('')
    } else {
      setAuthPrompt(true)
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
          <span className="text-sm">{entry.icon === 'github' ? '🐙' : entry.icon === 'slack' ? '💬' : entry.icon === 'notion' ? '📓' : entry.icon === 'linear' ? '🔷' : entry.icon === 'gdrive' ? '📂' : entry.icon === 'postgres' ? '🐘' : entry.icon === 'jira' ? '🎯' : entry.icon === 'hubspot' ? '🟠' : entry.icon === 'airtable' ? '🟩' : '⚡'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-white text-xs font-medium">{entry.name}</p>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize', CATEGORY_COLOR[entry.category] ?? 'bg-white/10 text-white/60')}>
              {entry.category}
            </span>
          </div>
          <p className="text-panel-muted text-[10px] leading-relaxed mt-0.5 line-clamp-2">{entry.description}</p>
        </div>
      </div>

      <AnimatePresence>
        {authPrompt && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <input
              type="text"
              placeholder="Bearer token or API key (optional)"
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder:text-white/30 focus:outline-none focus:border-panel-accent/50"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {connected ? (
        <div className="flex items-center gap-1 text-lamp-done text-[10px]">
          <CheckCircle size={10} /> Connected
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-panel-accent/15 border border-panel-accent/25 text-panel-accent text-[11px] font-medium hover:bg-panel-accent/25 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
          {authPrompt ? 'Confirm connect' : 'Connect'}
        </button>
      )}
    </div>
  )
}

// ── Connected server row ──────────────────────────────────────────────────────

function ConnectedRow({
  server,
  onTest,
  onDelete,
}: {
  server:   ConnectedServer
  onTest:   (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [testing,  setTesting]  = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-3">
      <div className="flex items-start gap-2">
        <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', server.isActive ? 'bg-lamp-done' : 'bg-lamp-blocked')} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium">{server.name}</p>
          <p className="text-panel-muted text-[10px] truncate">{server.url}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-panel-muted text-[10px]">{server.toolCount} tools</span>
            {server.lastTestedAt && (
              <span className="text-panel-muted text-[10px]">
                tested {new Date(server.lastTestedAt).toLocaleDateString()}
              </span>
            )}
            {!server.isActive && (
              <span className="text-lamp-blocked text-[10px] flex items-center gap-0.5">
                <AlertCircle size={9} /> unreachable
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={async () => { setTesting(true); await onTest(server.id); setTesting(false) }}
            disabled={testing}
            title="Test connection"
            className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
          >
            {testing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
          <button
            onClick={async () => { setDeleting(true); await onDelete(server.id) }}
            disabled={deleting}
            title="Disconnect"
            className="p-1.5 rounded-lg text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Custom server form ────────────────────────────────────────────────────────

function CustomServerForm({ onAdd }: { onAdd: () => void }) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [name,       setName]       = useState('')
  const [url,        setUrl]        = useState('')
  const [desc,       setDesc]       = useState('')
  const [authHeader, setAuthHeader] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch(`${API}/api/mcp/servers`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, url, description: desc || undefined, authHeader: authHeader || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as any).error ?? `Failed (${res.status})`)
      }
      setName(''); setUrl(''); setDesc(''); setAuthHeader('')
      onAdd()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-panel-muted text-[10px] leading-relaxed">
        Connect any MCP-compatible HTTP server. The server must expose{' '}
        <code className="text-white/60 font-mono">GET /tools</code> and{' '}
        <code className="text-white/60 font-mono">POST /call</code> endpoints.
      </p>

      <div className="space-y-2">
        {[
          { label: 'Name',         value: name,       onChange: setName,       placeholder: 'My Postgres MCP', required: true },
          { label: 'URL',          value: url,        onChange: setUrl,        placeholder: 'https://mcp.example.com', required: true },
          { label: 'Description',  value: desc,       onChange: setDesc,       placeholder: 'Optional description' },
          { label: 'Auth header',  value: authHeader, onChange: setAuthHeader, placeholder: 'Bearer sk-...' },
        ].map((f) => (
          <div key={f.label}>
            <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1">{f.label}</label>
            <input
              type="text"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              required={f.required}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder:text-white/30 focus:outline-none focus:border-panel-accent/50"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-lamp-blocked text-[10px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !name || !url}
        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-panel-accent/15 border border-panel-accent/25 text-panel-accent text-xs font-medium hover:bg-panel-accent/25 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Connect server
      </button>

      <a
        href="https://modelcontextprotocol.io/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-panel-muted text-[10px] hover:text-white transition-colors"
      >
        <ExternalLink size={9} /> What is MCP?
      </a>
    </form>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function McpConnectionsPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()

  const [tab,      setTab]      = useState<Tab>('catalog')
  const [catalog,  setCatalog]  = useState<CatalogEntry[]>([])
  const [servers,  setServers]  = useState<ConnectedServer[]>([])
  const [loading,  setLoading]  = useState(true)

  const connectedUrls = new Set(servers.map((s) => s.url))

  async function load() {
    setLoading(true)
    try {
      const [catRes, srvRes] = await Promise.all([
        authFetch(`${API}/api/mcp/catalog`).then((r) => r.json()),
        authFetch(`${API}/api/mcp/servers`).then((r) => r.json()),
      ])
      if (catRes.catalog) setCatalog(catRes.catalog)
      if (srvRes.servers) setServers(srvRes.servers)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function connectCatalog(catalogId: string, authHeader?: string) {
    await authFetch(`${API}/api/mcp/servers/from-catalog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ catalogId, authHeader }),
    })
    await load()
    setTab('connected')
  }

  async function testServer(id: string) {
    await authFetch(`${API}/api/mcp/servers/${id}/test`, { method: 'POST' })
    const res = await authFetch(`${API}/api/mcp/servers`).then((r) => r.json())
    if (res.servers) setServers(res.servers)
  }

  async function deleteServer(id: string) {
    await authFetch(`${API}/api/mcp/servers/${id}`, { method: 'DELETE' })
    setServers((prev) => prev.filter((s) => s.id !== id))
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'catalog',   label: 'Catalog',   count: catalog.length },
    { key: 'custom',    label: 'Custom' },
    { key: 'connected', label: 'Connected', count: servers.length },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-4 left-[192px] z-30 w-80 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 120px)', x: offset.x, y: offset.y }}
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0 cursor-move select-none">
        <Plug size={13} className="text-panel-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium">MCP Connections</p>
          <p className="text-panel-muted text-[10px]">Connect external tools via Model Context Protocol</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 py-1.5 text-[10px] font-medium transition-colors flex items-center justify-center gap-1',
              tab === t.key ? 'text-white border-b border-panel-accent' : 'text-panel-muted hover:text-white'
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="bg-white/10 text-white/60 rounded-full px-1 text-[8px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-none">
        {loading && (
          <div className="flex justify-center pt-8">
            <Loader2 size={16} className="animate-spin text-panel-muted" />
          </div>
        )}

        {!loading && tab === 'catalog' && (
          <div className="space-y-2">
            {catalog.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                connected={connectedUrls.has(entry.url)}
                onConnect={connectCatalog}
              />
            ))}
          </div>
        )}

        {!loading && tab === 'custom' && (
          <CustomServerForm onAdd={() => { load(); setTab('connected') }} />
        )}

        {!loading && tab === 'connected' && (
          <>
            {servers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <Plug size={20} className="text-panel-muted/40" />
                <p className="text-panel-muted text-xs">No MCP servers connected yet.</p>
                <button
                  onClick={() => setTab('catalog')}
                  className="flex items-center gap-1 text-panel-accent text-[11px] hover:underline"
                >
                  Browse catalog <ChevronRight size={10} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {servers.map((srv) => (
                  <ConnectedRow
                    key={srv.id}
                    server={srv}
                    onTest={testServer}
                    onDelete={deleteServer}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
