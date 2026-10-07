import assert from 'node:assert/strict'
import {
  analyzeSheetOrders,
  planBackfill,
  executeBackfill,
  formatBackfillReport,
} from '../api/_lib/backfill.js'

console.log('--- STARTING XBUDDY PHASE 2.5 HISTORICAL ORDERS BACKFILL TEST SUITE ---')

// ── TEST 1: Duplicate Detection & Reconciliation Report Generation ──────────
const mockSheetRows = [
  {
    rowIndex: 14,
    orderId: 'XB4366',
    name: 'Alice',
    fileName: 'doc1.pdf',
    copies: 1,
    amount: 3,
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T08:46:15.004Z',
  },
  {
    rowIndex: 15,
    orderId: 'XB4366', // duplicate row
    name: 'Alice',
    fileName: 'doc1.pdf',
    copies: 1,
    amount: 3,
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T08:46:27.499Z',
  },
  {
    rowIndex: 33,
    orderId: 'XB9767',
    name: 'Bob',
    fileName: 'doc2.pdf',
    copies: 1,
    amount: 3,
    printStatus: 'Printed', // Printed status
    createdAt: '2026-10-06T11:40:22.446Z',
  },
  {
    rowIndex: 34,
    orderId: 'XB9767', // duplicate row
    name: 'Bob',
    fileName: 'doc2.pdf',
    copies: 1,
    amount: 3,
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T11:40:25.225Z',
  },
  {
    rowIndex: 49,
    orderId: 'XB5649',
    name: 'Charlie',
    fileName: 'doc3.pdf',
    copies: 1,
    amount: 3,
    pageRange: 'all',
    selectedPages: '[1]',
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T12:37:44.373Z',
  },
]

const analysis = analyzeSheetOrders(mockSheetRows)
assert.equal(analysis.sheetRowCount, 5, 'Must report 5 total sheet rows')
assert.equal(analysis.uniqueOrderCount, 3, 'Must report 3 unique order IDs')
assert.equal(analysis.duplicateCount, 2, 'Must report 2 duplicate IDs (XB4366 and XB9767)')

// Check reconciliation details
const xb9767Rec = analysis.duplicateReconciliation.find(r => r.orderId === 'XB9767')
assert.ok(xb9767Rec, 'Must include reconciliation for XB9767')
assert.equal(xb9767Rec.recommendedCanonicalRowIndex, 33, 'Must recommend Row 33 with Printed status')
assert.ok(xb9767Rec.differences.includes('printStatus'), 'Must detect difference in printStatus')

const xb4366Rec = analysis.duplicateReconciliation.find(r => r.orderId === 'XB4366')
assert.equal(xb4366Rec.recommendedCanonicalRowIndex, 14, 'Must recommend earlier Row 14 for identical rows')
console.log('✓ TEST 1 PASSED: Duplicate detection and deterministic reconciliation report verified')

// ── TEST 2: Canonical Row Selection Priority ────────────────────────────────
{
  const xb9767Order = analysis.uniqueOrders.find(u => u.orderId === 'XB9767')
  assert.equal(xb9767Order.canonicalRow.rowIndex, 33)
  assert.equal(xb9767Order.canonicalRow.printStatus, 'Printed')
  console.log('✓ TEST 2 PASSED: Canonical row selection properly prioritizes finalized print status')
}

// ── TEST 3: Plan Backfill (Missing Orders, Synced Orders, Conflicts) ─────────
const mockExistingMongo = [
  {
    orderId: 'XB5649', // Identical matching order
    name: 'Charlie',
    fileName: 'doc3.pdf',
    copies: 1,
    amount: 3,
    pageRange: 'all',
    selectedPages: [1],
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T12:37:44.373Z',
    updatedAt: '2026-10-06T12:37:44.373Z',
  },
]

const plan = planBackfill({
  sheetOrders: mockSheetRows,
  mongoOrders: mockExistingMongo,
})

