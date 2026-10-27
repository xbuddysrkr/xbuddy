import 'dotenv/config'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeAgentOrder,
  validateAgentAuth,
} from '../api/agent/orders.js'

async function runDocumentAssociationTests() {
  console.log('=== STARTING DOCUMENT ASSOCIATION & PRINTING PIPELINE REGRESSION TESTS ===')

  // ── TEST 1: DOCX Order (e.g., XB3510 / XB7673 resignation.docx) ───────────────
  const docxMongoRecord = {
    orderId: 'XB3510',
    name: 'Test Student',
    fileName: 'resignation.docx',
    fileExtension: '.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
    pdfSize: 15065,
    fileSize: 15065,
    documentId: 'XB3510',
    fileId: 'XB3510',
    gridFsFileId: '69ff34a1bc124',
    storageProvider: 'gridfs',
    copies: 1,
    colorMode: 'bw',
    printType: 'B&W',
    paymentStatus: 'paid',
    printStatus: 'waiting_for_shopkeeper',
    createdAt: new Date().toISOString(),
  }

  const normalizedDocx = normalizeAgentOrder(docxMongoRecord)

  // Invariant 1: Document association preserved
  assert.strictEqual(normalizedDocx.hasPdf, true, 'hasPdf must be true for valid DOCX in GridFS')
  assert.strictEqual(normalizedDocx.hasDocument, true, 'hasDocument must be true for valid DOCX')
  assert.strictEqual(normalizedDocx.hasGridFsPdf, true, 'hasGridFsPdf must be true')
  assert.strictEqual(normalizedDocx.documentId, 'XB3510', 'documentId must match')
  assert.strictEqual(normalizedDocx.fileId, 'XB3510', 'fileId must match')
  assert.strictEqual(normalizedDocx.fileExtension, '.docx', 'fileExtension must be .docx')
  assert.strictEqual(
    normalizedDocx.mimeType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'mimeType must match DOCX'
  )
  assert.strictEqual(normalizedDocx.fileSize, 15065, 'fileSize must match')
  assert.strictEqual(normalizedDocx.pdfSize, 15065, 'pdfSize must match')

  // Invariant 2: Download URLs populated and accessible
  assert.ok(
    normalizedDocx.fileUrl.endsWith('/api/orders?action=getOrderPdf&orderId=XB3510'),
    'fileUrl must point to download endpoint'
  )
  assert.ok(
    normalizedDocx.pdfUrl.endsWith('/api/orders?action=getOrderPdf&orderId=XB3510'),
    'pdfUrl must point to download endpoint'
  )

  // Invariant 3: Backward compatibility for older agent installations
  // Older agents check order.driveUrl when order.hasPdf is absent in legacy contracts.
  assert.ok(
    normalizedDocx.driveUrl.endsWith('/api/orders?action=getOrderPdf&orderId=XB3510'),
    'driveUrl must fallback to download URL when empty so older agents validate and download'
  )
  console.log('✓ TEST 1 PASSED: DOCX order (XB3510 / resignation.docx) associates document references and URLs perfectly')

  // ── TEST 2: PDF Order Normalization & Document Reference ─────────────────────
  const pdfMongoRecord = {
    orderId: 'XB1001',
    name: 'Syllabus Order',
    fileName: 'syllabus.pdf',
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
    pdfSize: 85200,
    copies: 2,
    colorMode: 'bw',
    paymentStatus: 'paid',
  }

  const normalizedPdf = normalizeAgentOrder(pdfMongoRecord)
  assert.strictEqual(normalizedPdf.hasPdf, true, 'hasPdf must be true for PDF')
  assert.strictEqual(normalizedPdf.hasDocument, true, 'hasDocument must be true for PDF')
  assert.strictEqual(normalizedPdf.fileExtension, '.pdf', 'fileExtension must default to .pdf')
  assert.strictEqual(normalizedPdf.mimeType, 'application/pdf', 'mimeType must default to application/pdf')
  assert.strictEqual(normalizedPdf.documentId, 'XB1001', 'documentId must default to orderId')
  assert.strictEqual(normalizedPdf.fileId, 'XB1001', 'fileId must default to orderId')
  console.log('✓ TEST 2 PASSED: PDF order normalizes cleanly with standard MIME type and document reference')

  // ── TEST 3: Legacy DOC Order Support ─────────────────────────────────────────
  const docLegacyRecord = {
    orderId: 'XB2002',
    name: 'Old Resume',
    fileName: 'resume.doc',
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
    pdfSize: 45000,
    copies: 1,
    paymentStatus: 'paid',
  }

  const normalizedDoc = normalizeAgentOrder(docLegacyRecord)
  assert.strictEqual(normalizedDoc.hasDocument, true, 'hasDocument must be true for legacy DOC')
  assert.strictEqual(normalizedDoc.fileExtension, '.doc', 'fileExtension must be .doc')
  assert.strictEqual(normalizedDoc.mimeType, 'application/msword', 'mimeType must be application/msword')
  console.log('✓ TEST 3 PASSED: Legacy DOC format correctly classified with .doc extension and application/msword')

  // ── TEST 4: Missing Document Reference Handling ──────────────────────────────
  const noDocRecord = {
    orderId: 'XB9999',
    name: 'Ghost Order',
    fileName: 'missing.pdf',
    hasPdf: false,
    hasGridFsPdf: false,
    pdfStorage: 'none',
    driveUrl: '',
    pdfBase64: null,
  }

  const normalizedNoDoc = normalizeAgentOrder(noDocRecord)
  assert.strictEqual(normalizedNoDoc.hasPdf, false, 'hasPdf must be false')
  assert.strictEqual(normalizedNoDoc.hasDocument, false, 'hasDocument must be false')
  assert.strictEqual(normalizedNoDoc.documentId, null, 'documentId must be null for order with no file')
  assert.strictEqual(normalizedNoDoc.fileId, null, 'fileId must be null for order with no file')
  assert.strictEqual(normalizedNoDoc.fileUrl, null, 'fileUrl must be null')
  assert.strictEqual(normalizedNoDoc.driveUrl, '', 'driveUrl must be empty string')
  console.log('✓ TEST 4 PASSED: Missing document reference leaves documentId, fileUrl, and hasDocument false/null')

  // ── TEST 5: Mismatched Order and Document IDs ────────────────────────────────
  const mismatchedDocRecord = {
    orderId: 'XB3333',
    documentId: 'DOC_EXTERNAL_777',
    fileId: 'DOC_EXTERNAL_777',
    gridFsFileId: 'gridfs_obj_888',
    fileName: 'custom_doc.docx',
    fileExtension: '.docx',
    hasPdf: true,
    hasGridFsPdf: true,
  }

  const normalizedMismatched = normalizeAgentOrder(mismatchedDocRecord)
  assert.strictEqual(normalizedMismatched.orderId, 'XB3333', 'orderId must be preserved')
  assert.strictEqual(normalizedMismatched.documentId, 'DOC_EXTERNAL_777', 'distinct documentId must NOT be overwritten')
  assert.strictEqual(normalizedMismatched.fileId, 'DOC_EXTERNAL_777', 'distinct fileId must NOT be overwritten')
  assert.strictEqual(normalizedMismatched.gridFsFileId, 'gridfs_obj_888', 'gridFsFileId must be preserved')
  console.log('✓ TEST 5 PASSED: Separate documentId/fileId preserved without orderId collision')

  // ── TEST 6: Print Station Agent Validation Simulation ────────────────────────
  // Test localServer.js hasKnownPdf evaluation for both valid DOCX and missing doc
  function evaluateAgentDocumentPresence(order, filePathExists = false) {
    return Boolean(
      order.hasPdf === true ||
      order.hasGridFsPdf === true ||
      order.hasDocument === true ||
      Boolean(order.documentId) ||
      Boolean(order.fileId) ||
      Boolean(order.driveUrl && order.driveUrl.trim()) ||
      Boolean(order.pdfUrl && order.pdfUrl.trim()) ||
      Boolean(order.fileUrl && order.fileUrl.trim()) ||
      Boolean(order.pdfBase64 && order.pdfBase64.length > 50) ||
      filePathExists
    )
  }

  // A: Live DOCX order XB3510 as normalized by new agent route
  const agentDocxCheck = evaluateAgentDocumentPresence(normalizedDocx, false)
  assert.strictEqual(agentDocxCheck, true, 'Agent MUST accept normalized DOCX order prior to download')

  // B: Live DOCX order XB3510 even under older agent checking only driveUrl or hasPdf
  const olderAgentDocxCheck = Boolean(
    normalizedDocx.hasPdf === true ||
    normalizedDocx.hasGridFsPdf === true ||
    Boolean(normalizedDocx.driveUrl && normalizedDocx.driveUrl.trim())
  )
  assert.strictEqual(olderAgentDocxCheck, true, 'Older agent installations MUST accept order via driveUrl fallback')

  // C: True missing document order
  const agentNoDocCheck = evaluateAgentDocumentPresence(normalizedNoDoc, false)
  assert.strictEqual(agentNoDocCheck, false, 'Agent MUST reject order when no document reference exists')
  console.log('✓ TEST 6 PASSED: Print Station agent release validation accepts valid DOCX and rejects missing document')

  // ── TEST 7: Binary Integrity & Magic Bytes Verification ──────────────────────
  function inspectMagic(buffer) {
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'PDF'
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return 'DOCX'
    if (buffer.length >= 4 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return 'DOC'
    return 'UNKNOWN'
  }

  // Simulated DOCX ZIP archive magic bytes (PK\x03\x04)
  const simulatedDocxBuf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
  assert.strictEqual(inspectMagic(simulatedDocxBuf), 'DOCX', 'PK.. header must be identified as DOCX')

  // Simulated PDF magic bytes (%PDF-1.7)
  const simulatedPdfBuf = Buffer.from('%PDF-1.7\r\n', 'ascii')
  assert.strictEqual(inspectMagic(simulatedPdfBuf), 'PDF', '%PDF header must be identified as PDF')

  // Simulated legacy DOC magic bytes (\xD0\xCF\x11\xE0)
  const simulatedDocBuf = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
  assert.strictEqual(inspectMagic(simulatedDocBuf), 'DOC', 'Compound file header must be identified as DOC')
  console.log('✓ TEST 7 PASSED: Binary magic byte detection distinguishes DOCX, PDF, and DOC accurately')

  // ── TEST 8: Security Invariant - No Credentials or Secrets Exposed ───────────
  const jsonOutput = JSON.stringify(normalizedDocx)
  assert.strictEqual(jsonOutput.includes('mongodb+srv'), false, 'Database URI must never appear in agent order')
  assert.strictEqual(jsonOutput.includes('private_key'), false, 'Private keys must never appear in agent order')
  console.log('✓ TEST 8 PASSED: Security invariants verified (zero secrets or credentials in agent payload)')

  console.log('\n=== ALL 8 REGRESSION TESTS PASSED SUCCESSFULLY ===\n')
}

runDocumentAssociationTests().catch((err) => {
  console.error('Test Suite Failed:', err)
  process.exit(1)
})
