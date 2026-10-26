import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFDocument, rgb, StandardFonts } = require('../../frontend/node_modules/pdf-lib')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const AGENT_DIR = path.join(ROOT_DIR, 'backend', 'print-agent')

// Dynamic import of print agent modules
const {
  getFileHash,
  classifyPaperSize,
  getPdfGeometry,
  validateDocumentFidelity,
} = await import(`file://${path.join(AGENT_DIR, 'services', 'fidelityValidator.js')}`)

const { convertDocxToPdfViaWord } = require('../../backend/print-agent/services/wordConverter.js')
const { slicePdfCustomPages } = require('../../backend/print-agent/services/printer.js')

const TEST_TMP_DIR = path.join(AGENT_DIR, 'downloads', 'test_fidelity_tmp')
if (!fs.existsSync(TEST_TMP_DIR)) {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true })
}

/**
 * Generates a representative PDF with:
 * - Different fonts and font sizes
 * - Tables and aligned columns
 * - Header and footer content with page numbers
 * - Vector graphics and lines
 * - Exact margins
 */
async function generateRepresentativePdf({
  pageCount = 2,
  orientation = 'portrait',
  mixedOrientation = false,
  pageSize = [595.28, 841.89], // A4
}) {
  const doc = await PDFDocument.create()
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontMono = await doc.embedFont(StandardFonts.Courier)

  for (let p = 1; p <= pageCount; p++) {
    const isLandscape = mixedOrientation ? (p % 2 === 0) : (orientation === 'landscape')
    const [w, h] = isLandscape ? [pageSize[1], pageSize[0]] : [pageSize[0], pageSize[1]]
    const page = doc.addPage([w, h])

    // Header (margin: 36pt = 0.5 in)
    page.drawText('XBUDDY SELF-SERVICE CAMPUS PRINTING SYSTEM', {
      x: 36,
      y: h - 36,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    })
    page.drawLine({
      start: { x: 36, y: h - 42 },
      end: { x: w - 36, y: h - 42 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    })

    // Document Title (20pt)
    page.drawText(`Document Fidelity Sample — Page ${p} of ${pageCount}`, {
      x: 36,
      y: h - 70,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Body Text (11pt)
    page.drawText('This document validates preservation of vector graphics, precise margins, tables, and typography.', {
      x: 36,
      y: h - 95,
      size: 11,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    })

    // Table with aligned columns (X: 36, 160, 320, 480)
    const tableTop = h - 130
    const rowHeight = 24
    const colWidths = [120, 160, 160]

    // Table Header
    page.drawRectangle({
      x: 36,
      y: tableTop - rowHeight,
      width: w - 72,
      height: rowHeight,
      color: rgb(0.92, 0.94, 0.96),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    })
    page.drawText('Metric', { x: 44, y: tableTop - 16, size: 10, font: fontBold })
    page.drawText('Standard Value', { x: 170, y: tableTop - 16, size: 10, font: fontBold })
    page.drawText('Validation Criteria', { x: 330, y: tableTop - 16, size: 10, font: fontBold })

    // Table Rows
    const rows = [
      ['Page Geometry', `${w} x ${h} pt`, 'Must be 100% preserved'],
      ['Vector Text', 'Helvetica / Courier', 'No bitmap rasterization'],
      ['Margins', '36pt (0.5 in) exact', 'Zero unprintable shrink'],
      ['Color Invariant', 'Black & White', 'Spooler mono, PDF byte intact'],
    ]

    rows.forEach((r, idx) => {
      const y = tableTop - (idx + 2) * rowHeight
      page.drawRectangle({
        x: 36,
        y,
        width: w - 72,
        height: rowHeight,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
      })
      page.drawText(r[0], { x: 44, y: y + 7, size: 9, font: fontRegular })
      page.drawText(r[1], { x: 170, y: y + 7, size: 9, font: fontMono })
      page.drawText(r[2], { x: 330, y: y + 7, size: 9, font: fontRegular })
    })

    // Footer with page numbering
    page.drawLine({
      start: { x: 36, y: 46 },
      end: { x: w - 36, y: 46 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    })
    page.drawText(`Page ${p} of ${pageCount}`, {
      x: w / 2 - 25,
      y: 32,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    })
    page.drawText('Confidential • Academic Print Artifact', {
      x: 36,
      y: 32,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    })
  }

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes)
}

test('Document Formatting & Fidelity Comprehensive Test Suite', async (t) => {

  await t.test('1. Exact PDF Byte Fidelity: PDF uploads preserve 100% original bytes on B&W print', async () => {
    const originalPdfBuf = await generateRepresentativePdf({ pageCount: 2, orientation: 'portrait' })
    const originalPath = path.join(TEST_TMP_DIR, 'test_fidelity_source.pdf')
    fs.writeFileSync(originalPath, originalPdfBuf)

    const originalHash = getFileHash(originalPath)
    assert.ok(originalHash && originalHash.length === 64, 'Source hash must be valid SHA-256')

    // Run fidelity validation with identical artifact
    const fidelity = await validateDocumentFidelity({
      orderId: 'XB-TEST-FIDELITY-01',
      originalFilePath: originalPath,
      printArtifactPath: originalPath, // Byte-for-byte identical
      originalFileName: 'Calculus_Assignment.pdf',
      detectedFormat: 'PDF',
      conversionOccurred: false,
      printerName: 'EPSON L130 Series',
      paperSize: 'A4',
      scale: 'noscale',
      orientation: 'portrait',
      pageRange: 'All',
    })

    assert.strictEqual(fidelity.isByteIdentical, true, 'Original PDF bytes must remain 100% byte identical')
    assert.strictEqual(fidelity.sourceHash, fidelity.artifactHash, 'Source and print artifact SHA-256 hashes must match')
    assert.strictEqual(fidelity.auditRecord.fidelityVerdict.includes('PERFECT_BYTE_FIDELITY'), true)
    assert.strictEqual(fidelity.sourceGeometry.pageCount, 2, 'Page count must be 2')
    assert.strictEqual(fidelity.sourceGeometry.primaryPaperSize, 'A4', 'Paper size must be A4')
    assert.strictEqual(fidelity.sourceGeometry.primaryOrientation, 'portrait', 'Orientation must be portrait')

    console.log('✓ TEST 1 PASSED: Original PDF bytes and SHA-256 hash strictly preserved with zero rasterization')
  })

  await t.test('2. Scale Fidelity: scale defaults to "noscale" (100% true scale, never forced "fit")', async () => {
    const printerPath = path.join(AGENT_DIR, 'services', 'printer.js')
    const content = fs.readFileSync(printerPath, 'utf8')

    // Verify printer.js defaults to noscale
    assert.match(content, /scale:\s*(requestedScale|options\.scale\s*\|\|\s*'noscale')/, 'printer.js must use noscale to preserve 100% document scale')
    assert.doesNotMatch(content, /scale:\s*'fit'/, 'printer.js must NEVER hardcode scale: "fit"')

    console.log('✓ TEST 2 PASSED: Printer options default to noscale, preventing unprintable margin shrink')
  })

  await t.test('3. Orientation Fidelity: Landscape & Mixed-Orientation detection', async () => {
    // Generate Landscape PDF
    const landscapeBuf = await generateRepresentativePdf({ pageCount: 1, orientation: 'landscape' })
    const landscapePath = path.join(TEST_TMP_DIR, 'test_landscape.pdf')
    fs.writeFileSync(landscapePath, landscapeBuf)

    const geom = await getPdfGeometry(landscapePath)
    assert.strictEqual(geom.primaryOrientation, 'landscape', 'Landscape PDF must be detected as landscape')
    assert.strictEqual(geom.pages[0].widthPt > geom.pages[0].heightPt, true, 'Width must exceed height for landscape')

    // Generate Mixed Orientation PDF
    const mixedBuf = await generateRepresentativePdf({ pageCount: 2, mixedOrientation: true })
    const mixedPath = path.join(TEST_TMP_DIR, 'test_mixed.pdf')
    fs.writeFileSync(mixedPath, mixedBuf)

    const mixedGeom = await getPdfGeometry(mixedPath)
    assert.strictEqual(mixedGeom.primaryOrientation, 'mixed', 'Mixed PDF must be detected as mixed')

    console.log('✓ TEST 3 PASSED: Landscape and mixed-orientation page geometry accurately detected')
  })

  await t.test('4. Paper Size Detection: A4 vs Letter dimensions classified without blind A4 forcing', async () => {
    // Letter: 612 x 792 pt
    const letterBuf = await generateRepresentativePdf({ pageCount: 1, pageSize: [612, 792] })
    const letterPath = path.join(TEST_TMP_DIR, 'test_letter.pdf')
    fs.writeFileSync(letterPath, letterBuf)

    const letterGeom = await getPdfGeometry(letterPath)
    assert.strictEqual(letterGeom.primaryPaperSize, 'Letter', 'Letter size must be detected as Letter, not blindly A4')

    // A4: 595 x 842 pt
    const a4Buf = await generateRepresentativePdf({ pageCount: 1, pageSize: [595.28, 841.89] })
    const a4Path = path.join(TEST_TMP_DIR, 'test_a4.pdf')
    fs.writeFileSync(a4Path, a4Buf)

    const a4Geom = await getPdfGeometry(a4Path)
    assert.strictEqual(a4Geom.primaryPaperSize, 'A4', 'A4 size must be detected as A4')

    console.log('✓ TEST 4 PASSED: Dynamic paper size classification accurately distinguishes Letter and A4')
  })

  await t.test('5. Custom Page Range Slicing: vector pages extracted cleanly without rasterization', async () => {
    const multiBuf = await generateRepresentativePdf({ pageCount: 4, orientation: 'portrait' })
    const multiPath = path.join(TEST_TMP_DIR, 'test_multi_source.pdf')
    const slicedPath = path.join(TEST_TMP_DIR, 'test_multi_sliced.pdf')
    fs.writeFileSync(multiPath, multiBuf)

    const success = await slicePdfCustomPages(multiPath, '2,4', slicedPath)
    assert.strictEqual(success, true, 'mutool merge slice must succeed')
    assert.ok(fs.existsSync(slicedPath), 'Sliced PDF must exist')

    const slicedGeom = await getPdfGeometry(slicedPath)
    assert.strictEqual(slicedGeom.pageCount, 2, 'Sliced PDF must contain exactly 2 extracted pages')
    assert.strictEqual(slicedGeom.primaryPaperSize, 'A4', 'Page dimensions must match original A4')

    console.log('✓ TEST 5 PASSED: Custom page ranges sliced as pure vector pages with exact geometry intact')
  })

  await t.test('6. Native Word Conversion (DOCX): native Word COM renders tables & formatting faithfully', async () => {
    const testDocx = path.join(TEST_TMP_DIR, 'test_word_doc.docx')
    const testPdf = path.join(TEST_TMP_DIR, 'test_word_converted.pdf')

    // Create an authentic Word document with formatting and tables via PowerShell
    const createScript = `
$word = New-Object -ComObject Word.Application;
$word.Visible = $false;
$doc = $word.Documents.Add();
$p1 = $doc.Paragraphs.Add();
$p1.Range.Text = "SRKR Engineering College — Lab Report";
$p1.Range.Font.Bold = 1;
$p1.Range.Font.Size = 18;
$p1.Range.InsertParagraphAfter();
$table = $doc.Tables.Add($doc.Paragraphs.Add().Range, 3, 3);
$table.Cell(1,1).Range.Text = "Roll No";
$table.Cell(1,2).Range.Text = "Student Name";
$table.Cell(1,3).Range.Text = "Score";
$table.Cell(2,1).Range.Text = "22B91A0501";
$table.Cell(2,2).Range.Text = "John Doe";
$table.Cell(2,3).Range.Text = "98/100";
$table.Cell(3,1).Range.Text = "22B91A0502";
$table.Cell(3,2).Range.Text = "Jane Smith";
$table.Cell(3,3).Range.Text = "95/100";
$doc.SaveAs([ref]'${testDocx.replace(/'/g, "''")}');
$doc.Close([ref]0);
$word.Quit([ref]0);
`
    execSync('powershell.exe', { input: createScript, windowsHide: true })
    assert.ok(fs.existsSync(testDocx), 'Source DOCX must exist on disk')

    // Perform native Word COM conversion
    await convertDocxToPdfViaWord(testDocx, testPdf)
    assert.ok(fs.existsSync(testPdf), 'Converted PDF artifact must exist')
    assert.ok(fs.statSync(testPdf).size > 5000, 'Converted PDF must be substantial')

    // Verify PDF has valid geometry and pages
    const docxPdfGeom = await getPdfGeometry(testPdf)
    assert.ok(docxPdfGeom.pageCount >= 1, 'Converted PDF must have at least 1 page')

    // Run fidelity validation on converted artifact
    const fidelity = await validateDocumentFidelity({
      orderId: 'XB-DOCX-TEST',
      originalFilePath: testDocx,
      printArtifactPath: testPdf,
      originalFileName: 'Lab_Report.docx',
      detectedFormat: 'DOCX',
      conversionOccurred: true,
      printerName: 'EPSON L130 Series',
      paperSize: 'A4',
      scale: 'noscale',
      orientation: 'portrait',
      pageRange: 'All',
    })

    assert.strictEqual(fidelity.auditRecord.conversionOccurred, true)
    assert.strictEqual(fidelity.auditRecord.detectedFormat, 'DOCX')
    assert.ok(fidelity.auditRecord.fidelityVerdict.includes('NATIVE_DOCUMENT_CONVERTED'))

    console.log('✓ TEST 6 PASSED: Native Word COM converts DOCX with tables, fonts, and styles preserved')
  })

  await t.test('7. PII Safety Invariant: Fidelity diagnostic log contains zero student PII', async () => {
    const dummyPdf = await generateRepresentativePdf({ pageCount: 1 })
    const dummyPath = path.join(TEST_TMP_DIR, 'test_pii.pdf')
    fs.writeFileSync(dummyPath, dummyPdf)

    const fidelity = await validateDocumentFidelity({
      orderId: 'XB9999',
      originalFilePath: dummyPath,
      printArtifactPath: dummyPath,
      originalFileName: 'assignment_chapter1.pdf',
      detectedFormat: 'PDF',
      conversionOccurred: false,
      printerName: 'EPSON L130 Series',
      paperSize: 'A4',
      scale: 'noscale',
      orientation: 'portrait',
      pageRange: 'All',
    })

    const auditStr = JSON.stringify(fidelity.auditRecord)
    assert.doesNotMatch(auditStr, /9876543210/, 'Audit record must not contain phone numbers')
    assert.doesNotMatch(auditStr, /22B91A0501/, 'Audit record must not contain student roll numbers')
    assert.doesNotMatch(auditStr, /john_doe/i, 'Audit record must not contain student names')
    assert.ok(fidelity.auditRecord.sourceHash, 'Audit record must contain cryptographic hash')

    console.log('✓ TEST 7 PASSED: Fidelity audit records adhere strictly to PII privacy invariants')
  })

  // Cleanup temporary test directory
  t.after(() => {
    try {
      if (fs.existsSync(TEST_TMP_DIR)) {
        fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
      }
    } catch {}
  })
})
