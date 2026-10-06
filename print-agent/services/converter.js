const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const logger = require('../utils/logger')

const MUTOOL_PRIMARY = path.join(__dirname, '..', 'bin', 'mutool.exe')
const MUTOOL_WINGET = 'C:\\Users\\SRKREC\\AppData\\Local\\Microsoft\\WinGet\\Packages\\ArtifexSoftware.mutool_Microsoft.Winget.Source_8wekyb3d8bbwe\\mupdf-1.23.0-windows\\mutool.exe'

function getMutoolPath() {
  if (fs.existsSync(MUTOOL_PRIMARY)) return MUTOOL_PRIMARY
  if (fs.existsSync(MUTOOL_WINGET)) return MUTOOL_WINGET
  return null
}

function runExecFile(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || stdout || err.message))
      }
      resolve({ stdout, stderr })
    })
  })
}

/**
 * Converts any PDF into a pure 8bpc DeviceGray PDF.
 * Ensures zero color ink is emitted by any physical printer.
 * 
 * @param {string} inputPdfPath
 * @param {string} outputPdfPath
 * @returns {Promise<string>} outputPdfPath
 */
async function convertPdfToGrayscale(inputPdfPath, outputPdfPath) {
  const mutool = getMutoolPath()
  if (!mutool) {
    throw new Error('mutool executable not found. Cannot convert to grayscale.')
  }

  if (!fs.existsSync(inputPdfPath)) {
    throw new Error(`Input file not found: ${inputPdfPath}`)
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbuddy-gray-'))

  try {
    const pageTemplate = path.join(tempDir, 'page_%d.png')

    // Step 1: Render all pages to 300 DPI grayscale PNGs
    await runExecFile(mutool, [
      'convert',
      '-o', pageTemplate,
      '-O', 'colorspace=gray,resolution=300',
      inputPdfPath,
    ])

    // Find all generated page png files and sort numerically
    const files = fs.readdirSync(tempDir)
      .filter(f => f.startsWith('page_') && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('page_', '').replace('.png', ''), 10)
        const numB = parseInt(b.replace('page_', '').replace('.png', ''), 10)
        return numA - numB
      })
      .map(f => path.join(tempDir, f))

    if (files.length === 0) {
      throw new Error('No pages were generated during grayscale conversion.')
    }

    // Step 2: Combine grayscale PNGs into target DeviceGray PDF
    await runExecFile(mutool, [
      'convert',
      '-o', outputPdfPath,
      ...files,
    ])

    if (!fs.existsSync(outputPdfPath) || fs.statSync(outputPdfPath).size === 0) {
      throw new Error('Output grayscale PDF was not created or is empty.')
    }

    return outputPdfPath
  } finally {
    // Cleanup temporary directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {}
  }
}

module.exports = {
  convertPdfToGrayscale,
  getMutoolPath,
}
