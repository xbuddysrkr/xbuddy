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

    const psScript = `
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
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
    $doc.Close([ref]0) # wdDoNotSaveChanges = 0
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
  }
  if ($word) {
    $word.Quit([ref]0)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
`
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, (err, stdout, stderr) => {
      if (err || !fs.existsSync(absOutput) || fs.statSync(absOutput).size === 0) {
        return reject(new Error(stderr || stdout || err?.message || 'Word conversion failed'))
      }
      resolve(absOutput)
    })
  })
}

module.exports = {
  convertDocxToPdfViaWord,
}
