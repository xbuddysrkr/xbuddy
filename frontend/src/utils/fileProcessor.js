/**
 * fileProcessor.js
 * Converts any supported file format into a printable PDF Blob.
 * Each processor is self-contained and returns { pdfBlob, totalPages, thumbnail }.
 */

import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_TYPES = {
  'application/pdf':                                                    { label: 'PDF',  ext: '.pdf',  icon: '📄', category: 'document' },
  'application/msword':                                                 { label: 'DOC',  ext: '.doc',  icon: '📝', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', ext: '.docx', icon: '📝', category: 'document' },
  'application/vnd.ms-powerpoint':                                      { label: 'PPT',  ext: '.ppt',  icon: '📊', category: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PPTX', ext: '.pptx', icon: '📊', category: 'document' },
  'application/vnd.ms-excel':                                           { label: 'XLS',  ext: '.xls',  icon: '📈', category: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':  { label: 'XLSX', ext: '.xlsx', icon: '📈', category: 'document' },
  'application/rtf':                                                    { label: 'RTF',  ext: '.rtf',  icon: '📄', category: 'document' },
  'text/rtf':                                                           { label: 'RTF',  ext: '.rtf',  icon: '📄', category: 'document' },
  'text/plain':                                                         { label: 'TXT',  ext: '.txt',  icon: '📃', category: 'text'     },
  'image/jpeg':                                                         { label: 'JPG',  ext: '.jpg',  icon: '🖼️', category: 'image'    },
  'image/png':                                                          { label: 'PNG',  ext: '.png',  icon: '🖼️', category: 'image'    },
  'image/bmp':                                                          { label: 'BMP',  ext: '.bmp',  icon: '🖼️', category: 'image'    },
  'image/tiff':                                                         { label: 'TIFF', ext: '.tiff', icon: '🖼️', category: 'image'    },
  'image/webp':                                                         { label: 'WEBP', ext: '.webp', icon: '🖼️', category: 'image'    },
  'image/svg+xml':                                                      { label: 'SVG',  ext: '.svg',  icon: '🎨', category: 'image'    },
  'text/html':                                                          { label: 'HTML', ext: '.html', icon: '🌐', category: 'html'     },
}

// Also match by extension for browsers that return wrong MIME
const EXT_MAP = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  rtf: 'text/rtf', txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
  webp: 'image/webp', svg: 'image/svg+xml', html: 'text/html', htm: 'text/html',
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export function resolveFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const mime = SUPPORTED_TYPES[file.type] ? file.type : (EXT_MAP[ext] || null)
  return mime ? { mime, ...SUPPORTED_TYPES[mime] } : null
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// ─── Robust Native ZIP Entry Reader (Browser DecompressionStream) ─────────────

export async function readZipEntryText(buffer, targetRegex) {
  try {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const len = bytes.length

    let offset = 0
    while (offset < len - 30) {
      // Look for ZIP local file header signature 0x04034b50
      if (view.getUint32(offset, true) === 0x04034b50) {
        const compressionMethod = view.getUint16(offset + 8, true)
        let compressedSize = view.getUint32(offset + 18, true)
        const fileNameLength = view.getUint16(offset + 26, true)
        const extraFieldLength = view.getUint16(offset + 28, true)

        const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLength)
        const entryName = new TextDecoder('utf-8').decode(fileNameBytes)
        const dataOffset = offset + 30 + fileNameLength + extraFieldLength

        if (targetRegex.test(entryName)) {
          // If compressed size is 0 (data descriptor flag used), scan for next header to find boundaries
          if (compressedSize === 0) {
            for (let next = dataOffset; next < len - 4; next++) {
              const sig = view.getUint32(next, true)
              if (sig === 0x04034b50 || sig === 0x02014b50) {
                compressedSize = next - dataOffset
                break
              }
            }
            if (compressedSize === 0) compressedSize = len - dataOffset
          }

          const compressedData = bytes.subarray(dataOffset, dataOffset + compressedSize)

          if (compressionMethod === 0) {
            // Uncompressed
            return new TextDecoder('utf-8').decode(compressedData)
          } else if (compressionMethod === 8) {
            // Deflate compression -> Native DecompressionStream
            try {
              const ds = new DecompressionStream('deflate-raw')
              const writer = ds.writable.getWriter()
              writer.write(compressedData)
              writer.close()
              const response = new Response(ds.readable)
              const decompressed = await response.arrayBuffer()
              return new TextDecoder('utf-8').decode(decompressed)
            } catch (decompErr) {
              console.warn('DecompressionStream error on entry:', entryName, decompErr)
            }
          }
        }

        offset = dataOffset + (compressedSize || 1)
      } else {
        offset++
      }
    }
  } catch (err) {
    console.warn('readZipEntryText error:', err)
  }
  return null
}

// ─── Robust PDF Page Counter (Binary Scanner + PDF.js Fallback) ───────────────

export function countPdfPagesFromBinary(buffer) {
  try {
    const bytes = new Uint8Array(buffer)
    const text = new TextDecoder('latin1').decode(bytes)

    // Method A: Root Pages tree dictionary count (/Type /Pages ... /Count N)
    const pagesDictMatches = text.match(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/gi)
    if (pagesDictMatches && pagesDictMatches.length > 0) {
      let maxCount = 0
      for (const m of pagesDictMatches) {
        const numMatch = m.match(/\/Count\s+(\d+)/i)
        if (numMatch) {
          const num = parseInt(numMatch[1], 10)
          if (!isNaN(num) && num > maxCount && num < 10000) maxCount = num
        }
      }
      if (maxCount > 0) return maxCount
    }

    // Method B: General /Count N
    const countMatches = text.match(/\/Count\s+(\d+)/g)
    if (countMatches && countMatches.length > 0) {
      let maxCount = 0
      for (const m of countMatches) {
        const num = parseInt(m.replace(/\/Count\s+/, ''), 10)
        if (!isNaN(num) && num > maxCount && num < 10000) {
          maxCount = num
        }
      }
      if (maxCount > 0) return maxCount
    }

    // Method C: Linearized PDF header /N <count>
    const linMatch = text.match(/\/Linearized\s+[\s\S]{0,100}?\/N\s+(\d+)/i)
    if (linMatch && parseInt(linMatch[1], 10) > 0) {
      return parseInt(linMatch[1], 10)
    }

    // Method D: Count /Type /Page objects (excluding /Pages)
    const pageMatches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length
    }

    // Method E: Alternate PDF dictionary syntax [/Type/Page]
    const altMatches = text.match(/\/Type\/Page(?![a-zA-Z])/g)
    if (altMatches && altMatches.length > 0) {
      return altMatches.length
    }
  } catch (e) {
    console.warn('countPdfPagesFromBinary error:', e)
  }
  return 1
}

// ─── Thumbnail from first PDF page ────────────────────────────────────────────

async function pdfThumbnail(arrayBuffer) {
  try {
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      disableFontFace: true,
    }).promise
    const page = await pdf.getPage(1)
    const vp = page.getViewport({ scale: 0.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return null
  }
}

// ─── PDF Processor ────────────────────────────────────────────────────────────

async function processPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  
  // 1. Instant binary count fallback baseline
  const binaryCount = countPdfPagesFromBinary(arrayBuffer)
  let totalPages = binaryCount

  // 2. Exact PDF.js inspection
  try {
    const pdfTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      disableFontFace: true,
    })
    const pdf = await pdfTask.promise
    if (pdf && pdf.numPages && pdf.numPages > 0) {
      totalPages = pdf.numPages
    }
  } catch (err) {
    console.warn('PDF.js exact parser error (using binary count):', err)
  }

  const thumbnail = await pdfThumbnail(arrayBuffer)
  return { pdfBlob: file, totalPages: Math.max(1, totalPages), thumbnail }
}

