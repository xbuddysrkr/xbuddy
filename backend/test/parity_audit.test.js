import assert from 'node:assert/strict'
import {
  normalizeOrder,
  compareOrders,
  runParityAudit,
  formatAuditReport,
  CANONICAL_ORDER_FIELDS,
} from '../api/_lib/parityAudit.js'

console.log('--- STARTING XBUDDY PHASE 2 PARITY AUDIT TEST SUITE ---')

// Baseline canonical order template
const baseSheetOrder = {
  orderId: 'XB5649',
  name: 'Student Test',
  fileName: 'Project_Final.pdf',
  totalPages: '5',
  copies: '2',
  colorMode: 'bw',
  printType: 'B&W',
  printSide: 'Single',
  duplex: 'false',
  pageSize: 'A4',
  paperSize: 'A4',
  orientation: 'portrait',
  amount: '15',
  printingCost: '12',
  serviceFee: '3',
  digitalProcessingFee: '3',
  transactionId: 'TX987654',
  pageRange: '1-3',
  pageRangeMode: 'custom',
  customPages: '1-3',
  printableCount: '3',
  selectedPages: '[1, 2, 3]',
  selectedPageCount: '3',
  driveUrl: '',
  paymentStatus: 'pending',
  printStatus: 'waiting_for_shopkeeper',
  createdAt: '2026-10-06T12:00:00.000Z',
}

const baseMongoOrder = {
  orderId: 'XB5649',
  name: 'Student Test',
  fileName: 'Project_Final.pdf',
  totalPages: 5,
  copies: 2,
  colorMode: 'bw',
  printType: 'B&W',
  printSide: 'Single',
  duplex: false,
  pageSize: 'A4',
  paperSize: 'A4',
  orientation: 'portrait',
  amount: 15,
  printingCost: 12,
  serviceFee: 3,
  digitalProcessingFee: 3,
  transactionId: 'TX987654',
  pageRange: '1-3',
  pageRangeMode: 'custom',
  customPages: '1-3',
  printableCount: 3,
  selectedPages: [1, 2, 3],
  selectedPageCount: 3,
  driveUrl: '',
  paymentStatus: 'pending',
  printStatus: 'waiting_for_shopkeeper',
  createdAt: '2026-10-06T12:00:00.000Z',
  updatedAt: '2026-10-06T12:00:00.000Z',
}

// ── TEST 1: Identical Order Documents → PASS ────────────────────────────────
{
  const sNorm = normalizeOrder(baseSheetOrder, 'sheet')
  const mNorm = normalizeOrder(baseMongoOrder, 'mongo')
  const comp = compareOrders(sNorm, mNorm)
  assert.equal(comp.isMatch, true, 'TEST 1 FAILED: Identical normalized orders must match')
  assert.equal(comp.mismatches.length, 0)
  console.log('✓ TEST 1 PASSED: Identical order documents match across all canonical fields')
}

// ── TEST 2: Numeric String vs Number → Normalized PASS ──────────────────────
{
  const sOrder = { ...baseSheetOrder, amount: '45.00', copies: '3', totalPages: '10' }
  const mOrder = { ...baseMongoOrder, amount: 45, copies: 3, totalPages: 10 }
  const sNorm = normalizeOrder(sOrder, 'sheet')
  const mNorm = normalizeOrder(mOrder, 'mongo')
  const comp = compareOrders(sNorm, mNorm)
  assert.equal(comp.isMatch, true, 'TEST 2 FAILED: String numbers vs numeric numbers must match')
  console.log('✓ TEST 2 PASSED: Numeric string vs number normalized and matched')
}

// ── TEST 3: Boolean String vs Boolean → Normalized PASS ─────────────────────
{
  const sOrder = { ...baseSheetOrder, duplex: 'true', printSide: 'Double' }
  const mOrder = { ...baseMongoOrder, duplex: true, printSide: 'Double' }
  const sNorm = normalizeOrder(sOrder, 'sheet')
  const mNorm = normalizeOrder(mOrder, 'mongo')
  const comp = compareOrders(sNorm, mNorm)
  assert.equal(comp.isMatch, true, 'TEST 3 FAILED: Boolean string vs boolean must match')
  console.log('✓ TEST 3 PASSED: Boolean string vs boolean normalized and matched')
}

