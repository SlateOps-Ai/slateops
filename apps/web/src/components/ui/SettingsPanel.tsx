'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, CreditCard, Check, Eye, EyeOff, Mail } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useDraggable } from '@/hooks/useDraggable'
import { SocialAccountsSection } from '@/components/ui/SocialAccountsSection'

type ByokProvider = 'ANTHROPIC' | 'OPENAI' | 'GEMINI'

interface Settings {
  name:                string
  email:               string
  plan:                string
  creditsRemaining:    number
  byokConfigured:      boolean
  byokKey:             string | null
  byokProvider:        ByokProvider | null
  weeklyDigestEnabled: boolean
  dailyBriefEnabled:   boolean
}

const PROVIDERS: { id: ByokProvider; label: string; prefix: string; placeholder: string; docsUrl: string }[] = [
  { id: 'ANTHROPIC', label: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-api03-…', docsUrl: 'console.anthropic.com' },
  { id: 'OPENAI',    label: 'OpenAI',    prefix: 'sk-',     placeholder: 'sk-proj-…',       docsUrl: 'platform.openai.com/api-keys' },
  { id: 'GEMINI',    label: 'Gemini',    prefix: '',        placeholder: 'AIza…',           docsUrl: 'aistudio.google.com/app/apikey' },
]

function isValidKey(key: string, provider: ByokProvider) {
  if (provider === 'ANTHROPIC') return key.startsWith('sk-ant-')
  if (provider === 'OPENAI')    return key.startsWith('sk-')
  return key.length >= 20
}

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const { offset, onMouseDown: onDragStart } = useDraggable()

  const [settings, setSettings] = useState<Settings | null>(null)
  const [byokInput,    setByokInput]    = useState('')
  const [byokProvider, setByokProvider] = useState<ByokProvider>('ANTHROPIC')
  const [showKey,      setShowKey]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)

  useEffect(() => {
    authFetch(`${API}/api/user/settings`)
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {})
  }, [API, authFetch])

  async function saveByok() {
    const key = byokInput.trim()
    if (!isValidKey(key, byokProvider)) return
    setSaving(true)
    const res = await authFetch(`${API}/api/user/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ byokKey: key, byokProvider }),
    })
    const data = await res.json()
    setSettings(data.settings)
    setByokInput('')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function clearByok() {
    setSaving(true)
    const res = await authFetch(`${API}/api/user/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ byokKey: null }),
    })
    const data = await res.json()
    setSettings(data.settings)
    setSaving(false)
  }

  const creditsLow  = (settings?.creditsRemaining ?? 0) <= 5
  const creditsGone = (settings?.creditsRemaining ?? 1) <= 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ x: offset.x, y: offset.y }}
      className="absolute bottom-4 left-[242px] z-30 w-80 rounded-2xl border border-white/10 bg-panel-bg backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-4 py-3 border-b border-white/10 cursor-move select-none">
        <p className="text-white text-xs font-medium flex-1">Settings</p>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-5">

        {/* Credits */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={12} className="text-panel-muted" />
            <p className="text-panel-muted text-[10px] font-medium uppercase tracking-wide">Credits</p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <div>
              <p className={`text-sm font-semibold ${creditsGone ? 'text-lamp-blocked' : creditsLow ? 'text-lamp-idle' : 'text-white'}`}>
                {settings?.creditsRemaining ?? '—'} remaining
              </p>
              <p className="text-panel-muted text-[10px] mt-0.5">
                {settings?.plan ?? 'FREE'} plan · resets monthly
              </p>
            </div>
            {creditsLow && (
              <a
                href="mailto:hello@slateops.tech?subject=Upgrade"
                className="text-xs px-2.5 py-1 rounded-lg bg-panel-accent text-white font-medium hover:bg-panel-accent/80 transition-colors"
              >
                Upgrade
              </a>
            )}
          </div>
          {creditsGone && (
            <p className="text-lamp-blocked text-[10px] mt-1.5 px-1">
              Add your own Anthropic key below to keep working without credits.
            </p>
          )}
        </div>

        {/* BYOK */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Key size={12} className="text-panel-muted" />
            <p className="text-white text-[11px] font-semibold">Bring Your Own Key — run without limits</p>
          </div>
          <p className="text-panel-muted text-[10px] mb-2.5 px-0.5">
            Use your own API key from any major provider. No credit limits.
          </p>

          {settings?.byokConfigured ? (
            <div className="rounded-xl bg-white/5 border border-lamp-done/30 px-3 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-lamp-done text-xs font-medium">
                  {settings.byokProvider ?? 'Key'} connected
                </p>
                <p className="text-panel-muted text-[10px] mt-0.5">{settings.byokKey}</p>
              </div>
              <button
                onClick={clearByok}
                disabled={saving}
                className="text-panel-muted hover:text-lamp-blocked text-[10px] transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Provider tabs */}
              <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/8">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setByokProvider(p.id); setByokInput('') }}
                    className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
                      byokProvider === p.id
                        ? 'bg-panel-accent/20 text-panel-accent'
                        : 'text-panel-muted hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={byokInput}
                    onChange={(e) => setByokInput(e.target.value)}
                    placeholder={PROVIDERS.find((p) => p.id === byokProvider)?.placeholder ?? ''}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-xs placeholder-panel-muted outline-none focus:border-panel-accent transition-colors pr-8"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-panel-muted hover:text-white transition-colors"
                  >
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={saveByok}
                  disabled={!isValidKey(byokInput, byokProvider) || saving}
                  className="px-3 py-2 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                >
                  {saved ? <Check size={12} /> : saving ? '…' : 'Save'}
                </button>
              </div>
              <p className="text-panel-muted text-[10px] px-0.5">
                Get your key at{' '}
                <span className="text-panel-accent">
                  {PROVIDERS.find((p) => p.id === byokProvider)?.docsUrl}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Daily brief */}
        {settings && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail size={12} className="text-panel-muted" />
              <p className="text-panel-muted text-[10px] font-medium uppercase tracking-wide">Daily Brief</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div>
                <p className="text-white text-xs">Morning briefing email</p>
                <p className="text-panel-muted text-[10px] mt-0.5">Sent at 8am UTC — tasks done, approvals pending</p>
              </div>
              <button
                onClick={async () => {
                  const next = !settings.dailyBriefEnabled
                  setSettings({ ...settings, dailyBriefEnabled: next })
                  await authFetch(`${API}/api/user/settings`, {
                    method: 'PATCH',
                    body: JSON.stringify({ dailyBriefEnabled: next }),
                  }).catch(() => {})
                }}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                  settings.dailyBriefEnabled ? 'bg-panel-accent' : 'bg-white/10'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  settings.dailyBriefEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        )}

        {/* Social accounts */}
        <SocialAccountsSection />

        {/* Weekly digest */}
        {settings && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail size={12} className="text-panel-muted" />
              <p className="text-panel-muted text-[10px] font-medium uppercase tracking-wide">Weekly Digest</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div>
                <p className="text-white text-xs">Office summary email</p>
                <p className="text-panel-muted text-[10px] mt-0.5">Sent every Sunday with task stats + AI tips</p>
              </div>
              <button
                onClick={async () => {
                  const next = !settings.weeklyDigestEnabled
                  setSettings({ ...settings, weeklyDigestEnabled: next })
                  await authFetch(`${API}/api/user/settings`, {
                    method: 'PATCH',
                    body: JSON.stringify({ weeklyDigestEnabled: next }),
                  }).catch(() => {})
                }}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                  settings.weeklyDigestEnabled ? 'bg-panel-accent' : 'bg-white/10'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  settings.weeklyDigestEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        )}

        {/* Account */}
        {settings && (
          <div className="pt-1 border-t border-white/5">
            <p className="text-panel-muted text-[10px]">{settings.email}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