assert.equal(plan.sheetRowCount, 5)
assert.equal(plan.uniqueOrderCount, 3)
assert.equal(plan.historicalOrdersToInsertCount, 2, 'Must plan insertion for XB4366 and XB9767')
assert.equal(plan.alreadyInMongoCount, 1, 'Must recognize XB5649 as already synchronized')
assert.equal(plan.conflictCount, 0, 'No conflicts in clean matching order')
assert.equal(plan.duplicateSheetIdCount, 2)
assert.equal(plan.skippedDuplicateRowCount, 2, '2 duplicate rows skipped')

assert.ok(plan.toInsert.find(i => i.orderId === 'XB4366'))
assert.ok(plan.toInsert.find(i => i.orderId === 'XB9767'))
assert.ok(plan.alreadySynced.find(s => s.orderId === 'XB5649'))
console.log('✓ TEST 3 PASSED: Backfill planning correctly separates missing orders and already synced orders')

// ── TEST 4: Conflict Detection (Never Overwrite Conflicting Mongo Docs) ─────
const mockConflictingMongo = [
  {
    orderId: 'XB5649',
    name: 'Different Student',
    amount: 999, // Conflicting amount
    copies: 5,
    fileName: 'unrelated.pdf',
    printStatus: 'waiting_for_shopkeeper',
    createdAt: '2026-10-06T12:37:44.373Z',
  },
]

const conflictPlan = planBackfill({
  sheetOrders: mockSheetRows,
  mongoOrders: mockConflictingMongo,
})

assert.equal(conflictPlan.conflictCount, 1, 'Must detect 1 conflict on XB5649')
assert.equal(conflictPlan.alreadyInMongoCount, 0)
const conflictItem = conflictPlan.conflicts.find(c => c.orderId === 'XB5649')
assert.ok(conflictItem, 'XB5649 must be in conflicts list')
assert.ok(conflictItem.mismatches.some(m => m.field === 'amount'), 'Amount mismatch must be reported')
console.log('✓ TEST 4 PASSED: Conflicting existing documents flagged and protected from overwrite')

// ── TEST 5: Execution Simulation with In-Memory Mock Collection ────────────
class MockMongoCollection {
  constructor() {
    this.docs = new Map()
  }
  async createIndex() {}
  async findOne(query) {
    return this.docs.get(query.orderId) || null
  }
  async insertOne(doc) {
    if (this.docs.has(doc.orderId)) {
      const err = new Error('E11000 duplicate key error')
      err.code = 11000
      throw err
    }
    this.docs.set(doc.orderId, { ...doc })
    return { acknowledged: true }
  }
}

const mockDb = new MockMongoCollection()
// Seed with existing XB5649
mockDb.docs.set('XB5649', { orderId: 'XB5649', amount: 3 })

const execResult = await executeBackfill({
  ordersCollection: mockDb,
  plan,
})

assert.equal(execResult.insertedCount, 2, 'Must insert 2 missing orders (XB4366, XB9767)')
assert.equal(mockDb.docs.size, 3, 'Collection must now have exactly 3 unique orders')
assert.ok(mockDb.docs.has('XB4366'))
assert.ok(mockDb.docs.has('XB9767'))
assert.ok(mockDb.docs.has('XB5649'))

// Re-running execution on already inserted collection must skip and never duplicate
const secondExec = await executeBackfill({
  ordersCollection: mockDb,
  plan,
})
assert.equal(secondExec.insertedCount, 0, 'Second run must insert 0 orders')
assert.equal(secondExec.skippedCount, 2, 'Both must be skipped safely')
assert.equal(mockDb.docs.size, 3, 'Zero duplicate documents created')
console.log('✓ TEST 5 PASSED: Execution inserts missing unique orders and safely skips existing')

// ── TEST 6: Report Formatting Output Integrity ─────────────────────────────
const reportStr = formatBackfillReport(plan, execResult)
assert.ok(reportStr.includes('Total Sheet rows:              5'))
assert.ok(reportStr.includes('Unique Sheet order IDs:        3'))
assert.ok(reportStr.includes('Historical orders to insert:   2'))
assert.ok(reportStr.includes('Successfully Inserted:  2'))
console.log('✓ TEST 6 PASSED: Backfill report formatting generated accurately')

console.log('--- ALL 6 PHASE 2.5 HISTORICAL BACKFILL TESTS PASSED SUCCESSFULLY! ---')