// ── TEST 4: selectedPages JSON String vs Array → Normalized PASS ────────────
{
  // Sheet has JSON string "[1, 3, 5]" or comma-separated "1,3,5"
  const sOrder1 = { ...baseSheetOrder, selectedPages: '[1, 3, 5]' }
  const sOrder2 = { ...baseSheetOrder, selectedPages: '1, 3, 5' }
  const mOrder = { ...baseMongoOrder, selectedPages: [1, 3, 5] }

  const sNorm1 = normalizeOrder(sOrder1, 'sheet')
  const sNorm2 = normalizeOrder(sOrder2, 'sheet')
  const mNorm = normalizeOrder(mOrder, 'mongo')

  assert.equal(compareOrders(sNorm1, mNorm).isMatch, true, 'JSON string array vs array must match')
  assert.equal(compareOrders(sNorm2, mNorm).isMatch, true, 'Comma string array vs array must match')
  console.log('✓ TEST 4 PASSED: selectedPages JSON string & comma string match MongoDB array')
}

// ── TEST 5: Timestamp Format Normalization → PASS ───────────────────────────
{
  // Sheet may store local date string or ISO without ms
  const sOrder = { ...baseSheetOrder, createdAt: '2026-10-06T12:00:00Z' }
  const mOrder = { ...baseMongoOrder, createdAt: '2026-10-06T12:00:00.000Z' }
  const sNorm = normalizeOrder(sOrder, 'sheet')
  const mNorm = normalizeOrder(mOrder, 'mongo')
  const comp = compareOrders(sNorm, mNorm)
  assert.equal(comp.isMatch, true, 'TEST 5 FAILED: Minor ISO timestamp format differences must normalize')

  // Small dual-write latency delta (<= 2 seconds) should match
  const sOrderLatency = { ...baseSheetOrder, createdAt: '2026-10-06T12:00:00.000Z' }
  const mOrderLatency = { ...baseMongoOrder, createdAt: '2026-10-06T12:00:01.500Z' }
  const sNormL = normalizeOrder(sOrderLatency, 'sheet')
  const mNormL = normalizeOrder(mOrderLatency, 'mongo')
  assert.equal(compareOrders(sNormL, mNormL).isMatch, true, 'Dual-write latency delta <= 3s should match')

  // Large timestamp delta (> 3 seconds) must NOT be silently tolerated
  const sOrderStale = { ...baseSheetOrder, createdAt: '2026-10-06T12:00:00.000Z' }
  const mOrderStale = { ...baseMongoOrder, createdAt: '2026-10-06T12:10:00.000Z' } // 10 mins apart
  const sNormS = normalizeOrder(sOrderStale, 'sheet')
  const mNormS = normalizeOrder(mOrderStale, 'mongo')
  assert.equal(compareOrders(sNormS, mNormS).isMatch, false, 'Large timestamp delta must report mismatch')
  console.log('✓ TEST 5 PASSED: Timestamp formatting and latency thresholds normalized accurately')
}

// ── TEST 6: Missing MongoDB Order → Reported in Missing / Audit FAIL ────────
{
  const audit = runParityAudit({
    sheetOrders: [baseSheetOrder, { ...baseSheetOrder, orderId: 'XB9999' }],
    mongoOrders: [baseMongoOrder],
  })
  assert.equal(audit.missingInMongo, 1, 'TEST 6 FAILED: Should detect 1 order missing in Mongo')
  assert.ok(audit.existsOnlyInSheet.includes('XB9999'))
  console.log('✓ TEST 6 PASSED: Missing MongoDB order accurately detected')
}

// ── TEST 7: Missing Sheet Order → Reported in Missing / Audit FAIL ──────────
{
  const audit = runParityAudit({
    sheetOrders: [baseSheetOrder],
    mongoOrders: [baseMongoOrder, { ...baseMongoOrder, orderId: 'XB8888' }],
  })
  assert.equal(audit.missingInSheet, 1, 'TEST 7 FAILED: Should detect 1 order missing in Sheet')
  assert.ok(audit.existsOnlyInMongo.includes('XB8888'))
  console.log('✓ TEST 7 PASSED: Missing Sheet order accurately detected')
}

