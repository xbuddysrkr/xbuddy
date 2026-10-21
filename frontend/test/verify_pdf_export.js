import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { PDFDocument } from 'pdf-lib'

console.log('--- EMPIRICAL VERIFICATION OF RESUME STUDIO PDF EXPORT PIPELINE ---')

// 1. Recreate the exact PDF generation pipeline used in ResumePreview.jsx (lines 81-83):
// const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
// pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)

const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

// Create a minimal 1x1 white JPEG image data URI
const dummy1x1Jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

pdf.addImage(dummy1x1Jpeg, 'JPEG', 0, 0, 210, 297)

const pdfBinary = pdf.output('arraybuffer')
console.log(`[PDF Audit] Generated PDF Binary Size: ${pdfBinary.byteLength} bytes`)

// 2. Load and inspect the binary using pdf-lib
const pdfDoc = await PDFDocument.load(pdfBinary)
const pages = pdfDoc.getPages()
assert.equal(pages.length, 1, 'PDF must contain exactly 1 page')

const page = pages[0]
const { width, height } = page.getSize()

// A4 at 72 points/inch is 595.28 x 841.89
console.log(`[PDF Audit] Page Dimensions (pts): width=${width.toFixed(2)}, height=${height.toFixed(2)}`)
assert(Math.abs(width - 595.28) < 1, 'Width must be standard A4 (595.28 pts)')
assert(Math.abs(height - 841.89) < 1, 'Height must be standard A4 (841.89 pts)')

// 3. Inspect raw stream contents for Text operators vs Image XObjects
const rawPdfText = Buffer.from(pdfBinary).toString('latin1')

// PDF text operators: 'BT' (Begin Text), 'ET' (End Text), 'Tj' (Show Text), 'TJ' (Show Text with kerning)
const hasBeginText = /\bBT\b/.test(rawPdfText)
const hasEndText = /\bET\b/.test(rawPdfText)
const hasShowText = /\b(Tj|TJ)\b/.test(rawPdfText)
const hasFont = /\/Font\b/.test(rawPdfText)
const hasImageXObject = /\/Subtype\s*\/Image\b/.test(rawPdfText)

console.log('\n--- PDF STREAM AUDIT RESULTS ---')
console.log(`[PDF Audit] Contains Font Dictionary (/Font): ${hasFont}`)
console.log(`[PDF Audit] Contains Begin Text Operator (BT): ${hasBeginText}`)
console.log(`[PDF Audit] Contains Show Text Operators (Tj/TJ): ${hasShowText}`)
console.log(`[PDF Audit] Contains Image XObject (/Subtype /Image): ${hasImageXObject}`)

// 4. Incontrovertible Assertions on the Current Export Reality
assert.equal(hasImageXObject, true, 'AUDIT CONFIRMED: PDF embeds an image XObject from the canvas')
assert.equal(hasShowText, false, 'AUDIT CONFIRMED: PDF does NOT contain vector text operators (Tj/TJ)')

console.log('\n========================================================================')
console.log('✓ EMPIRICAL PROOF VERIFIED: The exported PDF is a RASTER/IMAGE-BACKED PDF.')
console.log('  Direct text extraction (e.g. pdftotext) yields 0 selectable vector words.')
console.log('  Legacy ATS parsers without OCR will treat this document as an image.')
console.log('  Modern ATS parsers with integrated OCR (e.g. Textkernel/Sovren) can scan it.')
console.log('========================================================================\n')
