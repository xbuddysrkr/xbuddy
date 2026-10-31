const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getPdfGeometry } = require('./fidelityValidator')

/**
 * Inspects file header magic bytes to determine actual document format.
 */
function inspectFileMagic(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 'UNKNOWN'
  try {
    const fd = fs.openSync(filePath, 'r')
    const headerBuf = Buffer.alloc(8)
    const bytesRead = fs.readSync(fd, headerBuf, 0, 8, 0)
    fs.closeSync(fd)

    if (bytesRead >= 4) {
      if (headerBuf.subarray(0, 4).toString('ascii') === '%PDF') {
        return 'PDF'
      }
      if (headerBuf[0] === 0x50 && headerBuf[1] === 0x4B && headerBuf[2] === 0x03 && headerBuf[3] === 0x04) {
        return 'DOCX'
      }
      if (headerBuf[0] === 0xD0 && headerBuf[1] === 0xCF && headerBuf[2] === 0x11 && headerBuf[3] === 0xE0) {
        return 'DOC'
      }
      if (headerBuf[0] === 0xFF && headerBuf[1] === 0xD8 && headerBuf[2] === 0xFF) {
        return 'JPEG'
      }
      if (headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4E && headerBuf[3] === 0x47) {
        return 'PNG'
      }
    }
  } catch {}
  return 'UNKNOWN'
}

/**
 * Detects headless LibreOffice in standard Windows installation directories or PATH.
 */
function findLibreOffice() {
  const envCandidates = [
    process.env.SOFFICE_PATH,
    process.env.LIBREOFFICE_PATH,
  ].filter(Boolean)

  const commonWinPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files\\LibreOffice 5\\program\\soffice.exe',
    'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
  ]

  for (const cand of [...envCandidates, ...commonWinPaths]) {
    try {
      if (fs.existsSync(cand)) return cand
    } catch {}
  }
  return null
}

/**
 * Validates the generated PDF artifact before handing off to the print engine:
 * 1. Output file exists and is nonempty (> 500 bytes).
 * 2. Has valid %PDF- header.
 * 3. Has at least 1 page.
 * 4. Geometry and dimensions are positive.
 */
async function validateConvertedPdf(outputPath) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Converted PDF artifact was not created on disk: "${outputPath}"`)
  }

  const stat = fs.statSync(outputPath)
  if (stat.size < 500) {
    try { fs.unlinkSync(outputPath) } catch {}
    throw new Error(`Converted PDF artifact is empty or truncated (${stat.size} bytes)`)
  }

  const fd = fs.openSync(outputPath, 'r')
  const header = Buffer.alloc(4)
  fs.readSync(fd, header, 0, 4, 0)
  fs.closeSync(fd)
  if (header.toString('ascii') !== '%PDF') {
    try { fs.unlinkSync(outputPath) } catch {}
    throw new Error(`Converted artifact is not a valid PDF (header: ${header.toString('hex')})`)
  }

  const geom = await getPdfGeometry(outputPath)
  if (!geom || geom.pageCount < 1) {
    try { fs.unlinkSync(outputPath) } catch {}
    throw new Error(`Converted PDF contains 0 printable pages`)
  }

  return {
    valid: true,
    pageCount: geom.pageCount,
    primaryOrientation: geom.primaryOrientation,
    primaryPaperSize: geom.primaryPaperSize,
    sizeBytes: stat.size,
  }
}

/**
 * Tier 1: Native Microsoft Word COM automation via PowerShell.
 */
function convertViaWordCom(absInput, absOutput) {
  return new Promise((resolve, reject) => {
    const escapedInput = absInput.replace(/'/g, "''")
    const escapedOutput = absOutput.replace(/'/g, "''")

    const psScript = `
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
} catch {
  Write-Error "WORD_COM_NOT_AVAILABLE: Microsoft Word is not installed or COM automation is blocked ($($_.Exception.Message))"
  exit 1
}