// ─── Image Processor ─────────────────────────────────────────────────────────

async function processImage(file, imageFit = 'fit') {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const A4_W = 210, A4_H = 297 // mm
        const doc = new jsPDF({ orientation: img.width > img.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()

        let x = 0, y = 0, w = pageW, h = pageH
        const imgRatio = img.width / img.height
        const pageRatio = pageW / pageH

        if (imageFit === 'fit') {
          if (imgRatio > pageRatio) { w = pageW; h = pageW / imgRatio }
          else { h = pageH; w = pageH * imgRatio }
          x = (pageW - w) / 2
          y = (pageH - h) / 2
        } else if (imageFit === 'fill') {
          if (imgRatio > pageRatio) { h = pageH; w = pageH * imgRatio; x = (pageW - w) / 2 }
          else { w = pageW; h = pageW / imgRatio; y = (pageH - h) / 2 }
        }

        const canvas = document.createElement('canvas')
        canvas.width = img.width; canvas.height = img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        const fmt = file.type === 'image/png' ? 'PNG' : 'JPEG'
        doc.addImage(dataUrl, fmt, x, y, w, h)

        const pdfBlob = doc.output('blob')
        URL.revokeObjectURL(url)
        resolve({ pdfBlob, totalPages: 1, thumbnail: dataUrl })
      } catch (e) { reject(e) }
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── SVG Processor ───────────────────────────────────────────────────────────

async function processSvg(file) {
  const text = await file.text()
  const blob = new Blob([text], { type: 'image/svg+xml' })
  const svgFile = new File([blob], file.name, { type: 'image/svg+xml' })
  return processImage(svgFile, 'fit')
}

// ─── Text Processor ───────────────────────────────────────────────────────────

async function processText(file) {
  const text = await file.text()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const lineH = 6
  const maxW = pageW - margin * 2
  const maxLines = Math.floor((pageH - margin * 2) / lineH)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)

  const rawLines = text.split('\n')
  const allLines = []
  for (const raw of rawLines) {
    const wrapped = doc.splitTextToSize(raw || ' ', maxW)
    allLines.push(...wrapped)
  }

  let page = 1
  for (let i = 0; i < allLines.length; i++) {
    const lineIndex = i % maxLines
    if (i > 0 && lineIndex === 0) { doc.addPage(); page++ }
    doc.text(allLines[i], margin, margin + lineIndex * lineH)
  }

  const pdfBlob = doc.output('blob')
  return { pdfBlob, totalPages: page, thumbnail: null }
}

// ─── HTML Processor ───────────────────────────────────────────────────────────

async function processHtml(file) {
  const html = await file.text()
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;border:none;'
    document.body.appendChild(iframe)
    iframe.onload = async () => {
      try {
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(iframe.contentDocument.body, { scale: 1.5, useCORS: true, logging: false })
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        const doc = new jsPDF({ unit: 'mm', format: 'a4' })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()
        const ratio = canvas.width / canvas.height
        let w = pageW, h = pageW / ratio
        if (h > pageH) { h = pageH; w = pageH * ratio }
        doc.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h)
        document.body.removeChild(iframe)
        resolve({ pdfBlob: doc.output('blob'), totalPages: 1, thumbnail: dataUrl })
      } catch (e) { document.body.removeChild(iframe); reject(e) }
    }
    iframe.srcdoc = html
  })
}

