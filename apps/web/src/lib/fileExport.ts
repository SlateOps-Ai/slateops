import type { FileFormat } from '@agentcity/types'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'document'
}

// ── CSV / TXT — no library needed ─────────────────────────────────────────

function exportCsv(content: string, title: string) {
  triggerDownload(new Blob([content], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFilename(title)}.csv`)
}

function exportTxt(content: string, title: string) {
  triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8;' }), `${sanitizeFilename(title)}.txt`)
}

// ── XLSX ───────────────────────────────────────────────────────────────────

async function exportXlsx(content: string, title: string) {
  const XLSX = await import('xlsx')
  // Parse CSV-formatted content the AI produced
  const wb  = XLSX.read(content, { type: 'string' })
  XLSX.writeFile(wb, `${sanitizeFilename(title)}.xlsx`)
}

// ── DOCX ───────────────────────────────────────────────────────────────────

async function exportDocx(content: string, title: string) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = await import('docx')

  const paragraphs: Paragraph[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    if (!line.trim()) { paragraphs.push(new Paragraph({ text: '' })); continue }

    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    const li  = line.match(/^[-*] (.+)/)
    const oli = line.match(/^\d+\. (.+)/)

    if (h1) {
      paragraphs.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 }))
    } else if (h2) {
      paragraphs.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 }))
    } else if (h3) {
      paragraphs.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 }))
    } else if (li) {
      paragraphs.push(new Paragraph({ text: `• ${li[1]}`, indent: { left: 360 } }))
    } else if (oli) {
      paragraphs.push(new Paragraph({ text: line, indent: { left: 360 } }))
    } else {
      // Handle inline bold/italic
      const runs: TextRun[] = []
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
        } else if (part.startsWith('*') && part.endsWith('*')) {
          runs.push(new TextRun({ text: part.slice(1, -1), italics: true }))
        } else {
          runs.push(new TextRun({ text: part }))
        }
      }
      paragraphs.push(new Paragraph({ children: runs }))
    }
  }

  const doc   = new Document({ sections: [{ children: paragraphs }] })
  const blob  = await Packer.toBlob(doc)
  triggerDownload(blob, `${sanitizeFilename(title)}.docx`)
}

// ── PDF ────────────────────────────────────────────────────────────────────

async function exportPdf(content: string, title: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const margin    = 20
  const lineH     = 6
  const maxWidth  = 170
  let   y         = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, margin, y)
  y += lineH * 1.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const lines = content.split('\n')
  for (const line of lines) {
    if (y > 270) { doc.addPage(); y = margin }

    if (!line.trim()) { y += lineH * 0.4; continue }

    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)

    if (h1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text(h1[1], margin, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      y += lineH * 1.4
    } else if (h2) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text(h2[1], margin, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      y += lineH * 1.2
    } else if (h3) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(h3[1], margin, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      y += lineH
    } else {
      const clean = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
      const wrapped = doc.splitTextToSize(clean, maxWidth)
      for (const wline of wrapped) {
        if (y > 270) { doc.addPage(); y = margin }
        doc.text(wline, margin, y)
        y += lineH
      }
    }
  }

  doc.save(`${sanitizeFilename(title)}.pdf`)
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function exportFile(
  format:  FileFormat,
  content: unknown,
  title:   string,
): Promise<void> {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  if (format === 'csv')  return exportCsv(text, title)
  if (format === 'txt')  return exportTxt(text, title)
  if (format === 'xlsx') return exportXlsx(text, title)
  if (format === 'docx') return exportDocx(text, title)
  if (format === 'pdf')  return exportPdf(text, title)
}

export const FORMAT_LABELS: Record<FileFormat, string> = {
  docx: 'Word (.docx)',
  xlsx: 'Excel (.xlsx)',
  pdf:  'PDF',
  csv:  'CSV',
  txt:  'Text',
}
