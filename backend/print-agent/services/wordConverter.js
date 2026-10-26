const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * High-fidelity Word COM to PDF conversion.
 * Preserves 100% of tables, fonts, headings, images, margins, headers, footers, and page breaks.
 */
function convertDocxToPdfViaWord(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const absInput = path.resolve(inputPath)
    const absOutput = path.resolve(outputPath)

    if (absInput === absOutput) {
      return reject(new Error('Cannot overwrite original document: output path matches input path'))
    }

    if (!fs.existsSync(absInput)) {
      return reject(new Error(`Input document not found on disk: "${absInput}"`))
    }

    // Verify genuine DOCX or DOC magic bytes before invoking automation
    try {
      const fd = fs.openSync(absInput, 'r')
      const headerBuf = Buffer.alloc(4)
      fs.readSync(fd, headerBuf, 0, 4, 0)
      fs.closeSync(fd)

      const isDocx = headerBuf[0] === 0x50 && headerBuf[1] === 0x4B && headerBuf[2] === 0x03 && headerBuf[3] === 0x04
      const isDoc = headerBuf[0] === 0xD0 && headerBuf[1] === 0xCF && headerBuf[2] === 0x11 && headerBuf[3] === 0xE0
      if (!isDocx && !isDoc) {
        return reject(new Error(`File "${path.basename(absInput)}" is not a genuine Word document (magic header: ${headerBuf.toString('hex')})`))
      }
    } catch (e) {
      return reject(new Error(`Failed to verify document header: ${e.message}`))
    }

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
  
  $doc = $word.Documents.Open('${absInput.replace(/'/g, "''")}', $false, $true) # ReadOnly=$true
  # wdFormatPDF = 17
  $doc.SaveAs([ref]'${absOutput.replace(/'/g, "''")}', [ref]17)
  Write-Output "CONVERSION_SUCCESS"
} catch {
  Write-Error "CONVERSION_ERROR: $($_.Exception.Message)"
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
          const detail = (stderr || stdout || err?.message || 'Unknown Word conversion error').trim()
          return reject(new Error(`Word-to-PDF conversion failed: ${detail}`))
        }
        resolve(absOutput)
      }
    )
  })
}

module.exports = {
  convertDocxToPdfViaWord,
}
