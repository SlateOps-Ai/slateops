'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, FileText, Mail, Calendar, List, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, Download, ChevronDown } from 'lucide-react'
import { useAgentsStore } from '@/stores/agents.store'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'
import { exportFile, FORMAT_LABELS } from '@/lib/fileExport'
import type { TaskResult, ConfidenceBand, FileFormat } from '@agentcity/types'

// Downloadable formats that can always be offered for document/list/text results
const SECONDARY_FORMATS: FileFormat[] = ['docx', 'pdf', 'txt']

const TYPE_ICON: Record<string, React.ReactNode> = {
  document:       <FileText size={14} />,
  email_draft:    <Mail size={14} />,
  calendar_event: <Calendar size={14} />,
  list:           <List size={14} />,
  text:           <FileText size={14} />,
}

const CONFIDENCE_STYLE: Record<ConfidenceBand, { label: string; className: string }> = {
  HIGH:   { label: 'High confidence',   className: 'bg-lamp-done/10 border-lamp-done/30 text-lamp-done' },
  MEDIUM: { label: 'Review suggested',  className: 'bg-lamp-idle/10 border-lamp-idle/30 text-lamp-idle' },
  LOW:    { label: 'Low confidence',    className: 'bg-lamp-blocked/10 border-lamp-blocked/30 text-lamp-blocked' },
}

function ConfidenceChip({ band }: { band: ConfidenceBand }) {
  const s = CONFIDENCE_STYLE[band]
  return (
    <span className={cn('inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium tracking-wide', s.className)}>
      {s.label}
    </span>
  )
}

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold**, *italic*, and `code` spans
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i} className="italic text-white/80">{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px] text-panel-accent">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      nodes.push(
        <pre key={i} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[10px] text-panel-accent font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {codeLines.join('\n')}
        </pre>
      )
      i++
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h1 = line.match(/^# (.+)/)
    if (h1) { nodes.push(<p key={i} className="text-white text-sm font-bold mt-3 mb-1">{renderInline(h1[1])}</p>); i++; continue }
    if (h2) { nodes.push(<p key={i} className="text-white text-[13px] font-semibold mt-2 mb-1">{renderInline(h2[1])}</p>); i++; continue }
    if (h3) { nodes.push(<p key={i} className="text-white/90 text-xs font-medium mt-2 mb-0.5">{renderInline(h3[1])}</p>); i++; continue }

    // Unordered list item
    if (line.match(/^[-*] /)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(
          <li key={i} className="flex items-start gap-2 text-[11px] text-white/90">
            <span className="text-panel-accent mt-0.5 shrink-0">•</span>
            <span>{renderInline(lines[i].replace(/^[-*] /, ''))}</span>
          </li>
        )
        i++
      }
      nodes.push(<ul key={`ul-${i}`} className="space-y-0.5 my-1">{items}</ul>)
      continue
    }

    // Ordered list item
    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = []
      let num = 1
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(
          <li key={i} className="flex items-start gap-2 text-[11px] text-white/90">
            <span className="text-panel-accent shrink-0 w-4 text-right">{num}.</span>
            <span>{renderInline(lines[i].replace(/^\d+\. /, ''))}</span>
          </li>
        )
        i++; num++
      }
      nodes.push(<ol key={`ol-${i}`} className="space-y-0.5 my-1">{items}</ol>)
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      nodes.push(<hr key={i} className="border-white/10 my-2" />)
      i++; continue
    }

    // Blank line — small spacer
    if (line.trim() === '') {
      nodes.push(<div key={i} className="h-1" />)
      i++; continue
    }

    // Normal paragraph line
    nodes.push(
      <p key={i} className="text-[11px] text-white/90 leading-relaxed">{renderInline(line)}</p>
    )
    i++
  }

  return <div className="space-y-0.5">{nodes}</div>
}