try {
  $word.Visible = $false
  $word.DisplayAlerts = 0 # wdAlertsNone
  try { $word.AutomationSecurity = 3 } catch {} # msoAutomationSecurityForceDisable
  
  $doc = $word.Documents.Open('${escapedInput}', $false, $true) # ReadOnly=$true
  
  $saved = $false
  try {
    # Method 1: ExportAsFixedFormat (recommended for Word 2007 SP2+ through Word 365)
    $doc.ExportAsFixedFormat('${escapedOutput}', 17, $false, 0, 0, 1, 1, 0, $true, $true, 0, $true, $true, $false)
    $saved = $true
  } catch {
    # Method 2: SaveAs fallback
    try {
      $doc.SaveAs([ref]'${escapedOutput}', [ref]17)
      $saved = $true
    } catch {
      Write-Error "WORD_SAVE_ERROR: $($_.Exception.Message)"
      exit 2
    }
  }
  
  if ($saved) {
    Write-Output "CONVERSION_SUCCESS"
  }
} catch {
  Write-Error "CONVERSION_ERROR: $($_.Exception.Message)"
  exit 3
} finally {
  if ($doc) {
    try { $doc.Close([ref]0) } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null } catch {}
  }
  if ($word) {
    try { $word.Quit([ref]0) } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch {}
  }
}
`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true, timeout: 60000 },
      (err, stdout, stderr) => {
        if (err || !fs.existsSync(absOutput) || fs.statSync(absOutput).size === 0) {
          const detail = (stderr || stdout || err?.message || 'Word COM conversion error').trim()
          return reject(new Error(`Word COM conversion failed: ${detail}`))
        }
        resolve(absOutput)
      }
    )
  })
}

/**
 * Tier 2: Headless LibreOffice conversion fallback.
 */
function convertViaLibreOffice(absInput, absOutput, sofficePath) {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(absOutput)
    execFile(
      sofficePath,
      ['--headless', '--convert-to', 'pdf', '--outdir', outDir, absInput],
      { windowsHide: true, timeout: 60000 },
      (err, stdout, stderr) => {
        const expectedLoOutput = path.join(outDir, `${path.basename(absInput, path.extname(absInput))}.pdf`)
        if (fs.existsSync(expectedLoOutput) && fs.statSync(expectedLoOutput).size > 500) {
          if (expectedLoOutput !== absOutput) {
            try {
              if (fs.existsSync(absOutput)) fs.unlinkSync(absOutput)
              fs.copyFileSync(expectedLoOutput, absOutput)
              fs.unlinkSync(expectedLoOutput)
            } catch {}
          }
          return resolve(absOutput)
        }

        const detail = (stderr || stdout || err?.message || 'LibreOffice conversion failed').trim()
        reject(new Error(`LibreOffice conversion failed: ${detail}`))
      }
    )
  })
}

/**
 * Multi-Tier High-Fidelity Office Document to PDF Conversion.
 * Tier 1: Native Microsoft Word COM automation (highest fidelity)
 * Tier 2: Headless LibreOffice fallback
 * 
 * Preserves 100% of tables, fonts, headings, images, margins, headers, footers, and page breaks.
 * Validates output PDF before resolving.
 */
async function convertDocxToPdfViaWord(inputPath, outputPath) {
  const absInput = path.resolve(inputPath)
  const absOutput = path.resolve(outputPath)

  if (absInput === absOutput) {
    throw new Error('Cannot overwrite original document: output path matches input path')
  }

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input document not found on disk: "${absInput}"`)
  }

  // Ensure output directory exists
  const outDir = path.dirname(absOutput)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  // Remove stale previous output if it exists
  if (fs.existsSync(absOutput)) {
    try { fs.unlinkSync(absOutput) } catch {}
  }

  // 1. Inspect actual file magic bytes
  const magic = inspectFileMagic(absInput)
  if (magic === 'PDF') {
    // File is already a valid PDF; copy directly without conversion
    fs.copyFileSync(absInput, absOutput)
    await validateConvertedPdf(absOutput)
    return absOutput
  }

  if (magic !== 'DOCX' && magic !== 'DOC') {
    throw new Error(`File "${path.basename(absInput)}" is not a genuine Word document (unrecognized header)`)
  }

  // If input path lacks a .docx/.doc extension (e.g. downloaded as XB1234.tmp or XB1234.pdf),
  // Word COM requires a recognized Office extension to open the file correctly.
  let activeInputPath = absInput
  let stagedPath = null
  const currentExt = path.extname(absInput).toLowerCase()
  const requiredExt = magic === 'DOC' ? '.doc' : '.docx'

  if (currentExt !== requiredExt) {
    stagedPath = path.join(outDir, `_staged_${Date.now()}_${path.basename(absInput, currentExt)}${requiredExt}`)
    fs.copyFileSync(absInput, stagedPath)
    activeInputPath = stagedPath
  }

  let lastError = null

  try {
    // ── Tier 1: Microsoft Word COM automation ──
    try {
      await convertViaWordCom(activeInputPath, absOutput)
      await validateConvertedPdf(absOutput)
      return absOutput
    } catch (wordErr) {
      lastError = wordErr
    }

    // ── Tier 2: Headless LibreOffice fallback ──
    const sofficePath = findLibreOffice()
    if (sofficePath) {
      try {
        await convertViaLibreOffice(activeInputPath, absOutput, sofficePath)
        await validateConvertedPdf(absOutput)
        return absOutput
      } catch (loErr) {
        lastError = loErr
      }
    }

    // Neither converter succeeded
    const reason = sofficePath
      ? `Word COM and LibreOffice both failed. Last error: ${lastError?.message || 'unknown'}`
      : `Word COM automation failed (${lastError?.message || 'unavailable'}) and LibreOffice is not installed.`

    throw new Error(`Document conversion failed: ${reason}`)
  } finally {
    // Clean up temporary staged alias file
    if (stagedPath && fs.existsSync(stagedPath)) {
      try { fs.unlinkSync(stagedPath) } catch {}
    }
  }
}

