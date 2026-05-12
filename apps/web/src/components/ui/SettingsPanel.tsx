'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, CreditCard, Check, Eye, EyeOff } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'

interface Settings {
  name:           string
  email:          string
  plan:           string
  creditsRemaining: number
  byokConfigured: boolean
  byokKey:        string | null
}

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL

  const [settings, setSettings] = useState<Settings | null>(null)
  const [byokInput, setByokInput]   = useState('')
  const [showKey, setShowKey]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  useEffect(() => {
    authFetch(`${API}/api/user/settings`)
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {})
  }, [API, authFetch])

  async function saveByok() {
    const key = byokInput.trim()
    if (!key.startsWith('sk-ant-')) return
    setSaving(true)
    const res = await authFetch(`${API}/api/user/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ byokKey: key }),
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-16 left-4 z-30 w-80 rounded-2xl border border-white/10 bg-panel-bg backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
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
          <div className="flex items-center gap-2 mb-2">
            <Key size={12} className="text-panel-muted" />
            <p className="text-panel-muted text-[10px] font-medium uppercase tracking-wide">
              Bring Your Own Key
            </p>
          </div>

          {settings?.byokConfigured ? (
            <div className="rounded-xl bg-white/5 border border-lamp-done/30 px-3 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-lamp-done text-xs font-medium">Key connected</p>
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
              <p className="text-panel-muted text-[10px] px-0.5">
                Use unlimited tasks with your own Anthropic API key.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={byokInput}
                    onChange={(e) => setByokInput(e.target.value)}
                    placeholder="sk-ant-api03-…"
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
                  disabled={!byokInput.startsWith('sk-ant-') || saving}
                  className="px-3 py-2 rounded-lg bg-panel-accent text-white text-xs font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                >
                  {saved ? <Check size={12} /> : saving ? '…' : 'Save'}
                </button>
              </div>
              <p className="text-panel-muted text-[10px] px-0.5">
                Get your key at{' '}
                <span className="text-panel-accent">console.anthropic.com</span>
              </p>
            </div>
          )}
        </div>

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
