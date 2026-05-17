import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { prisma } from '../../lib/prisma.js'
import { assertPublicUrl } from '../../lib/safe-fetch.js'

const MAX_BYTES        = 10 * 1024 * 1024   // 10 MB
const MAX_EXTRACT_CHARS = 200_000           // cap extracted text per doc

interface Extracted {
  text:     string
  mimeType: string
}

/**
 * Detect document type from MIME + filename, run the appropriate parser,
 * return plain text. Throws on unsupported types or extraction failures.
 */
async function extractText(buf: Buffer, mimeType: string, filename?: string): Promise<Extracted> {
  const lowerName = (filename ?? '').toLowerCase()
  const isPdf     = mimeType === 'application/pdf' || lowerName.endsWith('.pdf')
  const isDocx    = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')
  const isXlsx    = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')
  const isCsv     = mimeType === 'text/csv' || lowerName.endsWith('.csv')
  const isText    = mimeType.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')

  if (isPdf) {
    // pdf-parse v2 exposes a class instead of a function — instantiate,
    // call getText(), destroy() to free pdfjs worker memory.
    const { PDFParse } = await import('pdf-parse')
    const parser       = new PDFParse({ data: buf })
    try {
      const result = await parser.getText()
      return { text: result.text, mimeType: 'application/pdf' }
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  if (isDocx) {
    const mammoth = await import('mammoth')
    const result  = await mammoth.extractRawText({ buffer: buf })
    return { text: result.value, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  }

  if (isXlsx || isCsv) {
    const xlsx     = await import('xlsx')
    const workbook = xlsx.read(buf, { type: 'buffer' })
    // Emit each sheet as a labelled CSV block so the LLM sees the structure.
    const sheets   = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      const csv   = xlsx.utils.sheet_to_csv(sheet)
      return `--- Sheet: ${sheetName} ---\n${csv}`
    }).join('\n\n')
    return {
      text: sheets,
      mimeType: isXlsx
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
    }
  }

  if (isText) {
    return { text: buf.toString('utf8'), mimeType: mimeType || 'text/plain' }
  }

  throw new Error(`Unsupported document type: ${mimeType || filename || 'unknown'}`)
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n) + `\n\n… [truncated; original was ${s.length.toLocaleString()} chars]`
}

export default async function brainDocumentsRoute(app: FastifyInstance) {
  // Scoped multipart registration — limits apply only to this plugin's
  // routes, so other JSON endpoints aren't affected.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_BYTES,
      files:    1,
      fields:   8,
    },
  })

  // ── GET /api/brain/documents — list summaries (no full text) ──────────
  app.get('/api/brain/documents', async (req, reply) => {
    const userId = req.dbUserId
    const docs   = await prisma.brainDocument.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, source: true, sourceUrl: true,
        originalFilename: true, mimeType: true, sizeBytes: true,
        summary: true, accessCount: true, createdAt: true,
      },
    })
    return reply.send({ documents: docs })
  })

  // ── GET /api/brain/documents/:id — return full extracted text ─────────
  app.get('/api/brain/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId

    const doc = await prisma.brainDocument.findFirst({
      where: { id, userId },
    })
    if (!doc) return reply.code(404).send({ error: 'Document not found' })

    // Non-blocking access counter bump (used for relevance scoring later).
    prisma.brainDocument.update({
      where: { id },
      data:  { accessCount: { increment: 1 } },
    }).catch(() => {})

    return reply.send({ document: doc })
  })

  // ── POST /api/brain/documents/upload — multipart file upload ──────────
  app.post('/api/brain/documents/upload', async (req, reply) => {
    const userId = req.dbUserId

    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'No file uploaded' })

    let buf: Buffer
    try {
      buf = await file.toBuffer()
    } catch (err) {
      const msg = (err as Error).message
      if (msg?.toLowerCase().includes('limit')) {
        return reply.code(413).send({ error: `File too large. Maximum ${MAX_BYTES / 1024 / 1024} MB.` })
      }
      return reply.code(400).send({ error: 'Could not read upload' })
    }

    if (buf.length === 0) return reply.code(400).send({ error: 'File is empty' })

    let extracted: Extracted
    try {
      extracted = await extractText(buf, file.mimetype ?? '', file.filename)
    } catch (err) {
      return reply.code(415).send({ error: (err as Error).message })
    }

    const trimmed = truncate(extracted.text.trim(), MAX_EXTRACT_CHARS)
    if (trimmed.length === 0) {
      return reply.code(422).send({ error: 'Could not extract any text from this document.' })
    }

    const doc = await prisma.brainDocument.create({
      data: {
        userId,
        name:             file.filename ?? 'Untitled document',
        source:           'UPLOAD',
        originalFilename: file.filename ?? null,
        mimeType:         extracted.mimeType,
        sizeBytes:        buf.length,
        extractedText:    trimmed,
      },
      select: {
        id: true, name: true, source: true, originalFilename: true,
        mimeType: true, sizeBytes: true, summary: true, accessCount: true,
        createdAt: true,
      },
    })

    return reply.code(201).send({ document: doc })
  })

  // ── POST /api/brain/documents/url — fetch + extract from a public URL ─
  app.post('/api/brain/documents/url', async (req, reply) => {
    const userId = req.dbUserId
    const body   = (req.body ?? {}) as { url?: string; name?: string }
    const url    = (body.url ?? '').trim()
    if (!url) return reply.code(400).send({ error: 'url is required' })

    // SSRF guard — reject private IP ranges, loopback, metadata endpoints.
    try {
      await assertPublicUrl(url)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'follow',
        signal:   AbortSignal.timeout(15_000),
      })
    } catch (err) {
      return reply.code(502).send({ error: `Could not fetch URL: ${(err as Error).message}` })
    }

    if (!res.ok) return reply.code(502).send({ error: `Source returned ${res.status}` })

    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength && contentLength > MAX_BYTES) {
      return reply.code(413).send({ error: `Source too large (${(contentLength / 1024 / 1024).toFixed(1)} MB; max ${MAX_BYTES / 1024 / 1024} MB).` })
    }

    const ab  = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    if (buf.length > MAX_BYTES) {
      return reply.code(413).send({ error: `Source too large (max ${MAX_BYTES / 1024 / 1024} MB).` })
    }
    if (buf.length === 0) return reply.code(422).send({ error: 'Source is empty' })

    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    const urlName  = body.name?.trim() || new URL(url).pathname.split('/').filter(Boolean).pop() || url

    let extracted: Extracted
    try {
      extracted = await extractText(buf, mimeType, urlName)
    } catch (err) {
      return reply.code(415).send({ error: (err as Error).message })
    }

    const trimmed = truncate(extracted.text.trim(), MAX_EXTRACT_CHARS)
    if (trimmed.length === 0) {
      return reply.code(422).send({ error: 'Could not extract any text from this URL.' })
    }

    const doc = await prisma.brainDocument.create({
      data: {
        userId,
        name:          urlName,
        source:        'URL',
        sourceUrl:     url,
        mimeType:      extracted.mimeType,
        sizeBytes:     buf.length,
        extractedText: trimmed,
      },
      select: {
        id: true, name: true, source: true, sourceUrl: true,
        mimeType: true, sizeBytes: true, summary: true, accessCount: true,
        createdAt: true,
      },
    })

    return reply.code(201).send({ document: doc })
  })

  // ── DELETE /api/brain/documents/:id ───────────────────────────────────
  app.delete('/api/brain/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.dbUserId
    await prisma.brainDocument.deleteMany({ where: { id, userId } })
    return reply.send({ ok: true })
  })
}
