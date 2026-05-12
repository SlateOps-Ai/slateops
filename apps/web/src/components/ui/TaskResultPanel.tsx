'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, FileText, Mail, Calendar, List } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { cn } from '@/lib/utils'
import type { TaskResult } from '@agentcity/types'

const TYPE_ICON: Record<string, React.ReactNode> = {
  document:       <FileText size={14} />,
  email_draft:    <Mail size={14} />,
  calendar_event: <Calendar size={14} />,
  list:           <List size={14} />,
  text:           <FileText size={14} />,
}

function ResultBody({ result }: { result: TaskResult }) {
  const content = result.content as any

  if (result.type === 'email_draft') {
    return (
      <div className="space-y-2 text-sm">
        {content?.to && (
          <div className="flex gap-2">
            <span className="text-panel-muted text-xs w-14 shrink-0 pt-0.5">To</span>
            <span className="text-white text-xs">{String(content.to)}</span>
          </div>
        )}
        {content?.subject && (
          <div className="flex gap-2">
            <span className="text-panel-muted text-xs w-14 shrink-0 pt-0.5">Subject</span>
            <span className="text-white text-xs font-medium">{String(content.subject)}</span>
          </div>
        )}
        {content?.body && (
          <div className="mt-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
            <pre className="text-white text-[11px] leading-relaxed whitespace-pre-wrap font-sans">
              {String(content.body)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  if (result.type === 'calendar_event') {
    return (
      <div className="space-y-1.5">
        {content?.title    && <p className="text-white text-sm font-medium">{String(content.title)}</p>}
        {content?.start    && <p className="text-panel-muted text-xs">Start: {String(content.start)}</p>}
        {content?.end      && <p className="text-panel-muted text-xs">End: {String(content.end)}</p>}
        {content?.location && <p className="text-panel-muted text-xs">Location: {String(content.location)}</p>}
      </div>
    )
  }

  if (result.type === 'list' && Array.isArray(content)) {
    return (
      <ul className="space-y-1">
        {content.map((item: unknown, i: number) => (
          <li key={i} className="flex items-start gap-2 text-xs text-white">
            <span className="text-panel-accent mt-0.5 shrink-0">•</span>
            <span>{String(item)}</span>
          </li>
        ))}
      </ul>
    )
  }

  // text / document / fallback
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 max-h-56 overflow-y-auto scrollbar-none">
      <pre className="text-white text-[11px] leading-relaxed whitespace-pre-wrap font-sans">{text}</pre>
    </div>
  )
}

export function TaskResultPanel() {
  const completedTask   = useAgentsStore((s) => s.completedTask)
  const agents          = useAgentsStore((s) => s.agents)
  const setCompletedTask = useAgentsStore((s) => s.setCompletedTask)

  function dismiss() {
    if (!completedTask) return
    const agent = agents.find((a) => a.id === completedTask.agentId)
    const actor = (agent as any)?.directorActor
    actor?.send({ type: 'RESULT_DISMISSED' })
    setCompletedTask(null)
  }

  return (
    <AnimatePresence>
      {completedTask && (
        <motion.div
          key="result-panel"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-lg mx-4 rounded-2xl border bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
            style={{ borderColor: completedTask.status === 'COMPLETE' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              {completedTask.status === 'COMPLETE'
                ? <CheckCircle size={16} className="text-lamp-done shrink-0" />
                : <AlertCircle size={16} className="text-lamp-blocked shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{completedTask.title}</p>
                <p className="text-panel-muted text-[10px]">
                  {completedTask.agentName} · {completedTask.status === 'COMPLETE' ? 'complete' : 'failed'}
                </p>
              </div>
              <button
                onClick={dismiss}
                className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              {completedTask.status === 'COMPLETE' && completedTask.result ? (
                <>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className={cn('flex items-center gap-1 text-[10px] uppercase tracking-widest',
                      'text-panel-accent'
                    )}>
                      {TYPE_ICON[completedTask.result.type]}
                      {completedTask.result.type.replace('_', ' ')}
                    </span>
                  </div>
                  <ResultBody result={completedTask.result} />
                </>
              ) : (
                <p className="text-lamp-blocked text-sm">
                  {completedTask.error ?? 'The task could not be completed.'}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end px-4 pb-4">
              <button
                onClick={dismiss}
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-medium hover:bg-white/15 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
