'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, Users, Plug, Terminal, Check, ArrowRight, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface Step {
  id:       number
  icon:     React.ReactNode
  title:    string
  subtitle: string
  cta:      string
  tip:      string
}

const STEPS: Step[] = [
  {
    id:       1,
    icon:     <Rocket size={28} />,
    title:    'Welcome to SlateOps',
    subtitle: 'Your AI-powered office — where agents handle the work so you can focus on decisions.',
    cta:      'Get started',
    tip:      'SlateOps agents run real tasks using your connected tools and data.',
  },
  {
    id:       2,
    icon:     <Users size={28} />,
    title:    'Hire your first agent',
    subtitle: 'Each agent has a role, personality, and skills. Click the + button in the Agent Roster to create one.',
    cta:      'Got it',
    tip:      'Try an Executive Assistant first — they\'re great at emails, research, and scheduling.',
  },
  {
    id:       3,
    icon:     <Plug size={28} />,
    title:    'Connect your tools',
    subtitle: 'Agents become powerful when they can access Gmail, Slack, Notion, and your other tools.',
    cta:      'Got it',
    tip:      'Open the MCP panel (⚡ icon) or Integrations in Settings to connect your first tool.',
  },
  {
    id:       4,
    icon:     <Terminal size={28} />,
    title:    'Give your agent a task',
    subtitle: 'Type a natural language command in the command bar at the bottom. Your agent will plan and execute it.',
    cta:      'Start using SlateOps',
    tip:      'Try: "Draft a cold outreach email to a SaaS founder in the logistics space"',
  },
]

interface Props {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: Props) {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL
  const [step, setStep]     = useState(0)
  const [exiting, setExiting] = useState(false)

  const current  = STEPS[step]
  const isLast   = step === STEPS.length - 1

  async function advance() {
    if (isLast) {
      setExiting(true)
      // Mark onboarding done server-side
      authFetch(`${API}/api/user/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ onboardingDone: true }),
      }).catch(() => {})
      setTimeout(onComplete, 400)
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
    >
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md mx-4 rounded-3xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
      >
        {/* Progress dots */}
        <div className="absolute top-5 left-0 right-0 flex justify-center gap-1.5 z-10">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-panel-accent' : i < step ? 'w-3 bg-panel-accent/40' : 'w-3 bg-white/15'
              )}
            />
          ))}
        </div>

        {/* Skip button */}
        <button
          onClick={() => { setExiting(true); authFetch(`${API}/api/user/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboardingDone: true }) }).catch(() => {}); setTimeout(onComplete, 400) }}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors z-10"
          title="Skip onboarding"
        >
          <X size={14} />
        </button>

        {/* Icon hero area */}
        <div className="flex items-center justify-center pt-16 pb-8">
          <div className="w-20 h-20 rounded-2xl bg-panel-accent/15 border border-panel-accent/25 flex items-center justify-center text-panel-accent">
            {current.icon}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-4 text-center">
          <h2 className="text-white text-xl font-bold mb-2">{current.title}</h2>
          <p className="text-panel-muted text-sm leading-relaxed">{current.subtitle}</p>
        </div>

        {/* Tip box */}
        <div className="mx-8 mb-6 rounded-xl bg-white/4 border border-white/8 px-4 py-3">
          <p className="text-[11px] text-panel-muted/80 leading-relaxed">
            <span className="text-panel-accent font-semibold">Tip: </span>
            {current.tip}
          </p>
        </div>

        {/* Step checklist */}
        <div className="mx-8 mb-6 space-y-1.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className={cn('flex items-center gap-2 text-xs', i < step ? 'text-panel-muted/50' : i === step ? 'text-white' : 'text-panel-muted/30')}>
              <div className={cn('w-4 h-4 rounded-full flex items-center justify-center shrink-0 border',
                i < step  ? 'bg-panel-accent/30 border-panel-accent/40' :
                i === step ? 'bg-panel-accent/20 border-panel-accent/50' :
                             'border-white/10'
              )}>
                {i < step && <Check size={9} className="text-panel-accent" />}
                {i === step && <div className="w-1.5 h-1.5 rounded-full bg-panel-accent" />}
              </div>
              <span>{s.title}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-8 pb-8">
          <button
            onClick={advance}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-panel-accent hover:bg-panel-accent/90 text-white text-sm font-semibold transition-all active:scale-[0.98]"
          >
            {current.cta}
            {isLast ? <Check size={15} /> : <ArrowRight size={15} />}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
