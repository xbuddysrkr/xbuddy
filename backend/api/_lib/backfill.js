import { normalizeOrder, compareOrders } from './parityAudit.js'

/**
 * Priority for print status when selecting the canonical row among duplicates.
 */
const STATUS_PRIORITY = {
  printed: 3,
  printing: 2,
  waiting_for_shopkeeper: 1,
}

/**
 * Analyzes raw sheet rows, detects duplicates, evaluates differences,
 * and deterministically selects the canonical row for each unique orderId.
 */
export function analyzeSheetOrders(sheetOrders = []) {
  const groupedById = new Map()

  for (const row of sheetOrders) {
    const id = String(row.orderId || row.id || '').trim().toUpperCase()
    if (!id) continue
    if (!groupedById.has(id)) {
      groupedById.set(id, [])
    }
    groupedById.get(id).push(row)
  }

  const uniqueOrders = []
  const duplicateReconciliation = []

  for (const [orderId, rows] of groupedById.entries()) {
    if (rows.length === 1) {
      uniqueOrders.push({
        orderId,
        canonicalRow: rows[0],
        allRows: rows,
        isDuplicate: false,
      })
      continue
    }

    // Multiple rows found: analyze differences and determine canonical row
    const rowNumbers = rows.map(r => r.rowIndex || 'unknown')
    const createdAtValues = rows.map(r => r.createdAt || 'unknown')

    // Find any field differences across the duplicate rows
    const diffKeys = new Set()
    const firstRow = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const cur = rows[i]
      for (const key of Object.keys(firstRow)) {
        if (key === 'rowIndex' || key === 'createdAt') continue
        if (String(firstRow[key] ?? '') !== String(cur[key] ?? '')) {
          diffKeys.add(key)
        }
      }
    }

    // Selection criteria:
    // 1. Highest printStatus priority (e.g. 'Printed' > 'waiting_for_shopkeeper')
    // 2. Earliest createdAt timestamp
    // 3. Lowest rowIndex
    let bestRow = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const candidate = rows[i]
      const bestPrio = STATUS_PRIORITY[String(bestRow.printStatus || '').toLowerCase()] || 0
      const candPrio = STATUS_PRIORITY[String(candidate.printStatus || '').toLowerCase()] || 0

      if (candPrio > bestPrio) {
        bestRow = candidate
      } else if (candPrio === bestPrio) {
        const bestTime = new Date(bestRow.createdAt || 0).getTime()
        const candTime = new Date(candidate.createdAt || 0).getTime()
        if (candTime > 0 && candTime < bestTime) {
          bestRow = candidate
        }
      }
    }

    const diffSummary = diffKeys.size === 0
      ? 'Identical payloads (rapid network re-submission)'
      : `Differences in: ${Array.from(diffKeys).join(', ')}`

    duplicateReconciliation.push({
      orderId,
      count: rows.length,
      rowNumbers,
      createdAtValues,
      differences: diffSummary,
      recommendedCanonicalRowIndex: bestRow.rowIndex,
      recommendedCanonicalRow: bestRow,
    })

    uniqueOrders.push({
      orderId,
      canonicalRow: bestRow,
      allRows: rows,
      isDuplicate: true,
      duplicateCount: rows.length,
    })
  }

  return {
    sheetRowCount: sheetOrders.length,
    uniqueOrderCount: uniqueOrders.length,
    duplicateCount: duplicateReconciliation.length,
    duplicateReconciliation,
    uniqueOrders,
  }
}

/**
 * Plans the backfill by comparing canonical sheet orders against existing MongoDB documents.
 * Produces deterministic categories:
 * - toInsert (missing in MongoDB)
 * - alreadySynced (exists and matches 100%)
 * - conflicts (exists in MongoDB but payload differs)
 * - skippedDuplicates (extra duplicate rows from Sheet)
 */