// ─── Binary DOC (Word 97-2003 OLE) Page Counter ───────────────────────────────

export function countDocPagesFromBinary(buffer) {
  try {
    const bytes = new Uint8Array(buffer)
    const len = bytes.length
    if (len < 512) return 1

    // 1. Scan for Property 0x000E (PIDDSI_PAGECOUNT) in OLE property streams
    for (let i = 0; i < len - 10; i += 2) {
      if (bytes[i] === 0x0E && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x00) {
        if (bytes[i + 4] === 0x03 && bytes[i + 5] === 0x00) {
          const val = bytes[i + 6] | (bytes[i + 7] << 8) | (bytes[i + 8] << 16)
          if (val > 1 && val < 5000) {
            return val
          }
        }
      }
    }

    // 2. Scan printable characters & words in WordDocument stream
    let printableChars = 0
    let wordCount = 0
    let inWord = false

    for (let i = 0; i < len; i++) {
      const b = bytes[i]
      if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
        printableChars++
        if ((b >= 65 && b <= 90) || (b >= 97 && b <= 122) || (b >= 48 && b <= 57)) {
          if (!inWord) {
            wordCount++
            inWord = true
          }
        } else {
          inWord = false
        }
      } else {
        inWord = false
      }
    }

    if (wordCount > 100 || printableChars > 500) {
      const estByWords = Math.ceil(wordCount / 380)
      const estByChars = Math.ceil(printableChars / 2200)
      return Math.max(1, Math.max(estByWords, estByChars))
    }
  } catch (err) {
    console.warn('countDocPagesFromBinary error:', err)
  }
  return 1
}

// ─── Office Processor (DOC/DOCX/PPT/PPTX/XLS/XLSX/RTF) ───────────────────────

