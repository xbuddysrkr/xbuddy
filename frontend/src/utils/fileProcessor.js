/**
 * fileProcessor.js
 * Converts any supported file format into a printable PDF Blob.
 * Each processor is self-contained and returns { pdfBlob, totalPages, thumbnail }.
 */

import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_TYPES = {
  'application/pdf':                                                         { label: 'PDF',  ext: '.pdf',  icon: 'FileText', category: 'document' },
  'application/msword':                                                      { label: 'DOC',  ext: '.doc',  icon: 'FileEdit', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', ext: '.docx', icon: 'FileEdit', category: 'document' },
  'image/jpeg':                                                              { label: 'JPG',  ext: '.jpg',  icon: 'Image',    category: 'image'    },
  'image/png':                                                               { label: 'PNG',  ext: '.png',  icon: 'Image',    category: 'image'    },
}

// Strictly match by extension for browsers that return generic/missing MIME
const EXT_MAP = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export function resolveFileType(file) {
  if (!file || !file.name) return null
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

// ─── Image Processor (JPEG / PNG) ─────────────────────────────────────────────

async function processImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const maxDim = 320
        let tw = img.width
        let th = img.height
        if (tw > maxDim || th > maxDim) {
          if (tw > th) {
            th = Math.round((th * maxDim) / tw)
            tw = maxDim
          } else {
            tw = Math.round((tw * maxDim) / th)
            th = maxDim
          }
        }
        canvas.width = Math.max(1, tw)
        canvas.height = Math.max(1, th)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, tw, th)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.82)
        URL.revokeObjectURL(url)

        // Preserve authentic uploaded image bytes, original filename, extension, and MIME type
        resolve({
          pdfBlob: file,
          originalFile: file,
          totalPages: 1,
          thumbnail,
          requiresAgent: true,
          isImage: true,
          width: img.width,
          height: img.height,
        })
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image file.'))
    }
    img.src = url
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
  const finalPages = Math.max(1, estimatedPages)

  // Authentic Office document preserved byte-for-byte in pdfBlob and originalFile.
  // Never replace or overwrite with a synthetic PDF.
  return {
    pdfBlob: file,
    originalFile: file,
    totalPages: finalPages,
    thumbnail: null,
    requiresAgent: true,
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function processFile(file) {
  if (!file) throw new Error('No file provided.')
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large. Maximum size is 100 MB.`)

  const typeInfo = resolveFileType(file)
  if (!typeInfo) {
    throw new Error('Unsupported file format. Only PDF (.pdf), Microsoft Word (.doc, .docx), and Images (.jpg, .png) are accepted.')
  }

  switch (typeInfo.category) {
    case 'document':
      if (typeInfo.mime === 'application/pdf') return processPdf(file)
      return processOffice(file, typeInfo)
    case 'image':
      return processImage(file)
    default:
      throw new Error('Unsupported file format. Only PDF (.pdf), Microsoft Word (.doc, .docx), and Images (.jpg, .png) are accepted.')
  }
}
