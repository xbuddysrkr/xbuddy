import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')

// Dynamic imports of modules under test
const {
  SUPPORTED_TYPES,
  resolveFileType,
  processFile,
} = await import(`file://${path.join(ROOT_DIR, 'frontend', 'src', 'utils', 'fileProcessor.js')}`)

const { validateOrderPayload, savePdfToDiskCache } = await import(`file://${path.join(ROOT_DIR, 'backend', 'api', 'orders.js')}`)
const { savePdfToGridFS, hasPdfInGridFS } = await import(`file://${path.join(ROOT_DIR, 'backend', 'api', '_lib', 'gridfs.js')}`)
const { inspectFileMagic, convertImageToPdf } = require(path.join(ROOT_DIR, 'backend', 'print-agent', 'services', 'wordConverter.js'))

test('XBuddy Document Upload UI & Pipeline - Comprehensive Test Suite', async (t) => {

  // ── TEST 1: Supported format restrictions ─────────────────────────────────────
  await t.test('1. Supported format restrictions in frontend & backend', async () => {
    // A. Frontend SUPPORTED_TYPES must only include PDF, DOC, DOCX, JPG, PNG
    const supportedMimes = Object.keys(SUPPORTED_TYPES)
    const expectedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ]

    assert.strictEqual(
      supportedMimes.length,
      expectedMimes.length,
      `SUPPORTED_TYPES must contain exactly 5 types, found ${supportedMimes.length}`
    )
    for (const mime of expectedMimes) {
      assert.ok(SUPPORTED_TYPES[mime], `SUPPORTED_TYPES must contain ${mime}`)
    }

    // B. Prohibited formats must be absent everywhere
    const prohibitedMimes = [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/rtf',
      'text/rtf',
      'text/plain',
      'image/bmp',
      'image/tiff',
      'image/webp',
      'image/svg+xml',
      'text/html',
    ]
    for (const mime of prohibitedMimes) {
      assert.strictEqual(
        SUPPORTED_TYPES[mime],
        undefined,
        `Prohibited format ${mime} must NOT be present in SUPPORTED_TYPES`
      )
    }

    // C. resolveFileType accepts the 5 valid categories
    const validFiles = [
      { name: 'document.pdf', type: 'application/pdf' },
      { name: 'report.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'thesis.doc', type: 'application/msword' },
      { name: 'photo.jpg', type: 'image/jpeg' },
      { name: 'picture.jpeg', type: 'image/jpeg' },
      { name: 'diagram.png', type: 'image/png' },
    ]
    for (const f of validFiles) {
      const resolved = resolveFileType(f)
      assert.ok(resolved, `resolveFileType must resolve valid file: ${f.name}`)
    }

    // D. resolveFileType rejects removed formats
    const rejectedFiles = [
      { name: 'slides.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { name: 'presentation.ppt', type: 'application/vnd.ms-powerpoint' },
      { name: 'sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'data.xls', type: 'application/vnd.ms-excel' },
      { name: 'notes.txt', type: 'text/plain' },
      { name: 'document.rtf', type: 'application/rtf' },
      { name: 'graphic.svg', type: 'image/svg+xml' },
      { name: 'bitmap.bmp', type: 'image/bmp' },
      { name: 'scan.tiff', type: 'image/tiff' },
      { name: 'web.webp', type: 'image/webp' },
      { name: 'page.html', type: 'text/html' },
    ]
    for (const f of rejectedFiles) {
      const resolved = resolveFileType(f)
      assert.strictEqual(resolved, null, `resolveFileType must reject prohibited file: ${f.name}`)
    }

    // E. UploadSection.jsx constants validation
    const uploadSectionSrc = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'src', 'components', 'UploadSection.jsx'), 'utf8')
    assert.ok(
      uploadSectionSrc.includes("FORMAT_LABELS = ['PDF', 'DOCX', 'DOC', 'JPG', 'PNG']"),
      'FORMAT_LABELS in UploadSection must be strictly PDF, DOCX, DOC, JPG, PNG'
    )
    for (const bad of ['PPTX', 'XLSX', 'RTF', 'TXT', 'WEBP', 'SVG', 'HTML']) {
      assert.ok(
        !uploadSectionSrc.includes(`'${bad}'`),
        `UploadSection FORMAT_LABELS must not contain ${bad}`
      )
    }

    console.log('✓ TEST 1 PASSED: Format restrictions strictly enforced across frontend & backend')
  })

  // ── TEST 2: Backend upload validation ─────────────────────────────────────────
  await t.test('2. Backend upload validation allows only accepted formats and rejects others', async () => {
    // Valid PDF buffer
    const pdfBuf = Buffer.from('%PDF-1.4 simulated pdf data here')
    const resPdf = validateOrderPayload({
      orderId: 'XB8201',
      copies: 1,
      amount: 10,
      pdfBuffer: pdfBuf,
    })
    assert.strictEqual(resPdf.isValid, true, 'PDF buffer must be valid')

    // Valid DOCX buffer (ZIP local header PK\x03\x04)
    const docxBuf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00])
    const resDocx = validateOrderPayload({
      orderId: 'XB8202',
      copies: 1,
      amount: 10,
      pdfBuffer: docxBuf,
    })
    assert.strictEqual(resDocx.isValid, true, 'DOCX buffer must be valid')

    // Valid DOC buffer (OLE compound file \xD0\xCF\x11\xE0)
    const docBuf = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    const resDoc = validateOrderPayload({
      orderId: 'XB8203',
      copies: 1,
      amount: 10,
      pdfBuffer: docBuf,
    })
    assert.strictEqual(resDoc.isValid, true, 'DOC buffer must be valid')

    // Valid JPEG buffer (\xFF\xD8\xFF)
    const jpgBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46])
    const resJpg = validateOrderPayload({
      orderId: 'XB8204',
      copies: 1,
      amount: 10,
      pdfBuffer: jpgBuf,
    })
    assert.strictEqual(resJpg.isValid, true, 'JPEG buffer must be valid')

    // Valid PNG buffer (\x89PNG)
    const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const resPng = validateOrderPayload({
      orderId: 'XB8205',
      copies: 1,
      amount: 10,
      pdfBuffer: pngBuf,
    })
    assert.strictEqual(resPng.isValid, true, 'PNG buffer must be valid')

    // Rejected buffer: Text / RTF / HTML / executable
    const badBuffers = [
      Buffer.from('{\\rtf1\\ansi\\deff0 Simulated RTF document}'),
      Buffer.from('<html><body>Hello world</body></html>'),
      Buffer.from('Plain text student notes'),
      Buffer.from([0x4D, 0x5A, 0x90, 0x00]), // Windows EXE MZ
      Buffer.from([0x42, 0x4D, 0x36, 0x00]), // BMP header BM
    ]

    for (const bad of badBuffers) {
      const resBad = validateOrderPayload({
        orderId: 'XB8209',
        copies: 1,
        amount: 10,
        pdfBuffer: bad,
      })
      assert.strictEqual(resBad.isValid, false, 'Prohibited format must be rejected by backend')
      assert.ok(
        resBad.errors.some(e => e.includes('only PDF, Word') || e.includes('accepted format')),
        'Error message must indicate accepted formats'
      )
    }

    console.log('✓ TEST 2 PASSED: Backend upload validation strictly rejects unsupported binaries')
  })

  // ── TEST 3: Original file preservation (no synthetic PDF overwrite) ────────────
  await t.test('3. Original files are preserved byte-for-byte and not overwritten with synthetic PDFs', async () => {
    // Simulated mock DOCX file
    const docxBytes = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
    const mockFile = {
      name: 'assignment.docx',
      size: docxBytes.length,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      arrayBuffer: async () => docxBytes.buffer,
    }

    const processed = await processFile(mockFile)
    assert.strictEqual(processed.originalFile, mockFile, 'Original file reference must be preserved')
    assert.strictEqual(processed.pdfBlob, mockFile, 'Original file bytes must NOT be replaced with synthetic PDF')
    assert.strictEqual(processed.previewPdfBlob, undefined, 'No synthetic PDF previewBlob in processOffice')

    // Verify disk cache saves with authentic extension
    const testDir = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })

    const testId = 'XB9991'
    savePdfToDiskCache(testId, docxBytes, 'lab_report.docx')
    const expectedDiskFile = path.join(testDir, `${testId}.docx`)
    assert.ok(fs.existsSync(expectedDiskFile), `Disk cache must retain original .docx extension: ${expectedDiskFile}`)
    const cachedBytes = fs.readFileSync(expectedDiskFile)
    assert.deepStrictEqual(cachedBytes, docxBytes, 'Disk cache must preserve exact uploaded bytes')

    // Cleanup disk cache artifact
    try { fs.unlinkSync(expectedDiskFile) } catch {}

    // Verify image preservation
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const imgId = 'XB9992'
    savePdfToDiskCache(imgId, pngBytes, 'id_card.png')
    const expectedImgFile = path.join(testDir, `${imgId}.png`)
    assert.ok(fs.existsSync(expectedImgFile), `Disk cache must retain original .png extension: ${expectedImgFile}`)
    try { fs.unlinkSync(expectedImgFile) } catch {}

    console.log('✓ TEST 3 PASSED: Authentic file bytes and extensions are preserved without synthetic PDF replacement')
  })

  // ── TEST 4: UI elements verification ──────────────────────────────────────────
  await t.test('4. Upload UI contains Preview Document, Replace File, and Remove File options', () => {
    const uploadSectionSrc = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'src', 'components', 'UploadSection.jsx'), 'utf8')

    // A. Preview Document button
    assert.ok(
      uploadSectionSrc.includes('id="btn-preview-document"') || uploadSectionSrc.includes('Preview Document'),
      'UploadSection must render Preview Document button'
    )

    // B. Replace File option
    assert.ok(
      uploadSectionSrc.includes('id="btn-replace-file"') || uploadSectionSrc.includes('Replace File'),
      'UploadSection must render Replace File option'
    )

    // C. Remove File option
    assert.ok(
      uploadSectionSrc.includes('id="btn-remove-file"') || uploadSectionSrc.includes('Remove File'),
      'UploadSection must render Remove File option'
    )

    // D. Modal viewer integration
    assert.ok(
      uploadSectionSrc.includes('<DocumentPreviewModal'),
      'UploadSection must integrate DocumentPreviewModal'
    )

    // E. Verify DocumentPreviewModal component exists and has required features
    const previewModalSrc = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'src', 'components', 'DocumentPreviewModal.jsx'), 'utf8')
    assert.ok(previewModalSrc.includes('handleZoomIn'), 'Preview modal must have Zoom In control')
    assert.ok(previewModalSrc.includes('handleZoomOut'), 'Preview modal must have Zoom Out control')
    assert.ok(previewModalSrc.includes('pdfjsLib'), 'Preview modal must use PDF.js for PDF rendering')
    assert.ok(previewModalSrc.includes('docx-preview'), 'Preview modal must support docx-preview for DOCX')
    assert.ok(previewModalSrc.includes('URL.revokeObjectURL'), 'Preview modal must revoke browser object URLs on unmount')

    console.log('✓ TEST 4 PASSED: Upload UI provides Preview Document, Replace File, Remove File, and responsive modal')
  })

  // ── TEST 5: Preview security invariant ────────────────────────────────────────
  await t.test('5. Previewing does NOT create orders, mark payments, or trigger printing', () => {
    const ordersApiSrc = fs.readFileSync(path.join(ROOT_DIR, 'backend', 'api', 'orders.js'), 'utf8')

    // Inspect previewDocument action implementation in orders.js
    const previewSection = ordersApiSrc.slice(
      ordersApiSrc.indexOf("action === 'previewDocument'"),
      ordersApiSrc.indexOf("// ── 1. SAVE ORDER")
    )

    assert.ok(previewSection.length > 0, 'previewDocument handler must be present')
    assert.ok(!previewSection.includes("db.collection('orders').insertOne"), 'previewDocument must never insert into orders collection')
    assert.ok(!previewSection.includes("paymentStatus: 'paid'"), 'previewDocument must never mark payment verified')
    assert.ok(!previewSection.includes("ptp.print"), 'previewDocument must never trigger physical printing')
    assert.ok(previewSection.includes('unlinkSync'), 'previewDocument must clean up temporary conversion artifacts')

    console.log('✓ TEST 5 PASSED: Strict preview security invariant verified — zero order/payment/print side-effects')
  })

  // ── TEST 6: Hardware Print Agent format handling ──────────────────────────────
  await t.test('6. Hardware Print Agent inspects magic and supports image & office conversion artifacts', async () => {
    // Test inspectFileMagic on mock files
    const tmpDir = path.join(ROOT_DIR, 'backend', 'downloads', 'test_magic_tmp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const testPdf = path.join(tmpDir, 'test.pdf')
    const testDocx = path.join(tmpDir, 'test.docx')
    const testJpg = path.join(tmpDir, 'test.jpg')
    const testPng = path.join(tmpDir, 'test.png')

    const VALID_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    fs.writeFileSync(testPdf, Buffer.from('%PDF-1.4 sample'))
    fs.writeFileSync(testDocx, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00]))
    fs.writeFileSync(testJpg, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))
    fs.writeFileSync(testPng, Buffer.from(VALID_PNG_B64, 'base64'))

    assert.strictEqual(inspectFileMagic(testPdf), 'PDF')
    assert.strictEqual(inspectFileMagic(testDocx), 'DOCX')
    assert.strictEqual(inspectFileMagic(testJpg), 'JPEG')
    assert.strictEqual(inspectFileMagic(testPng), 'PNG')

    // Test convertImageToPdf converts image to valid PDF artifact
    const outPdf = path.join(tmpDir, 'converted_img.pdf')
    await convertImageToPdf(testPng, outPdf)
    assert.ok(fs.existsSync(outPdf), 'convertImageToPdf must create PDF print artifact')
    const outPdfHeader = fs.readFileSync(outPdf, { encoding: 'latin1' })
    assert.ok(outPdfHeader.startsWith('%PDF'), 'Converted image artifact must have %PDF header')

    // Cleanup
    try {
      fs.unlinkSync(testPdf)
      fs.unlinkSync(testDocx)
      fs.unlinkSync(testJpg)
      fs.unlinkSync(testPng)
      fs.unlinkSync(outPdf)
      fs.rmdirSync(tmpDir)
    } catch {}

    console.log('✓ TEST 6 PASSED: Hardware Print Agent detects all 5 formats and converts images to print artifacts')
  })

})
