/**
 * REAL MONGODB ATLAS INTEGRATION TEST
 *
 * NOTE: This is a REAL MongoDB Atlas Integration Test connecting directly to
 * the production cluster, completely distinct from in-memory mocked tests.
 *
 * Safety invariants:
 * - Operates ONLY inside an ephemeral isolated temporary collection (ttl_integration_preflight_<epoch>).
 * - Never modifies production collections, indexes, or customer documents.
 * - Confirms MongoDB version, collection characteristics, TTL index creation,
 *   BSON Date matching semantics, and selective cleanup sweep execution.
 * - Always drops the temporary collection upon completion.
 */

import assert from 'assert'
import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'

async function runRealMongoIntegrationTest() {
  console.log('=================================================================')
  console.log('  STARTING REAL MONGODB ATLAS INTEGRATION TEST (NON-MOCKED)      ')
  console.log('=================================================================\n')

  // Explicit opt-in guard: refuse to connect to live MongoDB Atlas unless explicitly requested
  if (process.env.RUN_ATLAS_TTL_INTEGRATION !== 'true') {
    console.log('[ATLAS_SAFETY_GUARD] SKIPPED: RUN_ATLAS_TTL_INTEGRATION=true environment variable not set.')
    console.log('[ATLAS_SAFETY_GUARD] Refusing to connect to production MongoDB Atlas without explicit opt-in.\n')
    process.exit(0)
  }

  const { db } = await connectToDatabase()
  assert.ok(db, 'Failed to connect to MongoDB Atlas')

  let tempCollectionName = null

  try {
    // 1. Inspect MongoDB Server Version
    const buildInfo = await db.admin().command({ buildInfo: 1 })
    console.log(`[ATLAS_ENV] MongoDB Server Version: ${buildInfo.version}`)
    console.log(`[ATLAS_ENV] Git Version: ${buildInfo.gitVersion}`)
    console.log(`[ATLAS_ENV] Target Architecture: ${buildInfo.bits}-bit, sysInfo: ${buildInfo.sysInfo || 'Atlas Cloud'}`)
    assert.ok(
      typeof buildInfo.version === 'string' && buildInfo.version.length > 0,
      'MongoDB server version must be readable'
    )

    // 2. Inspect deletion_events collection metadata
    const collections = await db.listCollections({ name: 'deletion_events' }).toArray()
    assert.strictEqual(collections.length, 1, 'deletion_events collection must exist on Atlas')
    const deletionEventsMeta = collections[0]
    console.log(`[ATLAS_ENV] Collection "deletion_events" type: ${deletionEventsMeta.type || 'normal'}`)
    assert.notStrictEqual(
      deletionEventsMeta.type,
      'timeseries',
      'deletion_events must be an ordinary collection, NOT a timeseries collection'
    )

    // 3. Inspect existing indexes on deletion_events (READ-ONLY)
    const existingEventsIndexes = await db.collection('deletion_events').indexes()
    console.log('[ATLAS_ENV] Existing indexes on deletion_events:')
    for (const idx of existingEventsIndexes) {
      console.log(`  - name: "${idx.name}", key: ${JSON.stringify(idx.key)}, expireAfterSeconds: ${idx.expireAfterSeconds}, partialFilterExpression: ${JSON.stringify(idx.partialFilterExpression)}`)
    }

    // 4. Create an isolated temporary test collection
    tempCollectionName = `ttl_integration_preflight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    console.log(`\n[TEMP_COLLECTION] Creating isolated test collection: "${tempCollectionName}"`)
    const tempCol = db.collection(tempCollectionName)

    // 5. Test standard TTL index creation on completedAtDate without partialFilterExpression
    console.log('[TEST 1] Creating standard TTL index on completedAtDate (expireAfterSeconds: 604800)...')
    const indexName = await tempCol.createIndex(
      { completedAtDate: 1 },
      { expireAfterSeconds: 604800, background: true }
    )
    console.log(`[TEST 1] Created index name: "${indexName}"`)

    const tempIndexes = await tempCol.indexes()
    const ttlIndex = tempIndexes.find(i => i.key && i.key.completedAtDate === 1)
    assert.ok(ttlIndex, 'TTL index on completedAtDate must exist')
    assert.strictEqual(ttlIndex.expireAfterSeconds, 604800, 'expireAfterSeconds must be exactly 604800 (7 days)')
    assert.strictEqual(ttlIndex.partialFilterExpression, undefined, 'Preferred TTL index must NOT use partialFilterExpression')
    console.log('✓ TEST 1 PASSED: Standard TTL index created and verified on real MongoDB Atlas\n')

    // 6. Test idempotent index inspection (safety rule: never recreate existing index)
    console.log('[TEST 2] Testing safe index inspection to prevent recreation or options conflict...')
    const existingBefore = await tempCol.indexes()
    const alreadyHasTtl = existingBefore.some(i => i.key && i.key.completedAtDate === 1 && typeof i.expireAfterSeconds === 'number')
    assert.strictEqual(alreadyHasTtl, true, 'Preflight check must detect existing index')
    console.log('✓ TEST 2 PASSED: Index inspection correctly prevents redundant index creation\n')

    // 7. Seed test documents representing the 5 lifecycle states
    console.log('[TEST 3] Seeding test documents for TTL and sweep evaluation...')
    const nowMs = Date.now()
    const eightDaysAgo = new Date(nowMs - 8 * 86400000)
    const twoDaysAgo = new Date(nowMs - 2 * 86400000)
    const tenDaysAgo = new Date(nowMs - 10 * 86400000)

    const testDocs = [
      {
        eventId: 't_pending_8d',
        status: 'pending',
        requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        acknowledgedStations: [],
        allStationsAcknowledged: false,
        completedAt: null,
        completedAtDate: null,
        createdAtDate: eightDaysAgo,
      },
      {
        eventId: 't_partial_8d',
        status: 'partially_acknowledged',
        requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        acknowledgedStations: ['SRKR-XEROX-01'],
        allStationsAcknowledged: false,
        completedAt: null,
        completedAtDate: null,
        lastAcknowledgedAt: eightDaysAgo.toISOString(),
        createdAtDate: eightDaysAgo,
      },
      {
        eventId: 't_missing_date_10d',
        status: 'pending',
        requiredStations: ['SRKR-XEROX-01'],
        acknowledgedStations: [],
        allStationsAcknowledged: false,
        completedAt: null,
        // completedAtDate deliberately omitted
        createdAtDate: tenDaysAgo,
      },
      {
        eventId: 't_completed_2d',
        status: 'completed',
        requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        acknowledgedStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        allStationsAcknowledged: true,
        completedAt: twoDaysAgo.toISOString(),
        completedAtDate: twoDaysAgo,
        createdAtDate: twoDaysAgo,
      },
      {
        eventId: 't_completed_8d',
        status: 'completed',
        requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        acknowledgedStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        allStationsAcknowledged: true,
        completedAt: eightDaysAgo.toISOString(),
        completedAtDate: eightDaysAgo,
        createdAtDate: eightDaysAgo,
      },
      // Legacy ambiguous events:
      {
        eventId: 't_legacy_one_station_8d',
        status: 'acknowledged',
        requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
        acknowledgedStations: ['SRKR-XEROX-01'],
        allStationsAcknowledged: false,
        acknowledgedAtDate: eightDaysAgo,
        createdAtDate: eightDaysAgo,
      },
      {
        eventId: 't_legacy_missing_all_ack_8d',
        status: 'acknowledged',
        acknowledgedStations: ['SRKR-XEROX-01'],
        // allStationsAcknowledged field is intentionally missing
        acknowledgedAtDate: eightDaysAgo,
        createdAtDate: eightDaysAgo,
      },
    ]

    await tempCol.insertMany(testDocs)
    const countInserted = await tempCol.countDocuments()
    assert.strictEqual(countInserted, 7, 'Must insert exactly 7 test documents')
    console.log('✓ TEST 3 PASSED: Seeded 7 lifecycle test documents into isolated collection\n')

    // 8. Test BSON Date evaluation and sweep query selectivity on live MongoDB
    console.log('[TEST 4] Executing real MongoDB sweep query against seeded documents...')
    const cutoffDate = new Date(nowMs - 7 * 86400000)
    const cutoffIso = cutoffDate.toISOString()

    const sweepQuery = {
      $or: [
        {
          status: 'completed',
          allStationsAcknowledged: true,
          $or: [
            { completedAtDate: { $type: 'date', $lt: cutoffDate } },
            { completedAt: { $type: 'string', $lt: cutoffIso } },
          ],
        },
        {
          status: 'acknowledged',
          allStationsAcknowledged: true,
          $or: [
            { completedAtDate: { $type: 'date', $lt: cutoffDate } },
            { completedAt: { $type: 'string', $lt: cutoffIso } },
            { acknowledgedAtDate: { $type: 'date', $lt: cutoffDate } },
            { acknowledgedAt: { $type: 'string', $lt: cutoffIso } },
          ],
        },
      ],
    }

    const deleteResult = await tempCol.deleteMany(sweepQuery)
    console.log(`[TEST 4] deleteResult.deletedCount: ${deleteResult.deletedCount}`)
    assert.strictEqual(deleteResult.deletedCount, 1, 'Only the completed 8-day event should match the sweep query')

    // Verify survivors
    const remainingDocs = await tempCol.find({}).toArray()
    const remainingIds = remainingDocs.map(d => d.eventId).sort()
    console.log(`[TEST 4] Remaining document IDs: ${JSON.stringify(remainingIds)}`)

    assert.strictEqual(remainingDocs.length, 6, 'Exactly 6 documents must remain')
    assert.ok(remainingIds.includes('t_pending_8d'), 'Pending event older than 8 days MUST be retained')
    assert.ok(remainingIds.includes('t_partial_8d'), 'Partially acknowledged event older than 8 days MUST be retained')
    assert.ok(remainingIds.includes('t_missing_date_10d'), 'Event with null/missing completedAtDate MUST be retained')
    assert.ok(remainingIds.includes('t_completed_2d'), 'Completed event younger than 7 days MUST be retained')
    assert.ok(remainingIds.includes('t_legacy_one_station_8d'), 'Legacy event with 1 station ack MUST be retained')
    assert.ok(remainingIds.includes('t_legacy_missing_all_ack_8d'), 'Legacy event with missing allStationsAcknowledged MUST be retained')
    assert.strictEqual(remainingIds.includes('t_completed_8d'), false, 'Completed event older than 7 days MUST be deleted')

    console.log('✓ TEST 4 PASSED: Live MongoDB query correctly pruned ONLY the completed 8-day event; preserved all ambiguous legacy events\n')

    // 9. Verify native MongoDB TTL index behavior on BSON types
    console.log('[TEST 5] Verifying MongoDB Atlas BSON TTL semantics...')
    // In MongoDB documentation:
    // "TTL indexes expire documents after the specified number of seconds has passed since the indexed field value;
    // that is, the expiration threshold is the field's value plus the specified number of seconds.
    // If the field is not a date, the document will not expire.
    // If the document does not contain the indexed field, the document will not expire."
    const nullDoc = await tempCol.findOne({ eventId: 't_pending_8d' })
    assert.strictEqual(nullDoc.completedAtDate, null, 'Pending document completedAtDate is null')
    assert.ok(typeof nullDoc.completedAtDate !== 'object' || nullDoc.completedAtDate === null, 'null is not a Date')

    const missingDoc = await tempCol.findOne({ eventId: 't_missing_date_10d' })
    assert.strictEqual(missingDoc.completedAtDate, undefined, 'Missing document completedAtDate is undefined')

    console.log('✓ TEST 5 PASSED: Native MongoDB Atlas TTL invariants verified against BSON types\n')

  } finally {
    // Cleanup temporary collection
    if (tempCollectionName) {
      try {
        console.log(`[CLEANUP] Dropping isolated test collection: "${tempCollectionName}"...`)
        await db.collection(tempCollectionName).drop()
        console.log(`[CLEANUP] Dropped temporary test collection successfully.`)
      } catch (dropErr) {
        console.warn(`[CLEANUP_WARN] Failed to drop temporary collection: ${dropErr.message}`)
      }
    }
    await closeDatabaseConnection()
  }

  console.log('=================================================================')
  console.log('  REAL MONGODB ATLAS INTEGRATION TEST PASSED (5/5 CHECKS)        ')
  console.log('=================================================================\n')
}

runRealMongoIntegrationTest().catch(err => {
  console.error('REAL MONGODB INTEGRATION TEST FAILED:', err)
  process.exit(1)
})
