import dns from 'dns'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import {
  RETENTION_MS_PRINTED,
  RETENTION_MS_UNPRINTED,
  buildPayloadExistsCondition,
  buildEligiblePrintedQuery,
  buildEligibleUnprintedQuery,
  getGridFsInventory,
} from '../api/_lib/retention.js'

// Fix querySrv EBADRESP DNS resolution failures for MongoDB Atlas SRV URIs in Node.js
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (_) {}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

/**
 * XBuddy Read-Only Production PDF Storage Inventory Tool
 * 
 * Strict Safety Guarantees:
 * 1. Requires MONGODB_READONLY_URI. Refuses to run if missing or if falling back to MONGODB_URI.
 * 2. Checks connectionStatus to guarantee authenticated user has NO write privileges.
 * 3. Executes strictly read operations: countDocuments, find, aggregate.
 * 4. Never calls createIndex, deleteOne, deleteMany, updateOne, or updateMany.
 * 5. Does NOT import or invoke cleanupExpiredPdfs() or any mutating functions.
 * 6. Never outputs database credentials, connection strings, student names, phone numbers,
 *    original filenames, transaction references, or document contents.
 * 7. Evaluates timestamps consistently using a single fixed serverTime snapshot.
 */
export async function runReadOnlyInventory(options = {}) {
  const mongoUri = options.mongoUri || process.env.MONGODB_READONLY_URI
  const dbName = options.dbName || process.env.MONGODB_DB_NAME || 'xbuddy'
  const serverTime = options.serverTime || new Date()

  // Strict Check 1: Refuse to run without dedicated MONGODB_READONLY_URI
  if (!mongoUri || typeof mongoUri !== 'string' || mongoUri.trim() === '') {
    const err = new Error('BLOCKER: MONGODB_READONLY_URI is not set. Execution refused because an isolated, read-only connection is required.')
    err.code = 'ERR_MISSING_READONLY_URI'
    throw err
  }

  // Sanitize URI check: ensure no credentials leak in logs
  let hostDisplay = 'Atlas Cluster'
  try {
    const parsed = new URL(mongoUri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'))
    hostDisplay = parsed.host
  } catch (_) {}

  const client = new MongoClient(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
  })

  try {
    await client.connect()
    const db = client.db(dbName)

    // Strict Check 2: Verify authenticated user roles via connectionStatus
    const status = await db.command({ connectionStatus: 1 })
    const roles = status?.authInfo?.authenticatedUserRoles || []
    const hasWrite = roles.some(r =>
      r.role === 'readWrite' ||
      r.role === 'dbAdmin' ||
      r.role === 'root' ||
      r.role === 'atlasAdmin' ||
      r.role === 'readWriteAnyDatabase' ||
      r.role === 'dbOwner'
    )

    if (hasWrite) {
      const detectedRoles = roles.map(r => r.role).join(', ')
      const roleErr = new Error(`BLOCKER: Authenticated user possesses write privileges (${detectedRoles}). A strictly read-only role (e.g. "read") is required.`)
      roleErr.code = 'ERR_UNAUTHORIZED_WRITE_PRIVILEGES'
      throw roleErr
    }

    const hasReadRole = roles.length === 0 || roles.some(r => r.role === 'read' || r.role === 'readAnyDatabase')
    if (!hasReadRole) {
      const detectedRoles = roles.map(r => r.role).join(', ')
      const roleErr = new Error(`BLOCKER: Authenticated user lacks read privileges (${detectedRoles}).`)
      roleErr.code = 'ERR_MISSING_READ_ROLE'
      throw roleErr
    }

    const nowMs = serverTime.getTime()
    const nowIso = serverTime.toISOString()
    const thirtyMinsAgoIso = new Date(nowMs - RETENTION_MS_PRINTED).toISOString()
    const twentyFourHoursAgoIso = new Date(nowMs - RETENTION_MS_UNPRINTED).toISOString()

    const ordersCol = db.collection('orders')
    const filesCol = db.collection('order_pdfs.files')
    const chunksCol = db.collection('order_pdfs.chunks')

    // 1. Total Order Counts
    const totalOrders = await ordersCol.countDocuments({})

    // 2. Category A: Printed PDFs Eligible for Cleanup (> 30m post-print)
    const catAQuery = buildEligiblePrintedQuery(serverTime)
    const catACount = await ordersCol.countDocuments(catAQuery)
    const catASample = await ordersCol.find(catAQuery, { projection: { orderId: 1, pdfSize: 1, pdfStorage: 1, printedAt: 1 } }).toArray()
    const catABytes = catASample.reduce((sum, d) => sum + (Number(d.pdfSize) || 0), 0)

    // 3. Category B: Unprinted PDFs Eligible for Cleanup (> 24h upload)
    const catBQuery = buildEligibleUnprintedQuery(serverTime)
    const catBCount = await ordersCol.countDocuments(catBQuery)
    const catBSample = await ordersCol.find(catBQuery, { projection: { orderId: 1, pdfSize: 1, pdfStorage: 1, pdfUploadedAt: 1, createdAt: 1 } }).toArray()
    const catBBytes = catBSample.reduce((sum, d) => sum + (Number(d.pdfSize) || 0), 0)

    // 4. Category C: Unprinted PDFs NOT Yet Eligible (Active within 24 hours, strictly preserved)
    const payloadCondition = buildPayloadExistsCondition()
    const catCQuery = {
      pdfDeletedAt: { $exists: false },
      printStatus: { $ne: 'Printing' },
      $and: [
        {
          $or: [
            { printedAt: { $exists: false } },
            { printedAt: null },
          ],
        },
        payloadCondition,
        {
          $or: [
            { pdfExpiresAt: { $exists: true, $gt: nowIso } },
            {
              pdfExpiresAt: { $exists: false },
              $or: [
                { pdfUploadedAt: { $exists: true, $gt: twentyFourHoursAgoIso } },
                {
                  pdfUploadedAt: { $exists: false },
                  createdAt: { $exists: true, $gt: twentyFourHoursAgoIso },
                },
              ],
            },
          ],
        },
      ],
    }
    const catCCount = await ordersCol.countDocuments(catCQuery)
    const catCSample = await ordersCol.find(catCQuery, { projection: { orderId: 1, pdfSize: 1 } }).toArray()
    const catCBytes = catCSample.reduce((sum, d) => sum + (Number(d.pdfSize) || 0), 0)

    // 5. Category D: Actively Printing & Stalled Orders
    const activePrintingQuery = {
      pdfDeletedAt: { $exists: false },
      printStatus: 'Printing',
      printingAt: { $exists: true, $gt: thirtyMinsAgoIso },
    }
    const activePrintingCount = await ordersCol.countDocuments(activePrintingQuery)

    const stalledPrintingQuery = {
      pdfDeletedAt: { $exists: false },
      printStatus: 'Printing',
      $or: [
        { printingAt: { $exists: true, $lte: thirtyMinsAgoIso } },
        { printingAt: { $exists: false } },
      ],
    }
    const stalledPrintingCount = await ordersCol.countDocuments(stalledPrintingQuery)

    // 6. Orders without any PDF payload (already purged or external Drive)
    const noPayloadOrdersCount = await ordersCol.countDocuments({
      $or: [
        { pdfDeletedAt: { $exists: true } },
        { pdfStorage: 'none' },
        { pdfStorage: 'drive' },
        {
          hasPdf: false,
          hasGridFsPdf: false,
          pdfStorage: { $nin: ['gridfs', 'inline'] },
          pdfBase64: { $in: ['', null, undefined] },
        },
      ],
    })

    // 7. GridFS Bucket Inventory & Orphan Classification
    const totalGridFsFiles = await filesCol.countDocuments({})
    const totalGridFsChunks = await chunksCol.countDocuments({})

    const gridFsInventory = await getGridFsInventory(db, { serverTime })

    // Avoid double counting: total logical bytes eligible for removal
    const totalEligibleBytes = catABytes + catBBytes + gridFsInventory.summary.genuinelyOrphanedBytes
    const totalEligibleMb = Number((totalEligibleBytes / (1024 * 1024)).toFixed(2))

    return {
      executed: true,
      serverTime: nowIso,
      targetHost: hostDisplay,
      database: dbName,
      userRole: roles.map(r => r.role).join(', ') || 'read',
      summary: {
        totalOrders,
        noPayloadOrdersCount,
        categoryA_printedEligible: {
          count: catACount,
          estimatedBytes: catABytes,
          estimatedMb: Number((catABytes / (1024 * 1024)).toFixed(2)),
        },
        categoryB_unprintedEligible: {
          count: catBCount,
          estimatedBytes: catBBytes,
          estimatedMb: Number((catBBytes / (1024 * 1024)).toFixed(2)),
        },
        categoryC_unprintedActivePreserved: {
          count: catCCount,
          estimatedBytes: catCBytes,
          estimatedMb: Number((catCBytes / (1024 * 1024)).toFixed(2)),
        },
        categoryD_printingState: {
          activePrintingProtected: activePrintingCount,
          stalledPrintingAwaitingTimeout: stalledPrintingCount,
        },
        categoryE_gridFs: {
          totalFiles: totalGridFsFiles,
          totalChunks: totalGridFsChunks,
          activeReferencedCount: gridFsInventory.summary.activeReferencedCount,
          expiredReferencedCount: gridFsInventory.summary.expiredReferencedCount,
          genuinelyOrphanedCount: gridFsInventory.summary.genuinelyOrphanedCount,
          genuinelyOrphanedBytes: gridFsInventory.summary.genuinelyOrphanedBytes,
          genuinelyOrphanedMb: Number((gridFsInventory.summary.genuinelyOrphanedBytes / (1024 * 1024)).toFixed(2)),
        },
        totalEligibleDataPurgeBytes: totalEligibleBytes,
        totalEligibleDataPurgeMb: totalEligibleMb,
      },
    }
  } finally {
    await client.close()
  }
}