export async function countOfficeDocumentPages(buffer, fileName = '') {
  try {
    const ext = fileName.split('.').pop().toLowerCase()

    // ── DOCX ──
    if (ext === 'docx') {
      const appXml = await readZipEntryText(buffer, /docProps\/app\.xml$/i)
      const docXml = await readZipEntryText(buffer, /word\/document\.xml$/i)

      let renderedBreaks = 0
      let hardBreaks = 0
      let brPage = 0
      let wordCount = 0
      let charCount = 0
      let pCount = 0
      let trCount = 0
      let imgCount = 0

      if (docXml) {
        renderedBreaks = (docXml.match(/w:lastRenderedPageBreak/gi) || []).length
        hardBreaks = (docXml.match(/w:type=['"\x22]page['"\x22]/gi) || []).length
        brPage = (docXml.match(/<w:br[^>]*?w:type=['"\x22]page['"\x22]/gi) || []).length
        pCount = (docXml.match(/<w:p\b/gi) || []).length
        trCount = (docXml.match(/<w:tr\b/gi) || []).length
        imgCount = (docXml.match(/<w:drawing|<v:shape|<w:pict/gi) || []).length

        const tMatches = docXml.match(/<w:t\b[^>]*>(.*?)<\/w:t>/gi) || []
        let fullText = ''
        for (const t of tMatches) {
          fullText += t.replace(/<[^>]+>/g, '') + ' '
        }
        wordCount = fullText.trim().split(/\s+/).filter(Boolean).length
        charCount = fullText.length
      }

      let declaredPages = 0
      let declaredWords = 0
      if (appXml) {
        const pMatch = appXml.match(/<Pages>(\d+)<\/Pages>/i)
        if (pMatch) declaredPages = parseInt(pMatch[1], 10)
        const wMatch = appXml.match(/<Words>(\d+)<\/Words>/i)
        if (wMatch) declaredWords = parseInt(wMatch[1], 10)
      }

      // If Word saved actual rendered breaks during layout, use them directly
      if (renderedBreaks > 0) {
        return renderedBreaks + 1
      }

      // Calculate realistic A4 layout page count
      const effectiveHardBreaks = Math.max(hardBreaks, brPage)
      const pageByWords = wordCount > 0 ? (wordCount / 380) : 0
      const pageByChars = charCount > 0 ? (charCount / 2200) : 0
      const pageByTables = trCount > 0 ? (trCount / 20) : 0
      const pageByImgs = imgCount * 0.35
      const textVolume = Math.max(pageByWords, pageByChars)

      const estimated = Math.ceil(textVolume + pageByTables + pageByImgs + (effectiveHardBreaks * 0.5))
      const contentPages = Math.max(1, estimated)

      // Only trust appXml declaredPages if declaredPages > 1 AND declaredWords > 0 (not unpaginated default 1)
      if (declaredPages > 1 && declaredWords > 0 && Math.abs(declaredPages - contentPages) <= 3) {
        return declaredPages
      }

      return contentPages
    }

    // ── Old DOC (Word 97-2003 binary format) ──
    if (ext === 'doc') {
      return countDocPagesFromBinary(buffer)
    }

    // ── PPTX / PPT ──
    if (ext === 'pptx' || ext === 'ppt') {
      const appXml = await readZipEntryText(buffer, /docProps\/app\.xml$/i)
      if (appXml) {
        const slideMatch = appXml.match(/<Slides>(\d+)<\/Slides>/i)
        if (slideMatch && parseInt(slideMatch[1], 10) > 0) {
          return parseInt(slideMatch[1], 10)
        }
      }

      const bytes = new Uint8Array(buffer)
      const text = new TextDecoder('latin1').decode(bytes)
      const slideMatches = text.match(/ppt\/slides\/slide(\d+)\.xml/gi)
      if (slideMatches && slideMatches.length > 0) {
        const uniqueSlides = new Set(slideMatches.map(s => s.toLowerCase()))
        if (uniqueSlides.size > 0) return uniqueSlides.size
      }
    }

    // ── XLSX / XLS ──
    if (ext === 'xlsx' || ext === 'xls') {
      const bytes = new Uint8Array(buffer)
      const text = new TextDecoder('latin1').decode(bytes)
      const sheetMatches = text.match(/xl\/worksheets\/sheet(\d+)\.xml/gi)
      if (sheetMatches && sheetMatches.length > 0) {
        const uniqueSheets = new Set(sheetMatches.map(s => s.toLowerCase()))
        if (uniqueSheets.size > 0) return uniqueSheets.size
      }
    }

    // ── RTF ──
    if (ext === 'rtf') {
      const text = new TextDecoder('latin1').decode(new Uint8Array(buffer))
      const pageBreaks = (text.match(/\\page\b/g) || []).length
      const cleanText = text.replace(/\\[a-z0-9\-]+ ?/gi, ' ').replace(/[{}]/g, ' ')
      const words = cleanText.trim().split(/\s+/).filter(Boolean).length
      const estByWords = Math.ceil(words / 380)
      return Math.max(1, pageBreaks + 1, estByWords)
    }
  } catch (e) {
    console.warn('countOfficeDocumentPages error:', e)
  }
  return 1
}

async function estimateOfficePages(file) {
  try {
    const buffer = await file.arrayBuffer()
    return await countOfficeDocumentPages(buffer, file.name)
  } catch (e) {
    console.warn('estimateOfficePages error:', e)
    return 1
  }
}

async function processOffice(file, typeInfo) {
  const buffer = await file.arrayBuffer()
  const estimatedPages = await countOfficeDocumentPages(buffer, file.name)
  const ext = file.name.split('.').pop().toLowerCase()

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const lineH = 5.5
  const maxW = pageW - margin * 2
  const bottomLimit = pageH - margin - 8

  let renderedPdfPages = 1

  // If DOCX, extract non-empty paragraphs and render real multi-page text
  if (ext === 'docx') {
    try {
      const docXml = await readZipEntryText(buffer, /word\/document\.xml$/i)
      if (docXml) {
        const paragraphs = []
        const pRegex = /<w:p\b[\s\S]*?<\/w:p>/gi
        let match
        while ((match = pRegex.exec(docXml)) !== null) {
          const pXml = match[0]
          const tMatches = pXml.match(/<w:t\b[^>]*>(.*?)<\/w:t>/gi)
          if (tMatches) {
            const text = tMatches.map(t => t.replace(/<[^>]+>/g, '')).join('')
            if (text.trim()) paragraphs.push(text.trim())
          }
        }

        if (paragraphs.length > 0) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(30, 30, 30)

          let y = margin
          for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
            const p = paragraphs[pIdx]
            const isHeading = p.length < 80 && (pIdx === 0 || /^[A-Z0-9\s:–—•]+$/.test(p) || p.endsWith(':'))
            if (isHeading) {
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(11)
            } else {
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(10)
            }

            const wrapped = doc.splitTextToSize(p, maxW)
            for (const line of wrapped) {
              if (y + lineH > bottomLimit) {
                // Add page number footer before adding new page
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(150, 150, 150)
                doc.text(`Page ${renderedPdfPages}`, pageW / 2, pageH - 10, { align: 'center' })

                doc.addPage()
                renderedPdfPages++
                y = margin
                doc.setTextColor(30, 30, 30)
                doc.setFontSize(isHeading ? 11 : 10)
                if (isHeading) doc.setFont('helvetica', 'bold')
              }
              doc.text(line, margin, y)
              y += lineH
            }
            y += 2.5 // Paragraph spacing
          }

          // Footer for last page
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text(`Page ${renderedPdfPages}`, pageW / 2, pageH - 10, { align: 'center' })
        }
      }
    } catch (e) {
      console.warn('DOCX text rendering error:', e)
    }
  }

  // If not rendered or DOC/PPT/XLS, create placeholder pages matching estimatedPages
  if (renderedPdfPages === 1 && estimatedPages > 1) {
    for (let p = 1; p <= estimatedPages; p++) {
      if (p > 1) doc.addPage()
      doc.setFillColor(255, 248, 242)
      doc.rect(0, 0, pageW, 297, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(247, 140, 37)
      doc.text('X Buddy Print Station', pageW / 2, 45, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.setTextColor(60, 60, 60)
      doc.text(`File: ${file.name}`, pageW / 2, 65, { align: 'center' })
      doc.text(`Format: ${typeInfo.label} Document · Sheet/Page ${p} of ${estimatedPages}`, pageW / 2, 75, { align: 'center' })
      doc.text(`Total Document Pages: ${estimatedPages}`, pageW / 2, 85, { align: 'center' })

      doc.setFontSize(10)
      doc.setTextColor(140, 140, 140)
      doc.text(`Converted for campus print queue · Size: ${formatBytes(file.size)}`, pageW / 2, 110, { align: 'center' })
    }
  }

  const finalPages = Math.max(1, Math.max(estimatedPages, renderedPdfPages))
  const pdfBlob = doc.output('blob')
  let thumbnail = null
  try {
    const ab = await pdfBlob.arrayBuffer()
    thumbnail = await pdfThumbnail(ab)
  } catch {}

  return {
    pdfBlob,
    totalPages: finalPages,
    thumbnail,
    requiresAgent: true,
    originalFile: file,
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function processFile(file, options = {}) {
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large. Maximum size is 100 MB.`)

  const typeInfo = resolveFileType(file)
  if (!typeInfo) throw new Error(`Unsupported file format. Please upload a supported document or image.`)

  const { imageFit = 'fit' } = options

  switch (typeInfo.category) {
    case 'document':
      if (typeInfo.mime === 'application/pdf') return processPdf(file)
      return processOffice(file, typeInfo)
    case 'image':
      if (typeInfo.mime === 'image/svg+xml') return processSvg(file)
      return processImage(file, imageFit)
    case 'text':
      return processText(file)
    case 'html':
      return processHtml(file)
    default:
      throw new Error('Unsupported file type.')
  }
}
