'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Zap, Plus, Trash2, ToggleLeft, ToggleRight, Loader2,
  Copy, Check, ChevronRight, CheckCircle, XCircle, Clock,
  MessageCircle, Mail, Hash, GitBranch, Globe,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

type Provider = 'WHATSAPP' | 'EMAIL' | 'SLACK' | 'GITHUB' | 'GENERIC'
type Tab      = 'rules' | 'add' | 'events'

interface AgentStub {
  id: string; name: string; avatarUrl: string; role: string
}

interface TriggerRule {
  id:             string
  provider:       Provider
  label:          string
  webhookSecret:  string
  promptTemplate: string
  filterField:    string | null
  filterOp:       string | null
  filterValue:    string | null
  isActive:       boolean
  fireCount:      number
  lastFiredAt:    string | null
  createdAt:      string
  agent:          AgentStub
  events:         InboundEvent[]
}

interface InboundEvent {
  id:         string
  taskId:     string | null
  provider:   string
  senderInfo: string | null
  summary:    string | null
  matched:    boolean
  createdAt:  string
}

// ── Provider metadata ──────────────────────────────────────────────────────────

const PROVIDER_META: Record<Provider, {
  label: string
  icon:  React.ReactNode
  color: string
  urlPath: string
  defaultTemplate: string
  hint: string
}> = {
  WHATSAPP: {
    label:           'WhatsApp',
    icon:            <MessageCircle size={12} />,
    color:           'text-green-400',
    urlPath:         'whatsapp',
    defaultTemplate: 'Respond to this WhatsApp message from {sender}: {body}',
    hint:            'Set this URL as your Meta WhatsApp Business webhook. Use the secret as the Verify Token.',
  },
  EMAIL: {
    label:           'Email',
    icon:            <Mail size={12} />,
    color:           'text-blue-400',
    urlPath:         'email',
    defaultTemplate: 'Process this email from {sender} with subject "{subject}":\n\n{body}',
    hint:            'Configure SendGrid Inbound Parse or Mailgun Routes to POST to this URL.',
  },
  SLACK: {
    label:           'Slack',
    icon:            <Hash size={12} />,
    color:           'text-purple-400',
    urlPath:         'slack',
    defaultTemplate: 'Respond to this Slack message from {sender} in #{channel}: {body}',
    hint:            'Add this URL in your Slack app\'s Event Subscriptions. Subscribe to message.channels events.',
  },
  GITHUB: {
    label:           'GitHub',
    icon:            <GitBranch size={12} />,
    color:           'text-white/80',
    urlPath:         'github',
    defaultTemplate: 'Handle this GitHub {subject} event on {channel}:\n\n{body}',
    hint:            'Add this URL in your GitHub repo Settings → Webhooks. The secret is used for HMAC verification.',
  },
  GENERIC: {
    label:           'Generic Webhook',
    icon:            <Globe size={12} />,
    color:           'text-amber-400',
    urlPath:         'generic',
    defaultTemplate: '{body}',
    hint:            'POST any JSON payload to this URL from Zapier, Make, n8n, or any custom service.',
  },
}

const FILTER_FIELDS = [
  { value: 'from',    label: 'From / Sender' },
  { value: 'subject', label: 'Subject / Event type' },
  { value: 'body',    label: 'Message body' },
  { value: 'channel', label: 'Channel / Repo' },
]

const FILTER_OPS = [
  { value: 'any',        label: 'Any (no filter)' },
  { value: 'contains',   label: 'Contains' },
  { value: 'equals',     label: 'Exactly equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith',   label: 'Ends with' },
]

// ── Small helpers ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="shrink-0 text-panel-muted hover:text-panel-accent transition-colors p-1">
      {copied ? <Check size={10} className="text-lamp-done" /> : <Copy size={10} />}
    </button>
  )
}

// ── Provider icon badge ────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: Provider }) {
  const meta = PROVIDER_META[provider]
  return (
    <span className={cn('flex items-center gap-1 text-[9px] font-medium', meta.color)}>
      {meta.icon} {meta.label}
    </span>
  )
}

