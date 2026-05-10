'use client'

import { useState, useRef } from 'react'
import { Mic, Send, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

type State = 'idle' | 'loading' | 'clarifying' | 'error'

export function CommandBar() {
  const [value, setValue]         = useState('')
  const [state, setState]         = useState<State>('idle')
  const [question, setQuestion]   = useState('')
  const [errorMsg, setErrorMsg]   = useState('')
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(cmd = value.trim()) {
    if (!cmd || state === 'loading') return
    setValue('')
    setState('loading')
    setQuestion('')
    setErrorMsg('')

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rawCommand: cmd }),
      })

      if (res.status === 402) {
        setErrorMsg('No credits remaining. Upgrade to Pro to continue.')
        setState('error')
        return
      }

      const data = await res.json()

      if (data.clarification) {
        setQuestion(data.question ?? 'Can you clarify?')
        setState('clarifying')
        return
      }

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong.')
        setState('error')
        return
      }

      setState('idle')
    } catch {
      setErrorMsg('Could not reach the server.')
      setState('error')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'Escape') { setState('idle'); setQuestion(''); setErrorMsg('') }
  }

  function dismiss() { setState('idle'); setQuestion(''); setErrorMsg('') }

  const busy = state === 'loading'

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4 flex flex-col gap-2">

      {/* Clarification banner */}
      <AnimatePresence>
        {state === 'clarifying' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 rounded-xl bg-panel-bg border border-panel-accent/40 px-4 py-3 backdrop-blur-sm"
          >
            <span className="text-panel-accent text-xs mt-0.5">?</span>
            <p className="text-white text-sm flex-1">{question}</p>
            <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {state === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 rounded-xl bg-panel-bg border border-lamp-blocked/40 px-4 py-3 backdrop-blur-sm"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-lamp-blocked shrink-0" />
            <p className="text-lamp-blocked text-sm flex-1">{errorMsg}</p>
            <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className={cn(
        'flex items-center gap-2 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-colors',
        'bg-panel-bg',
        busy           ? 'border-panel-accent/60' : 'border-white/10',
        state === 'error' && 'border-lamp-blocked/40',
      )}>
        {busy && (
          <span className="w-1.5 h-1.5 rounded-full bg-panel-accent animate-pulse shrink-0" />
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            state === 'clarifying'
              ? 'Reply to clarify…'
              : busy
              ? 'Routing to your team…'
              : 'Tell your team what to do…'
          }
          disabled={busy}
          className="flex-1 bg-transparent text-white placeholder-panel-muted text-sm outline-none disabled:opacity-60"
        />
        <button
          onClick={() => submit()}
          disabled={!value.trim() || busy}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            value.trim() && !busy
              ? 'text-panel-accent hover:bg-white/10'
              : 'text-panel-muted cursor-not-allowed'
          )}
        >
          <Send size={16} />
        </button>
        <button
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            listening
              ? 'text-lamp-blocked animate-pulse'
              : 'text-panel-muted hover:text-white hover:bg-white/10'
          )}
          onMouseDown={() => setListening(true)}
          onMouseUp={() => setListening(false)}
        >
          <Mic size={16} />
        </button>
      </div>
    </div>
  )
}