export function planBackfill({ sheetOrders = [], mongoOrders = [] }) {
  const sheetAnalysis = analyzeSheetOrders(sheetOrders)

  const mongoMap = new Map()
  for (const doc of mongoOrders) {
    const id = String(doc.orderId || '').trim().toUpperCase()
    if (id) {
      mongoMap.set(id, doc)
    }
  }

  const toInsert = []
  const alreadySynced = []
  const conflicts = []
  const skippedDuplicateCount = sheetOrders.length - sheetAnalysis.uniqueOrders.length

  for (const item of sheetAnalysis.uniqueOrders) {
    const { orderId, canonicalRow } = item
    const normalizedSheetDoc = normalizeOrder(canonicalRow, 'sheet')

    const existingMongo = mongoMap.get(orderId)

    if (!existingMongo) {
      // Missing in MongoDB -> Ready for insertion
      const mongoInsertDoc = {
        orderId:              normalizedSheetDoc.orderId,
        name:                 normalizedSheetDoc.name,
        fileName:             normalizedSheetDoc.fileName,
        totalPages:           normalizedSheetDoc.totalPages,
        copies:               normalizedSheetDoc.copies,
        colorMode:            normalizedSheetDoc.colorMode,
        printType:            normalizedSheetDoc.printType,
        printSide:            normalizedSheetDoc.printSide,
        duplex:               normalizedSheetDoc.duplex,
        pageSize:             normalizedSheetDoc.pageSize,
        paperSize:            normalizedSheetDoc.paperSize,
        orientation:          normalizedSheetDoc.orientation,
        amount:               normalizedSheetDoc.amount,
        printingCost:         normalizedSheetDoc.printingCost,
        serviceFee:           normalizedSheetDoc.serviceFee,
        digitalProcessingFee: normalizedSheetDoc.digitalProcessingFee,
        transactionId:        normalizedSheetDoc.transactionId,
        pageRange:            normalizedSheetDoc.pageRange,
        pageRangeMode:        normalizedSheetDoc.pageRangeMode,
        customPages:          normalizedSheetDoc.customPages,
        printableCount:       normalizedSheetDoc.printableCount,
        selectedPages:        normalizedSheetDoc.selectedPages,
        selectedPageCount:    normalizedSheetDoc.selectedPageCount,
        driveUrl:             normalizedSheetDoc.driveUrl,
        paymentStatus:        normalizedSheetDoc.paymentStatus,
        printStatus:          normalizedSheetDoc.printStatus,
        createdAt:            normalizedSheetDoc.createdAt,
        updatedAt:            normalizedSheetDoc.updatedAt || normalizedSheetDoc.createdAt,
        syncStatus:           'synced',
        mongoSaved:           true,
        sheetsSaved:          true,
        isHistoricalBackfill: true,
      }

      toInsert.push({
        orderId,
        sourceRow: canonicalRow.rowIndex,
        document: mongoInsertDoc,
      })
    } else {
      // Exists in MongoDB -> Check equality
      const normalizedMongoDoc = normalizeOrder(existingMongo, 'mongo')
      const comparison = compareOrders(normalizedSheetDoc, normalizedMongoDoc)

      if (comparison.isMatch) {
        alreadySynced.push({
          orderId,
          sourceRow: canonicalRow.rowIndex,
        })
      } else {
        conflicts.push({
          orderId,
          sourceRow: canonicalRow.rowIndex,
          mismatches: comparison.mismatches,
        })
      }
    }
  }

  return {
    sheetRowCount: sheetOrders.length,
    uniqueOrderCount: sheetAnalysis.uniqueOrders.length,
    historicalOrdersToInsertCount: toInsert.length,
    alreadyInMongoCount: alreadySynced.length,
    conflictCount: conflicts.length,
    duplicateSheetIdCount: sheetAnalysis.duplicateCount,
    skippedDuplicateRowCount: skippedDuplicateCount,
    toInsert,
    alreadySynced,
    conflicts,
    duplicateReconciliation: sheetAnalysis.duplicateReconciliation,
  }
}

/**
 * Executes backfill into MongoDB collection.
 * GUARANTEES:
 * - Inserts only missing unique orders
 * - Never overwrites existing MongoDB documents
 * - Never deletes or modifies Google Sheet rows
 */