// ── Rule card ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  apiUrl,
  onToggle,
  onDelete,
  onViewEvents,
}: {
  rule:          TriggerRule
  apiUrl:        string
  onToggle:      (id: string, active: boolean) => Promise<void>
  onDelete:      (id: string) => Promise<void>
  onViewEvents:  (id: string) => void
}) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const meta       = PROVIDER_META[rule.provider]
  const webhookUrl = `${apiUrl}/webhooks/${meta.urlPath}/${rule.webhookSecret}`

  return (
    <div className={cn(
      'rounded-xl border bg-white/4 p-3 space-y-2.5',
      rule.isActive ? 'border-white/8' : 'border-white/4 opacity-60'
    )}>
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-xs font-medium truncate">{rule.label}</p>
            <ProviderBadge provider={rule.provider} />
          </div>
          <p className="text-panel-muted text-[10px] mt-0.5 truncate">→ {rule.agent.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={async () => { setToggling(true); await onToggle(rule.id, !rule.isActive); setToggling(false) }}
            disabled={toggling}
            title={rule.isActive ? 'Deactivate' : 'Activate'}
            className="p-1 text-panel-muted hover:text-white transition-colors"
          >
            {toggling
              ? <Loader2 size={12} className="animate-spin" />
              : rule.isActive
                ? <ToggleRight size={14} className="text-panel-accent" />
                : <ToggleLeft size={14} />
            }
          </button>
          <button
            onClick={async () => { setDeleting(true); await onDelete(rule.id) }}
            disabled={deleting}
            title="Delete rule"
            className="p-1 text-panel-muted hover:text-lamp-blocked transition-colors"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/5 px-2.5 py-1.5">
        <span className="text-white/50 text-[9px] font-mono truncate flex-1">{webhookUrl}</span>
        <CopyButton text={webhookUrl} />
      </div>

      {/* Stats + event log link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-panel-muted text-[10px]">
          <span>{rule.fireCount} fires</span>
          {rule.lastFiredAt && <span>last {timeAgo(rule.lastFiredAt)}</span>}
          {rule.filterField && rule.filterOp !== 'any' && (
            <span className="text-white/40">if {rule.filterField} {rule.filterOp} &ldquo;{rule.filterValue}&rdquo;</span>
          )}
        </div>
        <button
          onClick={() => onViewEvents(rule.id)}
          className="flex items-center gap-0.5 text-[10px] text-panel-muted hover:text-panel-accent transition-colors"
        >
          Event log <ChevronRight size={9} />
        </button>
      </div>
    </div>
  )
}

// ── Add rule form ──────────────────────────────────────────────────────────────

function AddRuleForm({
  agents,
  onCreated,
}: {
  agents:    AgentStub[]
  onCreated: (rule: TriggerRule) => void
}) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [provider, setProvider]   = useState<Provider>('GENERIC')
  const [agentId,  setAgentId]    = useState(agents[0]?.id ?? '')
  const [label,    setLabel]      = useState('')
  const [template, setTemplate]   = useState(PROVIDER_META.GENERIC.defaultTemplate)
  const [field,    setField]      = useState('from')
  const [op,       setOp]         = useState('any')
  const [value,    setValue]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState<string | null>(null)

  function handleProviderChange(p: Provider) {
    setProvider(p)
    setTemplate(PROVIDER_META[p].defaultTemplate)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch(`${API}/api/triggers`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agentId,
          provider,
          label,
          promptTemplate: template,
          filterField:  op !== 'any' ? field : undefined,
          filterOp:     op,
          filterValue:  op !== 'any' ? value : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as any).error ?? `Failed (${res.status})`)
      }
      const { rule } = await res.json()
      setLabel(''); setValue('')
      onCreated(rule)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const meta = PROVIDER_META[provider]

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Provider picker */}
      <div>
        <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1.5">Source</label>
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(PROVIDER_META) as Provider[]).map((p) => {
            const m = PROVIDER_META[p]
            return (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-lg border text-[9px] transition-colors',
                  provider === p
                    ? 'border-panel-accent/40 bg-panel-accent/10 text-panel-accent'
                    : 'border-white/8 bg-white/4 text-panel-muted hover:text-white hover:border-white/15'
                )}
              >
                <span className={provider === p ? 'text-panel-accent' : m.color}>{m.icon}</span>
                <span className="leading-none text-center">{m.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
        <p className="text-panel-muted/70 text-[9px] mt-1.5 leading-relaxed">{meta.hint}</p>
      </div>

      {/* Agent */}
      <div>
        <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1">Handled by</label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] focus:outline-none focus:border-panel-accent/50"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div>
        <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Customer WhatsApp enquiries"
          required
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder:text-white/30 focus:outline-none focus:border-panel-accent/50"
        />
      </div>

      {/* Prompt template */}
      <div>
        <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1">
          Task prompt template
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          required
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-[11px] placeholder:text-white/30 focus:outline-none focus:border-panel-accent/50 resize-none font-mono"
        />
        <p className="text-panel-muted/60 text-[9px] mt-0.5">
          Variables: <code className="text-white/50">{'{sender}'}</code> <code className="text-white/50">{'{subject}'}</code> <code className="text-white/50">{'{channel}'}</code> <code className="text-white/50">{'{body}'}</code>
        </p>
      </div>

      {/* Filter (optional) */}
      <div>
        <label className="text-panel-muted text-[9px] uppercase tracking-widest block mb-1">Filter (optional)</label>
        <div className="flex gap-1.5">
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-panel-accent/50"
          >
            {FILTER_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-panel-accent/50"
          >
            {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {op !== 'any' && (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Filter value…"
            className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder:text-white/30 focus:outline-none focus:border-panel-accent/50"
          />
        )}
      </div>

      {error && <p className="text-lamp-blocked text-[10px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !label || !agentId}
        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-panel-accent/15 border border-panel-accent/25 text-panel-accent text-xs font-medium hover:bg-panel-accent/25 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Create trigger rule
      </button>
    </form>
  )
}

// ── Event log view ─────────────────────────────────────────────────────────────

function EventLogView({ ruleId, onBack }: { ruleId: string; onBack: () => void }) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [events,  setEvents]  = useState<InboundEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch(`${API}/api/triggers/${ruleId}/events`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ruleId, API, authFetch])

  return (
    <div className="space-y-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-panel-muted text-[10px] hover:text-white transition-colors"
      >
        ← Back to rules
      </button>

      {loading && (
        <div className="flex justify-center pt-6">
          <Loader2 size={14} className="animate-spin text-panel-muted" />
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-panel-muted text-xs text-center pt-6">No events yet. Send a test payload to see it here.</p>
      )}

      {!loading && events.map((ev) => (
        <div key={ev.id} className={cn(
          'rounded-xl border p-2.5 space-y-1',
          ev.matched ? 'border-white/8 bg-white/4' : 'border-white/4 bg-white/2 opacity-60'
        )}>
          <div className="flex items-center gap-2">
            {ev.matched
              ? <CheckCircle size={10} className="text-lamp-done shrink-0" />
              : <XCircle    size={10} className="text-lamp-blocked shrink-0" />
            }
            <span className="text-white text-[10px] font-medium truncate flex-1">
              {ev.senderInfo ?? ev.provider}
            </span>
            {ev.taskId && (
              <span className="text-panel-accent text-[9px] shrink-0">task created</span>
            )}
            <span className="text-panel-muted text-[9px] shrink-0 flex items-center gap-0.5">
              <Clock size={8} /> {timeAgo(ev.createdAt)}
            </span>
          </div>
          {ev.summary && (
            <p className="text-panel-muted text-[10px] leading-relaxed line-clamp-2 pl-4">{ev.summary}</p>
          )}
          {!ev.matched && (
            <p className="text-panel-muted/60 text-[9px] pl-4">Did not match filter — no task created</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function TriggerRulesPanel({ onClose }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()
  const storeAgents = useAgentsStore((s) => s.agents)

  const [tab,           setTab]           = useState<Tab>('rules')
  const [rules,         setRules]         = useState<TriggerRule[]>([])
  const [loading,       setLoading]       = useState(true)
  const [eventRuleId,   setEventRuleId]   = useState<string | null>(null)

  async function loadRules() {
    setLoading(true)
    try {
      const res = await authFetch(`${API}/api/triggers`).then((r) => r.json())
      if (res.rules) setRules(res.rules)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRules() }, [])

  async function toggleRule(id: string, active: boolean) {
    await authFetch(`${API}/api/triggers/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: active }),
    })
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, isActive: active } : r))
  }

  async function deleteRule(id: string) {
    await authFetch(`${API}/api/triggers/${id}`, { method: 'DELETE' })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function handleCreated(rule: TriggerRule) {
    setRules((prev) => [rule, ...prev])
    setTab('rules')
  }

  const agents = storeAgents.map((a) => ({
    id:       a.id,
    name:     a.name,
    avatarUrl: a.avatarUrl,
    role:     a.role,
  }))

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'rules', label: 'Rules',   count: rules.length },
    { key: 'add',   label: 'New rule' },
    { key: 'events', label: 'Log' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-4 left-[192px] z-30 w-84 flex flex-col rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 120px)', width: '22rem', x: offset.x, y: offset.y }}
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0 cursor-move select-none">
        <Zap size={13} className="text-panel-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium">Inbound Triggers</p>
          <p className="text-panel-muted text-[10px]">WhatsApp · Email · Slack · GitHub · Webhooks</p>
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
            onClick={() => { setTab(t.key); setEventRuleId(null) }}
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
        {loading && tab === 'rules' && (
          <div className="flex justify-center pt-8">
            <Loader2 size={16} className="animate-spin text-panel-muted" />
          </div>
        )}

        {/* Rules list */}
        <AnimatePresence mode="wait">
          {!loading && tab === 'rules' && !eventRuleId && (
            <motion.div key="rules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              {rules.length === 0 ? (
                <div className="flex flex-col items-center gap-2 pt-8 text-center">
                  <Zap size={20} className="text-panel-muted/40" />
                  <p className="text-panel-muted text-xs">No trigger rules yet.</p>
                  <button
                    onClick={() => setTab('add')}
                    className="flex items-center gap-1 text-panel-accent text-[11px] hover:underline"
                  >
                    Create your first rule <ChevronRight size={10} />
                  </button>
                </div>
              ) : (
                rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    apiUrl={process.env.NEXT_PUBLIC_API_URL ?? ''}
                    onToggle={toggleRule}
                    onDelete={deleteRule}
                    onViewEvents={(id) => { setEventRuleId(id); setTab('events') }}
                  />
                ))
              )}
            </motion.div>
          )}

          {/* Add rule form */}
          {tab === 'add' && (
            <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AddRuleForm agents={agents} onCreated={handleCreated} />
            </motion.div>
          )}

          {/* Event log */}
          {tab === 'events' && eventRuleId && (
            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EventLogView ruleId={eventRuleId} onBack={() => { setEventRuleId(null); setTab('rules') }} />
            </motion.div>
          )}

          {tab === 'events' && !eventRuleId && (
            <motion.div key="events-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-panel-muted text-xs text-center pt-8">
                Select a rule from the Rules tab to see its event log.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
