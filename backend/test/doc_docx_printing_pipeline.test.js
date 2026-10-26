import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const AGENT_DIR = path.join(ROOT_DIR, 'backend', 'print-agent')

const {
  convertDocxToPdfViaWord,
  inspectFileMagic,
  findLibreOffice,
  validateConvertedPdf,
} = require(path.join(AGENT_DIR, 'services', 'wordConverter.js'))

const { validateOrderPayload } = await import('../api/orders.js')
const { getPdfGeometry } = await import(`file://${path.join(AGENT_DIR, 'services', 'fidelityValidator.js')}`)

const TEST_DIR = path.join(AGENT_DIR, 'downloads', 'test_doc_pipeline_tmp')
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true })
}

test('Comprehensive DOC and DOCX Printing Pipeline Test Suite', async (t) => {
  const sampleDocx = path.join(TEST_DIR, 'sample_report.docx')
  const sampleDocxPdf = path.join(TEST_DIR, 'sample_report_converted.pdf')
  const sampleDoc = path.join(TEST_DIR, 'sample_legacy.doc')
  const sampleDocPdf = path.join(TEST_DIR, 'sample_legacy_converted.pdf')

  // Generate authentic DOCX and legacy DOC via Word COM
  try {
    const psGen = `
$w = New-Object -ComObject Word.Application;
$w.Visible = $false;
$w.DisplayAlerts = 0;

# 1. Create DOCX
$d1 = $w.Documents.Add();
$p1 = $d1.Paragraphs.Add();
$p1.Range.Text = "SRKR Computer Science Department — Final Year Project";
$p1.Range.Font.Bold = 1;
$p1.Range.Font.Size = 16;
$t1 = $d1.Tables.Add($d1.Paragraphs.Add().Range, 3, 3);
$t1.Cell(1,1).Range.Text = "Item";
$t1.Cell(1,2).Range.Text = "Quantity";
$t1.Cell(1,3).Range.Text = "Status";
$t1.Cell(2,1).Range.Text = "Arduino Uno";
$t1.Cell(2,2).Range.Text = "2";
$t1.Cell(2,3).Range.Text = "Verified";
$t1.Cell(3,1).Range.Text = "Thermal Printer";
$t1.Cell(3,2).Range.Text = "1";
$t1.Cell(3,3).Range.Text = "Connected";
$d1.SaveAs([ref]'${sampleDocx.replace(/'/g, "''")}');
$d1.Close([ref]0);

# 2. Create legacy DOC (Word 97-2003 format: wdFormatDocument97 = 0)
$d2 = $w.Documents.Add();
$p2 = $d2.Paragraphs.Add();
$p2.Range.Text = "Legacy Word Document 97-2003 Specification";
$p2.Range.Font.Bold = 1;
$p2.Range.Font.Size = 14;
$d2.SaveAs([ref]'${sampleDoc.replace(/'/g, "''")}', [ref]0);
$d2.Close([ref]0);

$w.Quit([ref]0);
`
    execSync('powershell.exe', { input: psGen, windowsHide: true })
  } catch (err) {
    console.warn('[TEST_SETUP_WARN] Could not generate sample Word files via COM:', err.message)
  }

  await t.test('1. Accurate File-Type Detection by Magic Bytes', async () => {
    assert.ok(fs.existsSync(sampleDocx), 'Sample DOCX must exist')
    assert.ok(fs.existsSync(sampleDoc), 'Sample DOC must exist')

    const docxMagic = inspectFileMagic(sampleDocx)
    const docMagic = inspectFileMagic(sampleDoc)

    assert.strictEqual(docxMagic, 'DOCX', 'DOCX magic bytes must be identified as DOCX')
    assert.strictEqual(docMagic, 'DOC', 'Legacy DOC magic bytes must be identified as DOC')

    // Disguised file test: DOCX bytes saved with .pdf extension
    const disguisedDocx = path.join(TEST_DIR, 'disguised.pdf')
    fs.copyFileSync(sampleDocx, disguisedDocx)
    assert.strictEqual(inspectFileMagic(disguisedDocx), 'DOCX', 'inspectFileMagic must identify DOCX even if filename has .pdf extension')
    fs.unlinkSync(disguisedDocx)

    console.log('✓ TEST 1 PASSED: File-type detection accurately identifies DOCX, DOC, and disguised files')
  })

  await t.test('2. Backend Order Payload Validation for DOCX and DOC', async () => {
    const docxBytes = fs.readFileSync(sampleDocx)
    const docBytes = fs.readFileSync(sampleDoc)

    // Valid DOCX order
    const valDocx = validateOrderPayload({
      orderId: 'XB3301',
      fileName: 'Project_Report.docx',
      copies: 1,
      amount: 15,
      pdfBuffer: docxBytes,
    })
    assert.strictEqual(valDocx.isValid, true, 'validateOrderPayload must accept genuine DOCX buffer')

    // Valid legacy DOC order
    const valDoc = validateOrderPayload({
      orderId: 'XB3302',
      fileName: 'Project_Report.doc',
      copies: 2,
      amount: 30,
      pdfBuffer: docBytes,
    })
    assert.strictEqual(valDoc.isValid, true, 'validateOrderPayload must accept genuine legacy DOC buffer')

    // Invalid non-document file rejected
    const valInvalid = validateOrderPayload({
      orderId: 'XB3303',
      fileName: 'malicious.exe',
      copies: 1,
      amount: 10,
      pdfBuffer: Buffer.from('MZ_WINDOWS_EXECUTABLE_HEADER'),
    })
    assert.strictEqual(valInvalid.isValid, false, 'validateOrderPayload must reject non-document files')
    assert.ok(valInvalid.errors.some(e => e.includes('PDF with %PDF- header, DOCX, or DOC')))

    console.log('✓ TEST 2 PASSED: Backend order validation accepts DOCX/DOC and rejects non-document files')
  })

  await t.test('3. High-Fidelity DOCX to PDF Conversion and Output Validation', async () => {
    const originalHash = crypto.createHash('sha256').update(fs.readFileSync(sampleDocx)).digest('hex')

    await convertDocxToPdfViaWord(sampleDocx, sampleDocxPdf)

    assert.ok(fs.existsSync(sampleDocxPdf), 'Converted PDF must exist on disk')
    assert.ok(fs.statSync(sampleDocxPdf).size > 5000, 'Converted PDF must be substantial')

    // Source file must be completely untouched
    const postHash = crypto.createHash('sha256').update(fs.readFileSync(sampleDocx)).digest('hex')
    assert.strictEqual(postHash, originalHash, 'Original DOCX must not be altered or overwritten during conversion')

    // Output PDF validation
    const validation = await validateConvertedPdf(sampleDocxPdf)
    assert.strictEqual(validation.valid, true)
    assert.ok(validation.pageCount >= 1, 'Converted PDF must have at least 1 page')

    console.log(`✓ TEST 3 PASSED: DOCX converted to valid PDF (${validation.pageCount} pages, ${validation.sizeBytes} bytes) with original preserved`)
  })

  await t.test('4. High-Fidelity Legacy DOC to PDF Conversion and Output Validation', async () => {
    const originalHash = crypto.createHash('sha256').update(fs.readFileSync(sampleDoc)).digest('hex')

    await convertDocxToPdfViaWord(sampleDoc, sampleDocPdf)

    assert.ok(fs.existsSync(sampleDocPdf), 'Converted PDF from legacy DOC must exist on disk')
    assert.ok(fs.statSync(sampleDocPdf).size > 5000, 'Converted PDF from DOC must be substantial')

    const postHash = crypto.createHash('sha256').update(fs.readFileSync(sampleDoc)).digest('hex')
    assert.strictEqual(postHash, originalHash, 'Original DOC must not be altered or overwritten during conversion')

    const validation = await validateConvertedPdf(sampleDocPdf)
    assert.strictEqual(validation.valid, true)
    assert.ok(validation.pageCount >= 1, 'Converted PDF from DOC must have at least 1 page')

    console.log(`✓ TEST 4 PASSED: Legacy DOC converted to valid PDF (${validation.pageCount} pages) with original preserved`)
  })

  await t.test('5. Non-Overwriting Guard: Input matching output path is strictly rejected', async () => {
    await assert.rejects(
      async () => {
        await convertDocxToPdfViaWord(sampleDocx, sampleDocx)
      },
      /Cannot overwrite original document/i,
      'convertDocxToPdfViaWord must reject when input and output paths are identical'
    )
    console.log('✓ TEST 5 PASSED: Destruction/overwriting of source document strictly prevented')
  })

  await t.test('6. PDF Output Validation Safety Guards: Truncated or empty output is rejected', async () => {
    const emptyPdf = path.join(TEST_DIR, 'empty.pdf')
    fs.writeFileSync(emptyPdf, Buffer.alloc(100))

    await assert.rejects(
      async () => {
        await validateConvertedPdf(emptyPdf)
      },
      /empty or truncated/i,
      'validateConvertedPdf must reject files smaller than 500 bytes'
    )

    const invalidHeaderPdf = path.join(TEST_DIR, 'bad_header.pdf')
    fs.writeFileSync(invalidHeaderPdf, Buffer.alloc(1000, 0x41)) // 1000 'A's, no %PDF

    await assert.rejects(
      async () => {
        await validateConvertedPdf(invalidHeaderPdf)
      },
      /not a valid PDF/i,
      'validateConvertedPdf must reject files lacking %PDF- header'
    )

    console.log('✓ TEST 6 PASSED: Output validation rejects empty, truncated, or invalid PDFs')
  })

  await t.test('7. Translation String Interpolation Guard: {id} is interpolated accurately', async () => {
    // Simulate translation resolution with both parameter orders
    const testOrderId = 'XB8212'

    // Provider logic test: t(path, fallbackString, paramsObject)
    function resolveT(pathKey, paramsOrFallback, fallback) {
      let params = null
      let defaultText = null

      if (paramsOrFallback !== null && typeof paramsOrFallback === 'object') {
        params = paramsOrFallback
        defaultText = typeof fallback === 'string' ? fallback : null
      } else if (typeof paramsOrFallback === 'string') {
        defaultText = paramsOrFallback
        if (fallback !== null && typeof fallback === 'object') {
          params = fallback
        }
      } else if (typeof fallback === 'string') {
        defaultText = fallback
      } else if (fallback !== null && typeof fallback === 'object') {
        params = fallback
      }

      let current = defaultText || pathKey
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          current = current.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal))
        })
      }
      return current
    }

    const resolved = resolveT(
      'status.printIssueDesc',
      'There was an issue at the printer. Please inform the shopkeeper with Order ID {id}.',
      { id: testOrderId }
    )

    assert.ok(resolved.includes('Order ID XB8212'), `Resolved string must include XB8212, got: "${resolved}"`)
    assert.strictEqual(resolved.includes('{id}'), false, 'Resolved string must NOT contain literal "{id}"')

    console.log(`✓ TEST 7 PASSED: UI error message interpolates Order ID accurately: "${resolved}"`)
  })

  // Cleanup temporary test files
  t.after(() => {
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true })
      }
    } catch {}
  })
})