// ── TEST 8: Different Amount → Field Mismatch Reported ──────────────────────
{
  const sOrder = { ...baseSheetOrder, amount: 25 }
  const mOrder = { ...baseMongoOrder, amount: 30 }
  const comp = compareOrders(normalizeOrder(sOrder), normalizeOrder(mOrder))
  assert.equal(comp.isMatch, false, 'TEST 8 FAILED: Differing amounts must fail')
  const amountMismatch = comp.mismatches.find(m => m.field === 'amount')
  assert.ok(amountMismatch, 'Must report field: amount')
  assert.equal(amountMismatch.googleSheetValue, 25)
  assert.equal(amountMismatch.mongoValue, 30)
  console.log('✓ TEST 8 PASSED: Differing amount reported as real field mismatch')
}

// ── TEST 9: Different paymentStatus → Field Mismatch Reported ───────────────
{
  const sOrder = { ...baseSheetOrder, paymentStatus: 'pending' }
  const mOrder = { ...baseMongoOrder, paymentStatus: 'completed' }
  const comp = compareOrders(normalizeOrder(sOrder), normalizeOrder(mOrder))
  assert.equal(comp.isMatch, false, 'TEST 9 FAILED: Differing paymentStatus must fail')
  const statusMismatch = comp.mismatches.find(m => m.field === 'paymentStatus')
  assert.ok(statusMismatch, 'Must report field: paymentStatus')
  console.log('✓ TEST 9 PASSED: Differing paymentStatus reported as real field mismatch')
}

// ── TEST 10: Different printStatus → Field Mismatch Reported ────────────────
{
  const sOrder = { ...baseSheetOrder, printStatus: 'waiting_for_shopkeeper' }
  const mOrder = { ...baseMongoOrder, printStatus: 'printed' }
  const comp = compareOrders(normalizeOrder(sOrder), normalizeOrder(mOrder))
  assert.equal(comp.isMatch, false, 'TEST 10 FAILED: Differing printStatus must fail')
  const printMismatch = comp.mismatches.find(m => m.field === 'printStatus')
  assert.ok(printMismatch, 'Must report field: printStatus')
  console.log('✓ TEST 10 PASSED: Differing printStatus reported as real field mismatch')
}

// ── TEST 11: Different selectedPages → Field Mismatch Reported ──────────────
{
  const sOrder = { ...baseSheetOrder, selectedPages: '[1, 2]' }
  const mOrder = { ...baseMongoOrder, selectedPages: [1, 2, 3] }
  const comp = compareOrders(normalizeOrder(sOrder), normalizeOrder(mOrder))
  assert.equal(comp.isMatch, false, 'TEST 11 FAILED: Differing selectedPages must fail')
  const pagesMismatch = comp.mismatches.find(m => m.field === 'selectedPages')
  assert.ok(pagesMismatch, 'Must report field: selectedPages')
  console.log('✓ TEST 11 PASSED: Differing selectedPages reported as real field mismatch')
}

// ── TEST 12: Duplicate orderId in Sheet → Detected & Reported ───────────────
{
  const duplicateSheetRows = [
    { ...baseSheetOrder, orderId: 'XB5649' },
    { ...baseSheetOrder, orderId: 'XB5649' }, // duplicate row in Sheet
  ]
  const audit = runParityAudit({
    sheetOrders: duplicateSheetRows,
    mongoOrders: [baseMongoOrder],
  })
  assert.equal(audit.duplicateSheetIdsCount, 1, 'TEST 12 FAILED: Duplicate Sheet ID must be detected')
  assert.ok(audit.duplicateSheetIds.includes('XB5649'))
  console.log('✓ TEST 12 PASSED: Duplicate orderId in Sheet detected and reported')
}

// ── TEST 13: Duplicate orderId in MongoDB → FAIL & Reported ─────────────────
{
  const duplicateMongoRows = [
    { ...baseMongoOrder, orderId: 'XB5649' },
    { ...baseMongoOrder, orderId: 'XB5649' }, // simulated duplicate in Mongo
  ]
  const audit = runParityAudit({
    sheetOrders: [baseSheetOrder],
    mongoOrders: duplicateMongoRows,
  })
  assert.equal(audit.duplicateMongoIdsCount, 1, 'TEST 13 FAILED: Duplicate Mongo ID must be detected')
  assert.equal(audit.status, 'FAIL', 'Duplicate Mongo ID must trigger audit FAIL')
  assert.ok(audit.duplicateMongoIds.includes('XB5649'))
  console.log('✓ TEST 13 PASSED: Duplicate orderId in MongoDB detected and flagged as FAIL')
}

console.log('--- ALL 13 PHASE 2 PARITY AUDIT TESTS PASSED SUCCESSFULLY! ---')