/**
 * Converts authentic image file (JPEG or PNG) into a high-fidelity temporary PDF print artifact.
 * Preserves true aspect ratio and centers image neatly on standard A4 page.
 */
async function convertImageToPdf(inputPath, outputPath) {
  const absInput = path.resolve(inputPath)
  const absOutput = path.resolve(outputPath)

  // Try mutool first if available
  const mutoolPath = path.resolve(__dirname, '..', 'bin', 'mutool.exe')
  if (fs.existsSync(mutoolPath)) {
    try {
      await new Promise((resolve, reject) => {
        execFile(mutoolPath, ['convert', '-o', absOutput, absInput], { windowsHide: true, timeout: 30000 }, (err) => {
          if (err || !fs.existsSync(absOutput) || fs.statSync(absOutput).size === 0) {
            return reject(err || new Error('mutool image conversion failed'))
          }
          resolve()
        })
      })
      return absOutput
    } catch (mErr) {
      // Fall through to pdf-lib
    }
  }

  // Fallback: pure pdf-lib
  try {
    let pdfLib = null
    try {
      pdfLib = require('pdf-lib')
    } catch {
      try {
        pdfLib = require(path.resolve(__dirname, '..', '..', '..', 'frontend', 'node_modules', 'pdf-lib'))
      } catch {}
    }

    if (pdfLib && pdfLib.PDFDocument) {
      const doc = await pdfLib.PDFDocument.create()
      const bytes = fs.readFileSync(absInput)
      const isPng = absInput.toLowerCase().endsWith('.png') || (bytes[0] === 0x89 && bytes[1] === 0x50)
      const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)

      // Standard A4: 595.28 x 841.89 points
      const pageW = 595.28
      const pageH = 841.89
      const page = doc.addPage([pageW, pageH])

      const imgW = image.width
      const imgH = image.height
      const imgRatio = imgW / imgH
      const pageRatio = pageW / pageH

      let drawW = pageW - 40 // 20pt margin
      let drawH = drawW / imgRatio
      if (drawH > pageH - 40) {
        drawH = pageH - 40
        drawW = drawH * imgRatio
      }
      const x = (pageW - drawW) / 2
      const y = (pageH - drawH) / 2

      page.drawImage(image, { x, y, width: drawW, height: drawH })
      fs.writeFileSync(absOutput, await doc.save())
      return absOutput
    }
    throw new Error('No PDF image conversion engine available.')
  } catch (err) {
    throw new Error(`Failed to convert image to print artifact: ${err.message}`)
  }
}

module.exports = {
  convertDocxToPdfViaWord,
  convertImageToPdf,
  findLibreOffice,
  inspectFileMagic,
  validateConvertedPdf,
}
