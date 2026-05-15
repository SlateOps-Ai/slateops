'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Twitter, Linkedin, Youtube, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, Link2, Link2Off,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

type Platform = 'TWITTER' | 'LINKEDIN' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE' | 'TIKTOK' | 'THREADS' | 'PINTEREST'

interface SocialAccountInfo {
  connected:    boolean
  handle?:      string
  displayName?: string
}

function TikTokIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.17 8.17 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  )
}
function InstagramIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  )
}
function FacebookIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}
function ThreadsIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="currentColor">
      <path d="M141.537 88.988a66 66 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.452-15.153 9.898-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 6.981 10.009 15.86 12.832 26.48l16.221-4.333c-3.412-12.586-8.879-23.393-16.337-32.24C147.851 12.424 125.907 2.217 97.161 2h-.326C68.104 2.217 46.402 12.48 32.059 30.44 19.228 46.605 12.577 69.086 12.36 96.003l-.002.498.002.497c.217 26.917 6.868 49.398 19.699 65.563C46.402 179.52 68.104 189.783 96.835 190h.326c25.04-.174 42.637-6.708 57.084-21.146 19.011-19.009 18.428-42.967 12.177-57.625-4.461-10.406-13.009-18.976-24.885-24.241zm-44.54 38.013c-10.44.572-21.289-4.098-21.82-14.135-.397-7.441 5.296-15.746 22.461-16.735 1.966-.113 3.895-.169 5.79-.169 6.235 0 12.068.606 17.371 1.765-1.978 24.702-13.058 28.713-23.802 29.274z" />
    </svg>
  )
}
function PinterestIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  )
}

const ALL_PLATFORMS: Platform[] = ['TWITTER', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'THREADS', 'PINTEREST']

const PLATFORM_META: Record<Platform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  TWITTER:   { label: 'X / Twitter', icon: <Twitter       size={12} />, color: 'text-sky-400',   bg: 'bg-sky-400/10' },
  LINKEDIN:  { label: 'LinkedIn',    icon: <Linkedin      size={12} />, color: 'text-blue-500',  bg: 'bg-blue-500/10' },
  INSTAGRAM: { label: 'Instagram',   icon: <InstagramIcon size={12} />, color: 'text-pink-400',  bg: 'bg-pink-400/10' },
  FACEBOOK:  { label: 'Facebook',    icon: <FacebookIcon  size={12} />, color: 'text-blue-400',  bg: 'bg-blue-400/10' },
  YOUTUBE:   { label: 'YouTube',     icon: <Youtube       size={12} />, color: 'text-red-500',   bg: 'bg-red-500/10' },
  TIKTOK:    { label: 'TikTok',      icon: <TikTokIcon    size={12} />, color: 'text-white',     bg: 'bg-white/10' },
  THREADS:   { label: 'Threads',     icon: <ThreadsIcon   size={12} />, color: 'text-white/80',  bg: 'bg-white/10' },
  PINTEREST: { label: 'Pinterest',   icon: <PinterestIcon size={12} />, color: 'text-red-400',   bg: 'bg-red-400/10' },
}

export function SocialAccountsSection() {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [accounts, setAccounts] = useState<Record<Platform, SocialAccountInfo>>(
    Object.fromEntries(ALL_PLATFORMS.map((p) => [p, { connected: false }])) as Record<Platform, SocialAccountInfo>
  )
  const [connectingPlatform,  setConnectingPlatform]  = useState<Platform | null>(null)
  const [connectError,        setConnectError]        = useState<string | null>(null)
  const [composioFallbackUrl, setComposioFallbackUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/content/social/status`)
      const data = await res.json()
      if (data.accounts) setAccounts(data.accounts)
    } catch { /* non-fatal */ }
  }, [authFetch, API])

  useEffect(() => { load() }, [load])

  const connectedCount = ALL_PLATFORMS.filter((p) => accounts[p]?.connected).length

  const connect = async (platform: Platform) => {
    setConnectingPlatform(platform)
    setConnectError(null)
    setComposioFallbackUrl(null)
    try {
      const res  = await authFetch(`${API}/api/content/social/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ platform }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.composioFallbackUrl) setComposioFallbackUrl(data.composioFallbackUrl)
        throw new Error(data.error ?? `Failed to connect ${platform}`)
      }
      if (data.redirectUrl) window.open(data.redirectUrl, '_blank')
      else throw new Error('No redirect URL returned from server')
    } catch (err) {
      setConnectError((err as Error).message)
    }
    setConnectingPlatform(null)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link2 size={11} className="text-panel-muted" />
        <p className="text-[10px] uppercase tracking-widest text-panel-muted">Social Accounts</p>
        <span className="text-[10px] text-panel-muted">({connectedCount}/{ALL_PLATFORMS.length})</span>
      </div>
      <p className="text-[11px] text-panel-muted mb-3 leading-relaxed">
        Connect via OAuth — your handle is set by whichever account you log in with.
      </p>
      {connectError && (
        <div className="flex flex-col gap-1.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{connectError}</span>
          </div>
          {composioFallbackUrl && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-red-500/20 text-amber-400">
              <ExternalLink size={11} className="shrink-0" />
              <a href={composioFallbackUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">
                Open Composio →
              </a>
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-white/10 divide-y divide-white/[0.05] overflow-hidden">
        {ALL_PLATFORMS.map((p) => {
          const meta = PLATFORM_META[p]
          const acct = accounts[p]
          return (
            <div key={p} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.bg)}>
                  <span className={meta.color}>{meta.icon}</span>
                </div>
                <div>
                  <p className="text-[12px] text-white">{meta.label}</p>
                  {acct?.connected ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle2 size={9} className="text-emerald-400" />
                      <span className="text-[10px] text-emerald-400">
                        {acct.handle ? `@${acct.handle}` : acct.displayName ?? 'Connected'}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-panel-muted mt-0.5">Not connected</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => connect(p)}
                disabled={connectingPlatform === p}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all',
                  acct?.connected
                    ? 'border-white/10 text-panel-muted hover:text-red-400 hover:border-red-400/30'
                    : 'border-panel-accent/40 text-panel-accent hover:bg-panel-accent/10',
                )}
              >
                {connectingPlatform === p
                  ? <Loader2 size={10} className="animate-spin" />
                  : acct?.connected
                  ? <><Link2Off size={10} /> Reconnect</>
                  : <><Link2 size={10} /> Connect</>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
