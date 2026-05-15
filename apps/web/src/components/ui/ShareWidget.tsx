'use client'

import { useState } from 'react'
import { Share2, X, Copy, Check } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'

interface Props {
  agentId:   string
  agentName: string
  isPublic:  boolean
  onClose:   () => void
}

export function ShareWidget({ agentId, agentName, isPublic: initialIsPublic, onClose }: Props) {
  const [copied,   setCopied]   = useState(false)
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)
  const authFetch   = useAuthFetch()
  const updateAgent = useAgentsStore((s) => s.updateAgent)
  const API = process.env.NEXT_PUBLIC_API_URL

  const widgetUrl  = `${window.location.origin}/widget/${agentId}`
  const embedCode  = `<iframe src="${widgetUrl}" width="380" height="600" frameborder="0" allow="microphone"></iframe>`

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function togglePublic() {
    const next = !isPublic
    setIsPublic(next)
    setToggling(true)
    try {
      await authFetch(`${API}/api/agents/${agentId}`, {
        method: 'PATCH',
        body:   JSON.stringify({ isPublic: next }),
      })
      updateAgent(agentId, { isPublic: next })
    } catch {
      setIsPublic(!next)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="fixed right-[552px] top-1/2 -translate-y-1/2 z-50 w-[384px] rounded-2xl border border-white/10 bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <Share2 size={13} className="text-panel-accent" />
        <span className="text-white text-sm font-medium flex-1 truncate">{agentName} · Share Widget</span>
        <button onClick={onClose} className="p-1 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
          <div>
            <p className="text-white text-xs font-medium">Make agent public</p>
            <p className="text-panel-muted text-[10px] mt-0.5">Required for the widget to work</p>
          </div>
          <button
            onClick={togglePublic}
            disabled={toggling}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              isPublic ? 'bg-panel-accent' : 'bg-white/10'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              isPublic ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {isPublic ? (
          <>
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Direct link</p>
              <div className="flex gap-2 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white text-[10px] flex-1 truncate">{widgetUrl}</span>
                <button onClick={() => copy(widgetUrl)} className="text-panel-muted hover:text-panel-accent transition-colors shrink-0">
                  {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <div>
              <p className="text-panel-muted text-[10px] uppercase tracking-widest mb-1.5">Embed code</p>
              <div className="relative rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <pre className="text-white/60 text-[9px] leading-relaxed whitespace-pre-wrap break-all">{embedCode}</pre>
                <button onClick={() => copy(embedCode)} className="absolute top-2 right-2 text-panel-muted hover:text-panel-accent transition-colors">
                  {copied ? <Check size={11} className="text-lamp-done" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <a
              href={widgetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2 rounded-xl bg-panel-accent/20 border border-panel-accent/30 text-panel-accent text-xs font-medium hover:bg-panel-accent/30 transition-colors"
            >
              Preview widget ↗
            </a>
          </>
        ) : (
          <p className="text-panel-muted text-xs text-center py-2">
            Enable the toggle above to get the embed link.
          </p>
        )}
      </div>
    </div>
  )
}