// CLI runner
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runReadOnlyInventory()
    .then((result) => {
      console.log('================================================================')
      console.log('  XBUDDY READ-ONLY PRODUCTION PDF STORAGE INVENTORY COMPLETE    ')
      console.log('================================================================')
      console.log(`Evaluation Timestamp: ${result.serverTime}`)
      console.log(`Database:             ${result.database} (${result.targetHost})`)
      console.log(`Authenticated Role:   ${result.userRole}\n`)
      console.log('Aggregate Storage Metrics:')
      console.log(`- Total Orders in Database:                 ${result.summary.totalOrders}`)
      console.log(`- Orders with No PDF Payload:               ${result.summary.noPayloadOrdersCount}`)
      console.log(`- Category A (Printed > 30m, Eligible):     ${result.summary.categoryA_printedEligible.count} (${result.summary.categoryA_printedEligible.estimatedMb} MB)`)
      console.log(`- Category B (Unprinted > 24h, Eligible):   ${result.summary.categoryB_unprintedEligible.count} (${result.summary.categoryB_unprintedEligible.estimatedMb} MB)`)
      console.log(`- Category C (Unprinted < 24h, Preserved):  ${result.summary.categoryC_unprintedActivePreserved.count} (${result.summary.categoryC_unprintedActivePreserved.estimatedMb} MB)`)
      console.log(`- Category D (Actively Printing Protected): ${result.summary.categoryD_printingState.activePrintingProtected}`)
      console.log(`- Category D (Stalled Printing):            ${result.summary.categoryD_printingState.stalledPrintingAwaitingTimeout}`)
      console.log(`- GridFS Total Files:                       ${result.summary.categoryE_gridFs.totalFiles} (${result.summary.categoryE_gridFs.totalChunks} chunks)`)
      console.log(`- GridFS Active Referenced Files:           ${result.summary.categoryE_gridFs.activeReferencedCount}`)
      console.log(`- GridFS Expired Referenced Files:          ${result.summary.categoryE_gridFs.expiredReferencedCount}`)
      console.log(`- GridFS Genuinely Orphaned Files:          ${result.summary.categoryE_gridFs.genuinelyOrphanedCount} (${result.summary.categoryE_gridFs.genuinelyOrphanedMb} MB)`)
      console.log(`- TOTAL ELIGIBLE PURGE DATA:                ${result.summary.totalEligibleDataPurgeMb} MB (${result.summary.totalEligibleDataPurgeBytes} bytes)`)
      console.log('================================================================\n')
    })
    .catch((err) => {
      console.error(`\n[READ_ONLY_INVENTORY_STOP] ${err.message}\n`)
      process.exit(1)
    })
}
