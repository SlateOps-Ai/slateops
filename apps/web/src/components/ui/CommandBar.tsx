'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Send, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { useAgentsStore } from '@/stores/agents.store'
import { SuggestionsBar } from '@/components/ui/SuggestionsBar'

type State = 'idle' | 'loading' | 'clarifying' | 'error'

interface CreditError {
  error:   string
  detail:  string
  byok:    boolean
  actions: { label: string; url: string; primary: boolean }[]
}

const THINKING_STEPS = ['Slateing', 'Opsing', 'Marinating', 'Stewing', 'Mayaing']

// Browser SpeechRecognition — not in all TS lib sets
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null

export function CommandBar() {
  const [value, setValue]           = useState('')
  const [state, setState]           = useState<State>('idle')
  const [question, setQuestion]     = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const [creditError, setCreditError] = useState<CreditError | null>(null)
  const [listening, setListening]   = useState(false)
  const [visibleSteps, setVisibleSteps] = useState<number[]>([])
  const [activeStep,   setActiveStep]   = useState(0)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<any>(null)
  const authFetch  = useAuthFetch()
  const upsertTask = useAgentsStore((s) => s.upsertTask)

  // Tear down recognizer on unmount
  useEffect(() => () => { recognizerRef.current?.abort() }, [])

  // Thinking bubble sequence while loading
  useEffect(() => {
    if (state !== 'loading') { setVisibleSteps([]); setActiveStep(0); return }
    setVisibleSteps([0])
    setActiveStep(0)
    const timers = THINKING_STEPS.slice(1).map((_, i) =>
      setTimeout(() => {
        setVisibleSteps((p) => [...p, i + 1])
        setActiveStep(i + 1)
      }, (i + 1) * 900),
    )
    return () => timers.forEach(clearTimeout)
  }, [state])

  const toggleVoice = useCallback(() => {
    if (!SpeechRecognitionAPI) return

    if (listening) {
      recognizerRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRecognitionAPI()
    rec.lang            = 'en-US'
    rec.interimResults  = false
    rec.maxAlternatives = 1

    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) setValue((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    rec.onerror  = () => setListening(false)
    rec.onend    = () => setListening(false)

    rec.start()
    recognizerRef.current = rec
    setListening(true)
  }, [listening])

  async function submit(cmd = value.trim()) {
    if (!cmd || state === 'loading') return
    setValue('')
    setState('loading')
    setQuestion('')
    setErrorMsg('')

    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks`, {
        method:  'POST',
        body: JSON.stringify({ rawCommand: cmd }),
      })

      if (res.status === 402) {
        const body = await res.json().catch(() => null)
        if (body?.code === 'NO_CREDITS' && body.actions) {
          setCreditError(body as CreditError)
        } else {
          setErrorMsg('No credits remaining.')
        }
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

      if (data.task) {
        upsertTask({ id: data.task.id, agentId: data.task.agentId, title: data.task.title, status: 'IN_PROGRESS' })
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

  function dismiss() { setState('idle'); setQuestion(''); setErrorMsg(''); setCreditError(null) }

  const busy = state === 'loading'

  return (
    <>
    <div className="absolute bottom-6 left-[200px] right-0 z-20 flex justify-center px-4"><div className="w-full max-w-2xl flex flex-col gap-2">

      <SuggestionsBar onSelect={(cmd) => submit(cmd)} />

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
            className={cn(
              'rounded-xl bg-panel-bg border backdrop-blur-sm px-4 py-3',
              creditError ? 'border-amber-400/30' : 'border-lamp-blocked/40',
            )}
          >
            {creditError ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{creditError.error}</p>
                    <p className="text-white/45 text-xs mt-0.5 leading-relaxed">{creditError.detail}</p>
                  </div>
                  <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors shrink-0">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex gap-2 pl-4">
                  {creditError.actions.map((action) => (
                    <a
                      key={action.label}
                      href={action.url}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        action.primary
                          ? 'bg-[#4d7fff] text-white hover:bg-[#3d6fee]'
                          : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10',
                      )}
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-lamp-blocked shrink-0" />
                <p className="text-lamp-blocked text-sm flex-1">{errorMsg}</p>
                <button onClick={dismiss} className="text-panel-muted hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking bubbles */}
      <AnimatePresence>
        {visibleSteps.length > 0 && (
          <motion.div
            key="thinking-bubbles"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-start gap-2"
          >
            {visibleSteps.map((stepIdx) => {
              const isActive = stepIdx === activeStep
              return (
                <motion.div
                  key={stepIdx}
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: isActive ? 1 : 0.38, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl rounded-bl-sm bg-panel-bg border border-white/[0.09] backdrop-blur-sm shadow-lg"
                >
                  <span className={cn('text-sm font-medium', isActive ? 'text-white' : 'text-white/40')}>
                    {THINKING_STEPS[stepIdx]}
                  </span>
                  {isActive ? (
                    <span className="flex items-end gap-[3px] h-4">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-panel-accent animate-bounce"
                          style={{ animationDelay: `${i * 160}ms`, animationDuration: '0.9s' }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="text-white/25 text-xs tracking-widest">···</span>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input box */}
      <div className={cn(
        'flex flex-col rounded-xl border shadow-2xl backdrop-blur-sm transition-colors',
        'bg-panel-bg',
        busy              ? 'border-panel-accent/60' : 'border-white/10',
        state === 'error' && 'border-lamp-blocked/40',
      )}>
        {busy && (
          <span className="w-1.5 h-1.5 rounded-full bg-panel-accent animate-pulse shrink-0 mx-4 mt-4" />
        )}
        <textarea
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
          rows={8}
          className="flex-1 bg-transparent text-white placeholder-panel-muted text-sm outline-none disabled:opacity-60 resize-none px-4 pt-4 pb-2 min-h-[280px]"
        />
        {/* Bottom action row */}
        <div className="flex items-center justify-end gap-1 px-3 pb-3">
          <button
            onClick={toggleVoice}
            title={SpeechRecognitionAPI ? (listening ? 'Stop recording' : 'Speak command') : 'Voice input not supported'}
            disabled={!SpeechRecognitionAPI}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              listening
                ? 'text-lamp-blocked bg-lamp-blocked/10 animate-pulse'
                : 'text-panel-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed'
            )}
          >
            <Mic size={16} />
          </button>
          <button
            onClick={() => submit()}
            disabled={!value.trim() || busy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              value.trim() && !busy
                ? 'bg-panel-accent text-white hover:bg-panel-accent/80'
                : 'bg-white/5 text-panel-muted cursor-not-allowed'
            )}
          >
            <Send size={13} />
            Send
          </button>
        </div>
      </div>
    </div></div>
    </>
  )
}
