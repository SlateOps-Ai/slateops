'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, FileSpreadsheet, FileType, Link as LinkIcon, Upload, X, Loader2, Trash2, ChevronDown,
} from 'lucide-react'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { cn } from '@/lib/utils'

interface BrainDocument {
  id:               string
  name:             string
  source:           'UPLOAD' | 'URL'
  sourceUrl?:       string | null
  originalFilename?: string | null
  mimeType:         string
  sizeBytes:        number
  summary?:         string | null
  accessCount:      number
  createdAt:        string
}

function iconFor(mime: string) {
  if (mime === 'application/pdf') return FileType
  if (mime.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml') || mime === 'text/csv') return FileSpreadsheet
  return FileText
}

function shortSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function CompanyDocumentsSection() {
  const authFetch = useAuthFetch()
  const API       = process.env.NEXT_PUBLIC_API_URL

  const [docs, setDocs]         = useState<BrainDocument[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [urlMode, setUrlMode]   = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Load list on mount ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await authFetch(`${API}/api/brain/documents`)
      const data = await res.json()
      setDocs(data.documents ?? [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [API, authFetch])

  useEffect(() => { refresh() }, [refresh])

  // ── Upload ────────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const file = Array.isArray(files) ? files[0] : files.item(0)
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd  = new FormData()
      fd.append('file', file)
      const res = await authFetch(`${API}/api/brain/documents/upload`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Upload failed (HTTP ${res.status}).`)
        return
      }
      setDocs((prev) => [data.document, ...prev])
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  async function handleUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUploading(true)
    setError(null)
    try {
      const res  = await authFetch(`${API}/api/brain/documents/url`, {
        method: 'POST',
        body:   JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Ingest failed (HTTP ${res.status}).`)
        return
      }
      setDocs((prev) => [data.document, ...prev])
      setUrlInput('')
      setUrlMode(false)
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null)
    await authFetch(`${API}/api/brain/documents/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  async function loadPreview(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setPreviewing(id)
    setPreviewText(null)
    try {
      const res  = await authFetch(`${API}/api/brain/documents/${id}`)
      const data = await res.json()
      setPreviewText(data.document?.extractedText ?? '(no text)')
    } catch {
      setPreviewText('(failed to load)')
    } finally {
      setPreviewing(null)
    }
  }

  return (
    <div className="px-4 py-4 border-b border-white/[0.07]">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={12} className="text-violet-400 shrink-0" />
        <span className="text-xs text-white font-semibold">Company Documents</span>
        <span className="text-[9px] text-panel-muted">— uploaded files the agents can search and quote from</span>
        <span className="ml-auto text-[10px] text-panel-muted/70">{docs.length} {docs.length === 1 ? 'document' : 'documents'}</span>
      </div>

      {/* Drop / upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-xl border-2 border-dashed transition-colors p-4 flex flex-col items-center gap-2',
          dragOver
            ? 'border-violet-400/60 bg-violet-400/8'
            : 'border-white/10 bg-white/[0.02]',
        )}
      >
        {urlMode ? (
          <div className="w-full flex gap-2">
            <input
              autoFocus
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrl()}
              placeholder="https://example.com/doc.pdf"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder-panel-muted/50 outline-none focus:border-violet-500/50"
            />
            <button
              onClick={handleUrl}
              disabled={!urlInput.trim() || uploading}
              className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <LinkIcon size={11} />}
              {uploading ? 'Fetching…' : 'Fetch'}
            </button>
            <button
              onClick={() => { setUrlMode(false); setUrlInput(''); setError(null) }}
              className="p-1.5 rounded-lg text-panel-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={18} className="text-panel-muted/70" />
            <p className="text-[11px] text-white/70">
              Drop a file here, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-violet-300 hover:text-violet-200 underline underline-offset-2 disabled:opacity-50"
              >
                browse
              </button>
              {' '}/{' '}
              <button
                onClick={() => { setUrlMode(true); setError(null) }}
                disabled={uploading}
                className="text-violet-300 hover:text-violet-200 underline underline-offset-2 disabled:opacity-50"
              >
                paste a URL
              </button>
            </p>
            <p className="text-[9px] text-panel-muted">PDF · Word · Excel · CSV · TXT — up to 10 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
          </>
        )}
        {uploading && !urlMode && (
          <div className="flex items-center gap-1.5 text-[10px] text-violet-300">
            <Loader2 size={10} className="animate-spin" /> Extracting text…
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-lamp-blocked/30 bg-lamp-blocked/10 px-3 py-2 text-[11px] text-lamp-blocked">
          {error}
        </div>
      )}

      <p className="mt-2 text-[10px] text-panel-muted/60 leading-relaxed">
        Files on a private server or shared drive aren't directly reachable from a web app — upload them from there, or connect Google Drive / OneDrive via the Connections panel (coming soon).
      </p>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-panel-muted text-xs">
          <Loader2 size={12} className="animate-spin" /> Loading documents…
        </div>
      ) : docs.length === 0 ? null : (
        <div className="mt-4 space-y-1.5">
          {docs.map((d) => {
            const Icon       = iconFor(d.mimeType)
            const isExpanded = expandedId === d.id
            return (
              <div key={d.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  onClick={() => loadPreview(d.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <Icon size={13} className="text-violet-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[12px] font-medium truncate">{d.name}</p>
                    <p className="text-panel-muted text-[10px] truncate">
                      {d.source === 'URL' ? '🔗 URL ingest' : 'Uploaded'}
                      {' · '}{shortSize(d.sizeBytes)}
                      {' · '}{timeAgo(d.createdAt)}
                      {d.accessCount > 0 && ` · used ${d.accessCount}×`}
                    </p>
                  </div>
                  <ChevronDown
                    size={12}
                    className={cn('text-panel-muted transition-transform', isExpanded && 'rotate-180')}
                  />
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(d.id) }}
                    title="Delete document"
                    className="p-1 rounded-md text-panel-muted hover:text-lamp-blocked hover:bg-lamp-blocked/10 transition-colors"
                  >
                    <Trash2 size={11} />
                  </span>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key={`${d.id}-preview`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-white/[0.05]"
                    >
                      <div className="px-3 py-2 text-[11px] text-white/70 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {previewing === d.id ? (
                          <div className="flex items-center gap-1.5 text-panel-muted">
                            <Loader2 size={10} className="animate-spin" /> Loading preview…
                          </div>
                        ) : (
                          previewText ?? '(no text)'
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