export async function executeBackfill({ ordersCollection, plan }) {
  const insertResults = []
  const skippedResults = []
  const conflictResults = []

  // Ensure unique index
  await ordersCollection.createIndex({ orderId: 1 }, { unique: true })

  for (const item of plan.toInsert) {
    try {
      // Verify order does not exist before inserting
      const existing = await ordersCollection.findOne({ orderId: item.orderId })
      if (existing) {
        skippedResults.push({
          orderId: item.orderId,
          reason: 'Already exists in database (skipped to prevent overwrite)',
        })
        continue
      }

      await ordersCollection.insertOne(item.document)
      insertResults.push({
        orderId: item.orderId,
        sourceRow: item.sourceRow,
        status: 'INSERTED',
      })
    } catch (insertErr) {
      if (insertErr.code === 11000) {
        skippedResults.push({
          orderId: item.orderId,
          reason: 'Duplicate key error (already inserted)',
        })
      } else {
        conflictResults.push({
          orderId: item.orderId,
          error: insertErr.message,
        })
      }
    }
  }

  return {
    insertedCount: insertResults.length,
    skippedCount: skippedResults.length,
    errorCount: conflictResults.length,
    inserted: insertResults,
    skipped: skippedResults,
    errors: conflictResults,
  }
}

/**
 * Formats a clear reconciliation and backfill report.
 */
export function formatBackfillReport(plan, executionResult = null) {
  const lines = []
  lines.push('============================================================')
  lines.push('     XBUDDY HISTORICAL ORDERS BACKFILL REPORT (PHASE 2.5)   ')
  lines.push('============================================================')
  lines.push(`Mode: ${executionResult ? 'EXECUTE (DATABASE UPDATED)' : 'DRY-RUN (READ-ONLY)'}`)
  lines.push('')
  lines.push(`Total Sheet rows:              ${plan.sheetRowCount}`)
  lines.push(`Unique Sheet order IDs:        ${plan.uniqueOrderCount}`)
  lines.push(`Historical orders to insert:   ${plan.historicalOrdersToInsertCount}`)
  lines.push(`Already in MongoDB:            ${plan.alreadyInMongoCount}`)
  lines.push(`Conflicts detected:            ${plan.conflictCount}`)
  lines.push(`Duplicate Sheet IDs:           ${plan.duplicateSheetIdCount}`)
  lines.push(`Skipped duplicate Sheet rows:  ${plan.skippedDuplicateRowCount}`)
  lines.push('')

  if (plan.duplicateReconciliation.length > 0) {
    lines.push('------------------------------------------------------------')
    lines.push(`DUPLICATE ROW RECONCILIATION DETAILS (${plan.duplicateReconciliation.length} IDs):`)
    lines.push('------------------------------------------------------------')
    for (const d of plan.duplicateReconciliation) {
      lines.push(`Order ID: ${d.orderId} (found in ${d.count} rows: ${d.rowNumbers.join(', ')})`)
      lines.push(`  - CreatedAt values: ${d.createdAtValues.join(' | ')}`)
      lines.push(`  - Analysis:         ${d.differences}`)
      lines.push(`  - Recommended row:  Row ${d.recommendedCanonicalRowIndex}`)
    }
    lines.push('')
  }

  if (plan.conflicts.length > 0) {
    lines.push('------------------------------------------------------------')
    lines.push(`CONFLICTS (EXISTING IN MONGO WITH DIFFERENT PAYLOAD):`)
    lines.push('------------------------------------------------------------')
    for (const c of plan.conflicts) {
      lines.push(`Order ID: ${c.orderId} (Row ${c.sourceRow})`)
      for (const m of c.mismatches) {
        lines.push(`  - Field: ${m.field} | Sheet: ${JSON.stringify(m.googleSheetValue)} | Mongo: ${JSON.stringify(m.mongoValue)}`)
      }
    }
    lines.push('')
  }

  if (executionResult) {
    lines.push('------------------------------------------------------------')
    lines.push('EXECUTION SUMMARY:')
    lines.push('------------------------------------------------------------')
    lines.push(`Successfully Inserted:  ${executionResult.insertedCount}`)
    lines.push(`Skipped / Preserved:    ${executionResult.skippedCount}`)
    lines.push(`Errors:                 ${executionResult.errorCount}`)
    lines.push('')
  }

  lines.push('============================================================')
  return lines.join('\n')
}