function ResultBody({ result }: { result: TaskResult }) {
  // Unwrap double-wrapping: model sometimes puts the full {type,title,content} object
  // inside the content field, either as an object or as a JSON string.
  let content = result.content as any

  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object' && 'content' in parsed) {
          content = parsed.content
        }
      } catch { /* not JSON — use the string as-is */ }
    }
  } else if (content && typeof content === 'object' && !Array.isArray(content) && 'content' in content) {
    content = (content as Record<string, unknown>).content
  }

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

  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  if (result.type === 'document' || result.type === 'text') {
    return (
      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 max-h-64 overflow-y-auto scrollbar-none">
        <MarkdownBlock text={text} />
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 max-h-56 overflow-y-auto scrollbar-none">
      <pre className="text-white text-[11px] leading-relaxed whitespace-pre-wrap font-sans">{text}</pre>
    </div>
  )
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
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-panel-muted hover:text-white hover:border-white/20 text-xs transition-all"
    >
      {copied ? <Check size={12} className="text-lamp-done" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function DownloadButton({ result }: { result: TaskResult }) {
  const [open,        setOpen]        = useState(false)
  const [downloading, setDownloading] = useState<FileFormat | null>(null)

  // Primary format explicitly requested by the agent (e.g. 'docx', 'xlsx', 'pdf')
  const primary = (result as any).format as FileFormat | undefined

  // Always offer docx/pdf/txt for document-like results, xlsx/csv for list results
  const extras: FileFormat[] = primary
    ? []
    : result.type === 'list'
      ? SECONDARY_FORMATS.filter((f) => f !== 'xlsx')
      : result.type === 'document' || result.type === 'text'
        ? SECONDARY_FORMATS
        : []

  const content = typeof result.content === 'string'
    ? result.content
    : JSON.stringify(result.content, null, 2)

  async function download(fmt: FileFormat) {
    setDownloading(fmt)
    setOpen(false)
    try { await exportFile(fmt, content, result.title) } catch { /* silent */ }
    setDownloading(null)
  }

  if (!primary && !extras.length) return null

  // Single format — just a button
  if (primary && !extras.length) {
    return (
      <button
        onClick={() => download(primary)}
        disabled={!!downloading}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-panel-muted hover:text-white hover:border-panel-accent/40 hover:text-panel-accent text-xs transition-all disabled:opacity-50"
      >
        <Download size={12} className={downloading ? 'animate-bounce' : ''} />
        {downloading ? 'Exporting…' : FORMAT_LABELS[primary]}
      </button>
    )
  }

  // Multi-format dropdown
  const all: FileFormat[] = primary ? [primary, ...extras] : extras
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!!downloading}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-panel-muted hover:text-white hover:border-panel-accent/40 hover:text-panel-accent text-xs transition-all disabled:opacity-50"
      >
        <Download size={12} className={downloading ? 'animate-bounce' : ''} />
        {downloading ? 'Exporting…' : 'Download'}
        <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-1.5 left-0 min-w-[130px] rounded-xl border border-white/10 bg-panel-bg shadow-xl overflow-hidden z-50"
          >
            {all.map((fmt) => (
              <button
                key={fmt}
                onClick={() => download(fmt)}
                className="w-full text-left px-3 py-2 text-xs text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
              >
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function getCopyText(result: TaskResult): string {
  const c = result.content as any
  if (result.type === 'email_draft') {
    return [c?.to && `To: ${c.to}`, c?.subject && `Subject: ${c.subject}`, c?.body]
      .filter(Boolean).join('\n')
  }
  if (result.type === 'list' && Array.isArray(c)) return c.join('\n')
  if (typeof c === 'string') return c
  return JSON.stringify(c, null, 2)
}

function FeedbackButtons({ taskId, current }: { taskId: string; current: 'POSITIVE' | 'NEGATIVE' | null | undefined }) {
  const authFetch = useAuthFetch()
  const setCompletedTaskRating = useAgentsStore((s) => s.setCompletedTaskRating)
  const API = process.env.NEXT_PUBLIC_API_URL

  async function rate(rating: 'POSITIVE' | 'NEGATIVE') {
    if (current === rating) return
    setCompletedTaskRating(rating)
    await authFetch(`${API}/api/tasks/${taskId}/feedback`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    }).catch(() => {})
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => rate('POSITIVE')}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          current === 'POSITIVE'
            ? 'text-lamp-done bg-lamp-done/10'
            : 'text-panel-muted hover:text-lamp-done hover:bg-lamp-done/10'
        )}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => rate('NEGATIVE')}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          current === 'NEGATIVE'
            ? 'text-lamp-blocked bg-lamp-blocked/10'
            : 'text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10'
        )}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  )
}

function RetryButton({ taskId, agentId, onDismiss }: { taskId: string; agentId: string; onDismiss: () => void }) {
  const authFetch = useAuthFetch()
  const API = process.env.NEXT_PUBLIC_API_URL
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    try {
      const res  = await authFetch(`${API}/api/tasks/${taskId}`)
      const data = await res.json()
      const rawCommand = data.task?.rawCommand
      if (!rawCommand) return
      await authFetch(`${API}/api/tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rawCommand, agentId }),
      })
      onDismiss()
    } catch {
      /* non-fatal */
    } finally {
      setRetrying(false)
    }
  }

  return (
    <button
      onClick={retry}
      disabled={retrying}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-panel-muted hover:text-white hover:border-white/20 text-xs transition-all disabled:opacity-50"
    >
      <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  )
}

export function TaskResultPanel() {
  const completedTask      = useAgentsStore((s) => s.completedTask)
  const agents             = useAgentsStore((s) => s.agents)
  const setCompletedTask   = useAgentsStore((s) => s.setCompletedTask)

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
          <div
            className="pointer-events-auto w-full max-w-lg mx-4 rounded-2xl border bg-panel-bg shadow-2xl backdrop-blur-sm overflow-hidden"
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
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-panel-accent">
                      {TYPE_ICON[completedTask.result.type]}
                      {completedTask.result.type.replace('_', ' ')}
                    </span>
                    {completedTask.confidence && (
                      <ConfidenceChip band={completedTask.confidence} />
                    )}
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
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-2">
                {completedTask.status === 'COMPLETE' && completedTask.result && (
                  <CopyButton text={getCopyText(completedTask.result)} />
                )}
                {completedTask.status === 'COMPLETE' && completedTask.result && (
                  <DownloadButton result={completedTask.result} />
                )}
                {completedTask.status === 'COMPLETE' && (
                  <FeedbackButtons
                    taskId={completedTask.taskId}
                    current={completedTask.userRating}
                  />
                )}
                <RetryButton
                  taskId={completedTask.taskId}
                  agentId={completedTask.agentId}
                  onDismiss={dismiss}
                />
              </div>
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
