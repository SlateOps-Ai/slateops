'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface ChecklistData {
  agentCount:    number
  workflowCount: number
  triggerCount:  number
}

interface Item {
  key:  string
  label: string
  sub:   string
  done: boolean
}

const STORAGE_KEY = 'slateops_checklist_dismissed'

export function PostOnboardingChecklist() {
  const authFetch  = useAuthFetch()
  const API        = process.env.NEXT_PUBLIC_API_URL
  const [data,      setData]      = useState<ChecklistData | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [visible,   setVisible]   = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return

    Promise.all([
      authFetch(`${API}/api/agents`).then((r) => r.json()),
      authFetch(`${API}/api/workflows`).then((r) => r.json()),
      authFetch(`${API}/api/triggers`).then((r) => r.json()),
    ])
      .then(([agents, workflows, triggers]) => {
        const d: ChecklistData = {
          agentCount:    agents.agents?.length ?? 0,
          workflowCount: workflows.workflows?.length ?? 0,
          triggerCount:  triggers.rules?.length ?? 0,
        }
        setData(d)
        // Only show if checklist is not fully complete
        const allDone = d.agentCount >= 2 && d.workflowCount >= 1 && d.triggerCount >= 1
        if (!allDone) setVisible(true)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API])

  function dismiss() {
    setVisible(false)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!data) return null

  const items: Item[] = [
    { key: 'agent2',   label: 'Hire a second agent',   sub: 'Build a full team — different roles, different strengths.',     done: data.agentCount >= 2    },
    { key: 'workflow', label: 'Build a workflow',       sub: 'Chain agents together to automate a multi-step process.',       done: data.workflowCount >= 1 },
    { key: 'trigger',  label: 'Connect a trigger rule', sub: 'Let emails or webhooks kick off tasks automatically.',          done: data.triggerCount >= 1  },
  ]

  const doneCount = items.filter((i) => i.done).length

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="checklist"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 right-6 z-[200] w-64 rounded-2xl border border-white/10 bg-panel-bg shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
            <div className="flex-1">
              <p className="text-white text-[11px] font-semibold">Getting started</p>
              <p className="text-panel-muted text-[9px]">{doneCount}/{items.length} complete</p>
            </div>
            <button onClick={() => setCollapsed((v) => !v)} className="p-1 rounded text-panel-muted hover:text-white transition-colors">
              {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <button onClick={dismiss} className="p-1 rounded text-panel-muted hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-white/5">
            <div
              className="h-full bg-panel-accent transition-all duration-500"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>

          {/* Items */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-3 py-2 space-y-2">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-start gap-2">
                      {item.done
                        ? <CheckCircle2 size={14} className="text-lamp-done shrink-0 mt-0.5" />
                        : <Circle      size={14} className="text-white/20 shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className={cn('text-[11px] font-medium leading-tight', item.done ? 'text-panel-muted line-through' : 'text-white')}>
                          {item.label}
                        </p>
                        {!item.done && (
                          <p className="text-panel-muted text-[9px] leading-snug mt-0.5">{item.sub}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
