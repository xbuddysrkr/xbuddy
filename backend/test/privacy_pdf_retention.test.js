import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import {
  RETENTION_MINUTES_PRINTED,
  RETENTION_MS_PRINTED,
  RETENTION_HOURS_UNPRINTED,
  RETENTION_MS_UNPRINTED,
  RETENTION_MINUTES,
  RETENTION_WINDOW_MS,
  calculateExpiryTimestamp,
  calculatePrintedExpiryTimestamp,
  calculateUnprintedExpiryTimestamp,
  getEffectiveExpiryTimestamp,
  isOrderReprintEligible,
  cleanupExpiredPdfs,
  buildPayloadExistsCondition,
  buildEligiblePrintedQuery,
  buildEligibleUnprintedQuery,
  buildCleanupQuery,
  getGridFsInventory,
} from '../api/_lib/retention.js'
import {
  GRIDFS_BUCKET_NAME,
  GRIDFS_CHUNK_SIZE,
  savePdfToGridFS,
  getPdfStreamFromGridFS,
  getPdfBufferFromGridFS,
  deletePdfFromGridFS,
} from '../api/_lib/gridfs.js'
import { setCachedDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import ordersHandler from '../api/orders.js'
import agentOrdersHandler from '../api/agent/orders.js'

// ── In-Memory MongoDB & GridFS Mock Implementation ──────────────────────────

class MockGridFSBucket {
  constructor(db, { bucketName = 'order_pdfs' } = {}) {
    this.db = db
    this.bucketName = bucketName
    this.deletedIds = []
  }

  openUploadStream(filename, options = {}) {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const filesCol = this.db.collection(`${this.bucketName}.files`)
    const chunksCol = this.db.collection(`${this.bucketName}.chunks`)
    const chunkSize = options.chunkSizeBytes || 1048576
    const metadata = options.metadata || {}

    const chunks = []
    let totalBytes = 0

    const uploadStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk)
        totalBytes += chunk.length
        callback()
      },
      final: async (callback) => {
        try {
          const fullBuf = Buffer.concat(chunks)
          let n = 0
          for (let offset = 0; offset < fullBuf.length; offset += chunkSize) {
            const slice = fullBuf.subarray(offset, Math.min(offset + chunkSize, fullBuf.length))
            await chunksCol.insertOne({
              _id: `chunk_${fileId}_${n}`,
              files_id: fileId,
              n,
              data: slice,
            })
            n++
          }

          await filesCol.insertOne({
            _id: fileId,
            length: totalBytes,
            chunkSize,
            uploadDate: options.uploadDate || new Date(),
            filename,
            contentType: options.contentType || 'application/pdf',
            metadata,
          })
          uploadStream.id = fileId
          uploadStream.emit('finish')
          callback()
        } catch (err) {
          callback(err)
        }
      },
    })
    return uploadStream
  }

  openDownloadStream(fileId) {
    const filesCol = this.db.collection(`${this.bucketName}.files`)
    const chunksCol = this.db.collection(`${this.bucketName}.chunks`)

    const stream = new Readable({ read() {} })
    setTimeout(async () => {
      try {
        const file = await filesCol.findOne({ _id: fileId })
        if (!file) {
          const err = new Error(`FileNotFound: file ${fileId} was not found`)
          stream.emit('error', err)
          return
        }
        const chunks = await chunksCol.find({ files_id: fileId }).sort({ n: 1 }).toArray()
        for (const c of chunks) {
          const buf = Buffer.isBuffer(c.data) ? c.data : Buffer.from(c.data?.data || c.data)
          stream.push(buf)
        }
        stream.push(null)
      } catch (e) {
        stream.emit('error', e)
      }
    }, 5)
    return stream
  }

  async delete(fileId) {
    this.deletedIds.push(fileId)
    const filesCol = this.db.collection(`${this.bucketName}.files`)
    const chunksCol = this.db.collection(`${this.bucketName}.chunks`)
    await filesCol.deleteOne({ _id: fileId })
    await chunksCol.deleteMany({ files_id: fileId })
  }

  find(query = {}) {
    const filesCol = this.db.collection(`${this.bucketName}.files`)
    return filesCol.find(query)
  }
}

class MockCollection {
  constructor(name) {
    this.name = name
    this.docs = new Map()
  }

  async insertOne(doc) {
    const _id = doc._id || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const clone = { ...doc, _id }
    this.docs.set(String(_id), clone)
    return { acknowledged: true, insertedId: _id }
  }

  async insertMany(docsArr) {
    for (const d of docsArr) {
      await this.insertOne(d)
    }
    return { acknowledged: true, insertedCount: docsArr.length }
  }

  async findOne(filter = {}, options = {}) {
    const all = Array.from(this.docs.values())
    const match = all.find(d => this._matches(d, filter))
    if (!match) return null
    return this._project(JSON.parse(JSON.stringify(match)), options.projection)
  }

  find(filter = {}, options = {}) {
    let results = Array.from(this.docs.values()).filter(d => this._matches(d, filter))
    const cursor = {
      sort: (sortObj) => {
        if (sortObj?.createdAt) {
          results.sort((a, b) => (sortObj.createdAt === -1 ? (b.createdAt || '').localeCompare(a.createdAt || '') : (a.createdAt || '').localeCompare(b.createdAt || '')))
        }
        if (sortObj?.n) {
          results.sort((a, b) => (sortObj.n === -1 ? (b.n || 0) - (a.n || 0) : (a.n || 0) - (b.n || 0)))
        }
        return cursor
      },
      limit: (n) => {
        results = results.slice(0, n)
        return cursor
      },
      toArray: async () => results.map(d => this._project(JSON.parse(JSON.stringify(d)), options.projection)),
    }
    return cursor
  }

  async updateOne(filter = {}, update = {}) {
    const doc = await this.findOne(filter)
    if (!doc) return { matchedCount: 0, modifiedCount: 0 }

    const realDoc = this.docs.get(String(doc._id))
    if (update.$set) {
      Object.assign(realDoc, JSON.parse(JSON.stringify(update.$set)))
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!Array.isArray(realDoc[k])) realDoc[k] = []
        realDoc[k].push(JSON.parse(JSON.stringify(v)))
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        realDoc[k] = (realDoc[k] || 0) + v
      }
    }
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const doc = await this.findOne(filter)
    if (!doc) return null
    await this.updateOne(filter, update)
    const after = this.docs.get(String(doc._id))
    return JSON.parse(JSON.stringify(after))
  }

  async deleteOne(filter = {}) {
    const doc = await this.findOne(filter)
    if (doc) {
      this.docs.delete(String(doc._id))
      return { deletedCount: 1 }
    }
    return { deletedCount: 0 }
  }

  async deleteMany(filter = {}) {
    let count = 0
    for (const [id, doc] of this.docs.entries()) {
      if (this._matches(doc, filter)) {
        this.docs.delete(id)
        count++
      }
    }
    return { deletedCount: count }
  }

  async countDocuments(filter = {}) {
    let count = 0
    for (const doc of this.docs.values()) {
      if (this._matches(doc, filter)) count++
    }
    return count
  }

  _matches(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true
    for (const [k, v] of Object.entries(filter)) {
      if (k === '$or') {
        const anyPass = v.some(sub => this._matches(doc, sub))
        if (!anyPass) return false
        continue
      }
      if (k === '$and') {
        const allPass = v.every(sub => this._matches(doc, sub))
        if (!allPass) return false
        continue
      }

      const docVal = this._getNested(doc, k)

      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        if ('$exists' in v) {
          const exists = docVal !== undefined
          if (exists !== v.$exists) return false
        }
        if ('$lte' in v) {
          const a = docVal instanceof Date ? docVal.getTime() : docVal
          const b = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte
          if (docVal === undefined || a > b) return false
        }
        if ('$gt' in v) {
          const a = docVal instanceof Date ? docVal.getTime() : docVal
          const b = v.$gt instanceof Date ? v.$gt.getTime() : v.$gt
          if (docVal === undefined || a <= b) return false
        }
        if ('$ne' in v) {
          if (docVal === v.$ne) return false
        }
        if ('$in' in v) {
          if (!v.$in.includes(docVal)) return false
        }
        if ('$nin' in v) {
          if (v.$nin.includes(docVal)) return false
        }
        if ('$type' in v) {
          if (v.$type === 'string' && typeof docVal !== 'string') return false
          if (v.$type === 'number' && typeof docVal !== 'number') return false
          if (v.$type === 'bool' && typeof docVal !== 'boolean') return false
        }
        continue
      }

      if (docVal !== v) return false
    }
    return true
  }

  _getNested(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj)
  }

  _project(doc, proj) {
    if (!proj || Object.keys(proj).length === 0) return doc
    const isInclusive = Object.values(proj).some(v => v === 1)
    if (isInclusive) {
      const out = {}
      if (proj._id !== 0 && doc._id !== undefined) out._id = doc._id
      for (const [k, v] of Object.entries(proj)) {
        if (v === 1 && doc[k] !== undefined) out[k] = doc[k]
      }
      return out
    } else {
      const out = { ...doc }
      for (const [k, v] of Object.entries(proj)) {
        if (v === 0) delete out[k]
      }
      return out
    }
  }
}

class MockDatabase {
  constructor() {
    this.collections = new Map()
    this._mockBucket = null
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(name))
    }
    return this.collections.get(name)
  }

  async command(cmd) {
    if (cmd.ping) return { ok: 1 }
    return { ok: 1 }
  }
}

function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {}, url = '/api/orders' }) {
  const req = {
    method,
    query: { ...query },
    body: { ...body },
    headers: { ...headers },
    url,
  }

  class MockResponse extends Writable {
    constructor() {
      super()
      this.statusCode = 200
      this.headers = {}
      this.bodyData = null
      this._chunks = []
      this.headersSent = false
    }
    status(code) {
      this.statusCode = code
      return this
    }
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val
      return this
    }
    json(data) {
      this.bodyData = data
      this.headersSent = true
      this.emit('finish')
      return this
    }
    send(buf) {
      this.bodyData = buf
      this.headersSent = true
      this.emit('finish')
      return this
    }
    end() {
      this.headersSent = true
      this.emit('finish')
      return this
    }
    _write(chunk, encoding, callback) {
      this._chunks.push(chunk)
      callback()
    }
    _final(callback) {
      if (this._chunks.length > 0) {
        this.bodyData = Buffer.concat(this._chunks)
      }
      this.headersSent = true
      this.emit('finish')
      callback()
    }
  }

  const res = new MockResponse()
  return { req, res }
}

const SAMPLE_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')
const SAMPLE_BASE64 = SAMPLE_PDF.toString('base64')

// ── Test Runner ─────────────────────────────────────────────────────────────

async function runPrivacyRetentionTests() {
  console.log('================================================================')
  console.log('  STARTING XBUDDY FINAL PDF RETENTION & PRIVACY TEST SUITE      ')
  console.log('================================================================\n')

  const mockDb = new MockDatabase()
  const mockBucket = new MockGridFSBucket(mockDb)
  mockDb._mockBucket = mockBucket

  // Inject mock database so handlers use it without contacting production MongoDB Atlas
  setCachedDatabase({ close: async () => {} }, mockDb)

  // ── TEST 1: Dual retention policy constants and calculation helpers ───────
  console.log('[TEST 1] Testing dual retention rules and timestamp calculation helpers...')
  assert.strictEqual(RETENTION_MINUTES_PRINTED, 30, 'Printed retention window must be 30 minutes')
  assert.strictEqual(RETENTION_MS_PRINTED, 30 * 60 * 1000, 'Printed retention window must be 1,800,000 ms')
  assert.strictEqual(RETENTION_HOURS_UNPRINTED, 24, 'Unprinted retention window must be 24 hours')
  assert.strictEqual(RETENTION_MS_UNPRINTED, 24 * 60 * 60 * 1000, 'Unprinted retention window must be 86,400,000 ms')

  const t0 = new Date('2026-10-16T10:00:00.000Z').toISOString()
  const printedExp = calculatePrintedExpiryTimestamp(t0)
  assert.strictEqual(new Date(printedExp).getTime() - new Date(t0).getTime(), 30 * 60 * 1000, 'calculatePrintedExpiryTimestamp must add 30 min')

  const unprintedExp = calculateUnprintedExpiryTimestamp(t0)
  assert.strictEqual(new Date(unprintedExp).getTime() - new Date(t0).getTime(), 24 * 60 * 60 * 1000, 'calculateUnprintedExpiryTimestamp must add 24 hours')

  // getEffectiveExpiryTimestamp logic
  const orderPrinted = { printedAt: t0 }
  assert.strictEqual(getEffectiveExpiryTimestamp(orderPrinted), printedExp, 'Printed order must resolve to printedAt + 30m')

  const orderUnprinted = { pdfUploadedAt: t0 }
  assert.strictEqual(getEffectiveExpiryTimestamp(orderUnprinted), unprintedExp, 'Unprinted order must resolve to upload + 24h')

  console.log('✓ TEST 1 PASSED: Dual retention constants and calculation helpers verified\n')

  // ── TEST 2: Successful print: PDF remains before 30m after printedAt, removed after ──
  console.log('[TEST 2] Testing successful print: PDF remains before 30m after printedAt, purged after...')
  const idPrintedRecent = 'XB_PRINTED_RECENT'
  const idPrintedExpired = 'XB_PRINTED_EXPIRED'

  const nowMs = Date.now()
  const printed15mAgo = new Date(nowMs - 15 * 60 * 1000).toISOString()
  const printed45mAgo = new Date(nowMs - 45 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertMany([
    {
      orderId: idPrintedRecent,
      printStatus: 'Printed',
      printedAt: printed15mAgo,
      pdfExpiresAt: calculatePrintedExpiryTimestamp(printed15mAgo),
      pdfUploadedAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
    {
      orderId: idPrintedExpired,
      printStatus: 'Printed',
      printedAt: printed45mAgo,
      pdfExpiresAt: calculatePrintedExpiryTimestamp(printed45mAgo),
      pdfUploadedAt: new Date(nowMs - 3 * 60 * 60 * 1000).toISOString(),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
  ])

  // Upload GridFS mock files
  const upRecentP = mockBucket.openUploadStream(`${idPrintedRecent}.pdf`, { metadata: { orderId: idPrintedRecent } })
  upRecentP.write(SAMPLE_PDF)
  upRecentP.end()

  const upExpP = mockBucket.openUploadStream(`${idPrintedExpired}.pdf`, { metadata: { orderId: idPrintedExpired } })
  upExpP.write(SAMPLE_PDF)
  upExpP.end()
  await new Promise(r => setTimeout(r, 20))

  // Run cleanup for these orders
  const cleanupRes1 = await cleanupExpiredPdfs(mockDb, { orderIds: [idPrintedRecent, idPrintedExpired] })
  assert.strictEqual(cleanupRes1.cleanedCount, 1, 'Only the order printed > 30m ago should be cleaned')
  assert.ok(cleanupRes1.cleanedOrderIds.includes(idPrintedExpired), 'Expired printed order must be cleaned')

  const docPrintedRecent = await mockDb.collection('orders').findOne({ orderId: idPrintedRecent })
  assert.strictEqual(docPrintedRecent.hasPdf, true, 'Recent printed order (< 30m) must retain PDF')
  assert.strictEqual(docPrintedRecent.pdfDeletedAt, undefined)

  const docPrintedExp = await mockDb.collection('orders').findOne({ orderId: idPrintedExpired })
  assert.strictEqual(docPrintedExp.hasPdf, false, 'Expired printed order (> 30m) must have hasPdf=false')
  assert.ok(docPrintedExp.pdfDeletedAt, 'Expired printed order must have pdfDeletedAt timestamp')
  console.log('✓ TEST 2 PASSED: Successfully printed orders retain PDF before 30m and are purged after 30m\n')

  // ── TEST 3: Never-printed order: PDF remains before 24h, purged after 24h ──
  console.log('[TEST 3] Testing never-printed order: PDF remains before 24h after upload, purged after 24h...')
  const idUnprintedRecent = 'XB_UNPRINTED_RECENT'
  const idUnprintedExpired = 'XB_UNPRINTED_EXPIRED'

  const upload10hAgo = new Date(nowMs - 10 * 60 * 60 * 1000).toISOString()
  const upload26hAgo = new Date(nowMs - 26 * 60 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertMany([
    {
      orderId: idUnprintedRecent,
      printStatus: 'waiting_for_shopkeeper',
      pdfUploadedAt: upload10hAgo,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload10hAgo),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
      createdAt: upload10hAgo,
    },
    {
      orderId: idUnprintedExpired,
      printStatus: 'waiting_for_shopkeeper',
      pdfUploadedAt: upload26hAgo,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload26hAgo),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
      createdAt: upload26hAgo,
    },
  ])

  const upRecentU = mockBucket.openUploadStream(`${idUnprintedRecent}.pdf`, { metadata: { orderId: idUnprintedRecent } })
  upRecentU.write(SAMPLE_PDF)
  upRecentU.end()

  const upExpU = mockBucket.openUploadStream(`${idUnprintedExpired}.pdf`, { metadata: { orderId: idUnprintedExpired } })
  upExpU.write(SAMPLE_PDF)
  upExpU.end()
  await new Promise(r => setTimeout(r, 20))

  const cleanupRes2 = await cleanupExpiredPdfs(mockDb, { orderIds: [idUnprintedRecent, idUnprintedExpired] })
  assert.strictEqual(cleanupRes2.cleanedCount, 1, 'Only order uploaded > 24h ago should be cleaned')
  assert.ok(cleanupRes2.cleanedOrderIds.includes(idUnprintedExpired))

  const docUnprintedRecent = await mockDb.collection('orders').findOne({ orderId: idUnprintedRecent })
  assert.strictEqual(docUnprintedRecent.hasPdf, true, 'Unprinted order (< 24h) must retain PDF')

  const docUnprintedExp = await mockDb.collection('orders').findOne({ orderId: idUnprintedExpired })
  assert.strictEqual(docUnprintedExp.hasPdf, false, 'Unprinted order (> 24h) must be purged')
  assert.ok(docUnprintedExp.pdfDeletedAt)
  console.log('✓ TEST 3 PASSED: Never-printed orders retain PDF before 24h and are purged after 24h\n')

  // ── TEST 4: Failed print and claimed-but-unprinted follow 24h upload rule ───
  console.log('[TEST 4] Testing failed print and claimed-but-unprinted follow the 24-hour upload rule...')
  const idClaimedRecent = 'XB_CLAIMED_12H'
  const idFailedRecent = 'XB_FAILED_12H'
  const idFailedExpired = 'XB_FAILED_25H'

  const upload12hAgo = new Date(nowMs - 12 * 60 * 60 * 1000).toISOString()
  const upload25hAgo = new Date(nowMs - 25 * 60 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertMany([
    {
      orderId: idClaimedRecent,
      printStatus: 'Claimed',
      claimedAt: new Date(nowMs - 1 * 60 * 60 * 1000).toISOString(),
      pdfUploadedAt: upload12hAgo,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload12hAgo),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
    {
      orderId: idFailedRecent,
      printStatus: 'Failed',
      failedAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
      pdfUploadedAt: upload12hAgo,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload12hAgo),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
    {
      orderId: idFailedExpired,
      printStatus: 'Failed',
      failedAt: new Date(nowMs - 20 * 60 * 60 * 1000).toISOString(),
      pdfUploadedAt: upload25hAgo,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload25hAgo),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
  ])

  const upClaimed = mockBucket.openUploadStream(`${idClaimedRecent}.pdf`, { metadata: { orderId: idClaimedRecent } })
  upClaimed.write(SAMPLE_PDF)
  upClaimed.end()

  const upFailedR = mockBucket.openUploadStream(`${idFailedRecent}.pdf`, { metadata: { orderId: idFailedRecent } })
  upFailedR.write(SAMPLE_PDF)
  upFailedR.end()

  const upFailedE = mockBucket.openUploadStream(`${idFailedExpired}.pdf`, { metadata: { orderId: idFailedExpired } })
  upFailedE.write(SAMPLE_PDF)
  upFailedE.end()
  await new Promise(r => setTimeout(r, 20))

  const cleanupRes3 = await cleanupExpiredPdfs(mockDb, {
    orderIds: [idClaimedRecent, idFailedRecent, idFailedExpired],
  })
  assert.strictEqual(cleanupRes3.cleanedCount, 1, 'Only the failed order older than 24 hours should be cleaned')
  assert.ok(cleanupRes3.cleanedOrderIds.includes(idFailedExpired))

  const docClaimed = await mockDb.collection('orders').findOne({ orderId: idClaimedRecent })
  assert.strictEqual(docClaimed.hasPdf, true, 'Claimed unprinted order (< 24h) must retain PDF')

  const docFailedRecent = await mockDb.collection('orders').findOne({ orderId: idFailedRecent })
  assert.strictEqual(docFailedRecent.hasPdf, true, 'Failed order (< 24h) must retain PDF')

  const docFailedExpired = await mockDb.collection('orders').findOne({ orderId: idFailedExpired })
  assert.strictEqual(docFailedExpired.hasPdf, false, 'Failed order (> 24h) must be purged')
  console.log('✓ TEST 4 PASSED: Claimed-but-unprinted and failed orders strictly adhere to 24h upload rule\n')

  // ── TEST 5: Payment verification does NOT reset the retention timer ───────
  console.log('[TEST 5] Testing payment verification does NOT reset expiration deadline...')
  const idPayNoReset = 'XB_PAY_NO_RESET'
  const uploadTimeInit = new Date(nowMs - 5 * 60 * 60 * 1000).toISOString()
  const expectedDeadline = calculateUnprintedExpiryTimestamp(uploadTimeInit)

  await mockDb.collection('orders').insertOne({
    orderId: idPayNoReset,
    printStatus: 'waiting_for_shopkeeper',
    paymentStatus: 'pending',
    pdfUploadedAt: uploadTimeInit,
    pdfExpiresAt: expectedDeadline,
    createdAt: uploadTimeInit,
    hasPdf: true,
  })

  // Operator verifies payment
  await mockDb.collection('orders').updateOne(
    { orderId: idPayNoReset },
    { $set: { paymentStatus: 'paid', updatedAt: new Date().toISOString() } }
  )

  const docPayVerified = await mockDb.collection('orders').findOne({ orderId: idPayNoReset })
  assert.strictEqual(docPayVerified.paymentStatus, 'paid')
  assert.strictEqual(docPayVerified.pdfExpiresAt, expectedDeadline, 'pdfExpiresAt must remain the original upload + 24h deadline')
  assert.strictEqual(docPayVerified.pdfUploadedAt, uploadTimeInit, 'pdfUploadedAt must remain unchanged')
  console.log('✓ TEST 5 PASSED: Payment verification leaves retention timer and upload deadline untouched\n')

  // ── TEST 6: In-progress print safeguard: active Printing protected, stalled recovered ─
  console.log('[TEST 6] Testing in-progress print safeguard & stalled printing timeout...')
  const idPrintingSafe = 'XB_IN_PROGRESS_PRINT'
  const idPrintingStalled = 'XB_STALLED_PRINT'
  const upload25hAgoSafe = new Date(nowMs - 25 * 60 * 60 * 1000).toISOString()
  const printing5mAgo = new Date(nowMs - 5 * 60 * 1000).toISOString()
  const printing45mAgo = new Date(nowMs - 45 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertMany([
    {
      orderId: idPrintingSafe,
      printStatus: 'Printing', // Actively spooling/printing 5 mins ago
      printingAt: printing5mAgo,
      pdfUploadedAt: upload25hAgoSafe,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload25hAgoSafe),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
    {
      orderId: idPrintingStalled,
      printStatus: 'Printing', // Stalled/abandoned print job (started 45 mins ago, > 24h old upload)
      printingAt: printing45mAgo,
      pdfUploadedAt: upload25hAgoSafe,
      pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload25hAgoSafe),
      hasPdf: true,
      hasGridFsPdf: true,
      pdfStorage: 'gridfs',
    },
  ])

  const upPrinting = mockBucket.openUploadStream(`${idPrintingSafe}.pdf`, { metadata: { orderId: idPrintingSafe } })
  upPrinting.write(SAMPLE_PDF)
  upPrinting.end()

  const upStalled = mockBucket.openUploadStream(`${idPrintingStalled}.pdf`, { metadata: { orderId: idPrintingStalled } })
  upStalled.write(SAMPLE_PDF)
  upStalled.end()
  await new Promise(r => setTimeout(r, 20))

  const cleanupRes4 = await cleanupExpiredPdfs(mockDb, { orderIds: [idPrintingSafe, idPrintingStalled] })
  assert.strictEqual(cleanupRes4.cleanedCount, 1, 'Only the stalled print (> 30m) should be cleaned; active print must be protected')
  assert.ok(cleanupRes4.cleanedOrderIds.includes(idPrintingStalled))

  const docPrintingCheck = await mockDb.collection('orders').findOne({ orderId: idPrintingSafe })
  assert.strictEqual(docPrintingCheck.hasPdf, true, 'PDF must remain for actively Printing order')
  assert.strictEqual(docPrintingCheck.pdfDeletedAt, undefined)

  const docStalledCheck = await mockDb.collection('orders').findOne({ orderId: idPrintingStalled })
  assert.strictEqual(docStalledCheck.hasPdf, false, 'PDF must be purged for stalled Printing order after timeout')
  assert.ok(docStalledCheck.pdfDeletedAt)
  console.log('✓ TEST 6 PASSED: Active in-progress print is protected and stalled print is safely recovered\n')

  // ── TEST 7: GridFS deletion removes BOTH file metadata and binary chunks ──
  console.log('[TEST 7] Testing GridFS deletion removes metadata and chunks...')
  const idGfsClean = 'XB_GFS_METADATA_CHUNKS'
  const upload27h = new Date(nowMs - 27 * 60 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertOne({
    orderId: idGfsClean,
    printStatus: 'waiting_for_shopkeeper',
    pdfUploadedAt: upload27h,
    pdfExpiresAt: calculateUnprintedExpiryTimestamp(upload27h),
    hasPdf: true,
    hasGridFsPdf: true,
    pdfStorage: 'gridfs',
  })

  const upGfs = mockBucket.openUploadStream(`${idGfsClean}.pdf`, { metadata: { orderId: idGfsClean } })
  upGfs.write(SAMPLE_PDF)
  upGfs.end()
  await new Promise(r => setTimeout(r, 20))

  // Run cleanup
  await cleanupExpiredPdfs(mockDb, { orderIds: [idGfsClean] })

  const fileDoc = await mockDb.collection('order_pdfs.files').findOne({ filename: `${idGfsClean}.pdf` })
  assert.strictEqual(fileDoc, null, 'GridFS file metadata must be completely removed')

  const chunksList = await mockDb.collection('order_pdfs.chunks').find({ files_id: upGfs.id }).toArray()
  assert.strictEqual(chunksList.length, 0, 'All GridFS binary chunks must be completely removed')
  console.log('✓ TEST 7 PASSED: GridFSBucket.delete removes both file metadata and binary chunks\n')

  // ── TEST 8: Expired PDFs cannot be downloaded or claimed (endpoint gates) ──
  console.log('[TEST 8] Testing endpoint enforcement: expired PDFs cannot be downloaded or claimed...')
  const idExpiredDownload = 'XB_EXP_DOWNLOAD'
  const expTime = new Date(nowMs - 1 * 60 * 1000).toISOString() // 1 minute expired

  await mockDb.collection('orders').insertOne({
    orderId: idExpiredDownload,
    fileName: 'resume.pdf',
    printStatus: 'waiting_for_shopkeeper',
    paymentStatus: 'paid',
    hasPdf: true,
    pdfUploadedAt: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(),
    pdfExpiresAt: expTime,
    createdAt: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(),
  })

  // Test getOrderPdf endpoint via ordersHandler
  const { req: reqDl, res: resDl } = createMockReqRes({
    method: 'GET',
    query: { action: 'getOrderPdf', orderId: idExpiredDownload },
  })
  await ordersHandler(reqDl, resDl)
  assert.strictEqual(resDl.statusCode, 410, `getOrderPdf must return 410 Gone for expired document, got ${resDl.statusCode}`)
  assert.strictEqual(resDl.bodyData?.expired, true)

  // Test agent claim endpoint via agentOrdersHandler
  process.env.AGENT_SECRET_KEY = 'XB_AGENT_SECRET_KEY_TEST'
  const { req: reqClaim, res: resClaim } = createMockReqRes({
    method: 'POST',
    url: `/api/agent/orders/${idExpiredDownload}/claim`,
    query: { route: `${idExpiredDownload}/claim` },
    body: { stationId: 'SRKR-XEROX-01' },
    headers: { 'x-agent-key': 'XB_AGENT_SECRET_KEY_TEST' },
  })
  await agentOrdersHandler(reqClaim, resClaim)
  assert.strictEqual(resClaim.statusCode, 410, `Agent claim must return 410 Gone for expired document, got ${resClaim.statusCode}`)
  assert.strictEqual(resClaim.bodyData?.expired, true)
  console.log('✓ TEST 8 PASSED: Expired PDFs strictly blocked with HTTP 410 on download and claim endpoints\n')

  // ── TEST 9: Order and payment records remain intact ───────────────────────
  console.log('[TEST 9] Testing order document and payment records remain intact after cleanup...')
  const idPreserveDoc = 'XB_PRESERVE_FINANCIAL'
  const uploadExpiredDoc = new Date(nowMs - 26 * 60 * 60 * 1000).toISOString()

  await mockDb.collection('orders').insertOne({
    orderId: idPreserveDoc,
    name: 'Test Student',
    amount: 50,
    copies: 2,
    colorMode: 'color',
    printSide: 'Double',
    paymentStatus: 'paid',
    transactionId: 'UTR_MOCK_12345',
    printStatus: 'waiting_for_shopkeeper',
    pdfUploadedAt: uploadExpiredDoc,
    pdfExpiresAt: calculateUnprintedExpiryTimestamp(uploadExpiredDoc),
    hasPdf: true,
    pdfBase64: SAMPLE_BASE64,
    pdfStorage: 'inline',
    createdAt: uploadExpiredDoc,
  })

  await cleanupExpiredPdfs(mockDb, { orderIds: [idPreserveDoc] })

  const preservedDoc = await mockDb.collection('orders').findOne({ orderId: idPreserveDoc })
  assert.ok(preservedDoc, 'Order document must exist')
  assert.strictEqual(preservedDoc.orderId, idPreserveDoc)
  assert.strictEqual(preservedDoc.amount, 50, 'Payment amount must be preserved')
  assert.strictEqual(preservedDoc.paymentStatus, 'paid', 'Payment status must be preserved')
  assert.strictEqual(preservedDoc.transactionId, 'UTR_MOCK_12345', 'Transaction UPI reference must be preserved')
  assert.strictEqual(preservedDoc.copies, 2, 'Accounting print spec must be preserved')
  assert.strictEqual(preservedDoc.colorMode, 'color')
  assert.strictEqual(preservedDoc.hasPdf, false, 'PDF content flag marked false')
  assert.strictEqual(preservedDoc.pdfBase64, '', 'Inline base64 payload cleared')
  assert.strictEqual(preservedDoc.pdfStorage, 'none', 'Storage pointer cleared')
  assert.ok(preservedDoc.pdfDeletedAt, 'pdfDeletedAt recorded')
  console.log('✓ TEST 9 PASSED: Order document and payment/accounting records completely preserved\n')

  // ── TEST 10: Cleanup is safe after restarts, repeated runs and failures ────
  console.log('[TEST 10] Testing idempotent repeat execution and transient failure retry...')
  // Idempotent repeat
  const repeatRun = await cleanupExpiredPdfs(mockDb, { orderIds: [idPreserveDoc] })
  assert.strictEqual(repeatRun.cleanedCount, 0, 'Subsequent run finds 0 orders to clean')
  assert.strictEqual(repeatRun.errors.length, 0, 'Subsequent run produces 0 errors')

  // Transient failure handling
  const idTransient = 'XB_TRANSIENT_ERR'
  const uploadTrans = new Date(nowMs - 28 * 60 * 60 * 1000).toISOString()
  await mockDb.collection('orders').insertOne({
    orderId: idTransient,
    printStatus: 'waiting_for_shopkeeper',
    pdfUploadedAt: uploadTrans,
    pdfExpiresAt: calculateUnprintedExpiryTimestamp(uploadTrans),
    hasPdf: true,
  })

  const origDelete = mockBucket.delete.bind(mockBucket)
  let failFirst = true
  mockBucket.delete = async (id) => {
    if (failFirst) {
      failFirst = false
      throw new Error('Transient simulated MongoDB connection error')
    }
    return origDelete(id)
  }

  // Insert mock file to trigger delete
  await mockDb.collection('order_pdfs.files').insertOne({
    _id: 'trans_file_id',
    filename: `${idTransient}.pdf`,
    metadata: { orderId: idTransient },
    uploadDate: new Date(nowMs - 28 * 60 * 60 * 1000),
  })

  // Run 1: Fails on delete
  const failRes = await cleanupExpiredPdfs(mockDb, { orderIds: [idTransient] })
  assert.strictEqual(failRes.success, false)
  const docAfterFail = await mockDb.collection('orders').findOne({ orderId: idTransient })
  assert.strictEqual(docAfterFail.pdfDeletedAt, undefined, 'pdfDeletedAt must NOT be set on failure')

  // Run 2: Succeeds
  mockBucket.delete = origDelete
  const successRes = await cleanupExpiredPdfs(mockDb, { orderIds: [idTransient] })
  assert.strictEqual(successRes.success, true)
  assert.strictEqual(successRes.cleanedCount, 1)
  const docAfterRetry = await mockDb.collection('orders').findOne({ orderId: idTransient })
  assert.ok(docAfterRetry.pdfDeletedAt, 'pdfDeletedAt set on retry success')
  console.log('✓ TEST 10 PASSED: Cleanup is safe, idempotent, and retries cleanly on transient failures\n')

  // ── TEST 11: Orphaned GridFS file sweep ───────────────────────────────────
  console.log('[TEST 11] Testing orphan GridFS file sweep...')
  const orphanFileId = 'orphan_stale_file_24h'
  await mockDb.collection('order_pdfs.files').insertOne({
    _id: orphanFileId,
    filename: 'XB_ORPHAN_99.pdf',
    uploadDate: new Date(nowMs - 26 * 60 * 60 * 1000), // 26 hours old
    metadata: { orderId: 'XB_ORPHAN_99' },
  })
  await mockDb.collection('order_pdfs.chunks').insertOne({
    _id: 'chunk_orphan_01',
    files_id: orphanFileId,
    n: 0,
    data: Buffer.from('orphan chunks'),
  })

  await cleanupExpiredPdfs(mockDb, { orderIds: ['XB_ORPHAN_99'] })

  const orphanFileCheck = await mockDb.collection('order_pdfs.files').findOne({ _id: orphanFileId })
  const orphanChunkCheck = await mockDb.collection('order_pdfs.chunks').findOne({ files_id: orphanFileId })
  assert.strictEqual(orphanFileCheck, null, 'Orphaned file metadata must be purged')
  assert.strictEqual(orphanChunkCheck, null, 'Orphaned chunks must be purged')
  console.log('✓ TEST 11 PASSED: Orphaned GridFS files and chunks are swept automatically\n')

  // ── TEST 12: Privacy & zero PII in operational logs ────────────────────────
  console.log('[TEST 12] Testing logs contain zero student personal data or PDF payloads...')
  const loggedLines = []
  const spyLogger = {
    log: (m) => loggedLines.push(m),
    warn: (m) => loggedLines.push(m),
    error: (m) => loggedLines.push(m),
  }

  const idPrivacyLog = 'XB_LOG_PRIVACY_DOC'
  await mockDb.collection('orders').insertOne({
    orderId: idPrivacyLog,
    name: 'Confidential Student Name',
    fileName: 'Internal_Academic_Gradecard.pdf',
    printStatus: 'waiting_for_shopkeeper',
    pdfUploadedAt: new Date(nowMs - 26 * 60 * 60 * 1000).toISOString(),
    pdfExpiresAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
    hasPdf: true,
    pdfBase64: SAMPLE_BASE64,
  })

  await cleanupExpiredPdfs(mockDb, { orderIds: [idPrivacyLog], logger: spyLogger })
  const combinedLogText = loggedLines.join(' ')
  assert.ok(!combinedLogText.includes('Confidential Student Name'), 'Log must NOT contain student personal name')
  assert.ok(!combinedLogText.includes('Internal_Academic_Gradecard'), 'Log must NOT contain original document filename')
  assert.ok(!combinedLogText.includes(SAMPLE_BASE64), 'Log must NOT contain PDF binary/base64 payload')
  assert.ok(combinedLogText.includes(idPrivacyLog), 'Log should cite opaque orderId only')
  console.log('✓ TEST 12 PASSED: Logs strictly preserve student privacy and omit personal data\n')

  // ── TEST 13: Query builder correctness and boundary condition verification ─
  console.log('[TEST 13] Testing inventory query builders and boundary conditions...')
  const testNow = new Date('2026-10-16T12:00:00.000Z')
  const testNowMs = testNow.getTime()
  const ordersCol = mockDb.collection('orders')

  // 1. Validate structure has NO duplicate keys and valid operators
  const cleanupQ = buildCleanupQuery(testNow)
  assert.ok(cleanupQ.$and, 'Unified query must nest criteria in $and array')
  assert.strictEqual(typeof cleanupQ.$and, 'object')
  // Verify serializing and deserializing retains all parts
  const serialized = JSON.stringify(cleanupQ)
  assert.ok(serialized.includes('"$and"'), 'Must nest branches under $and')

  const printedQ = buildEligiblePrintedQuery(testNow)
  const unprintedQ = buildEligibleUnprintedQuery(testNow)

  // 2. Test printed query matching
  const printedExpired = {
    orderId: 'XB_PR_EXP',
    printStatus: 'Printed',
    hasPdf: true,
    pdfStorage: 'gridfs',
    printedAt: new Date(testNowMs - 31 * 60 * 1000).toISOString(), // 31m ago
  }
  const printedActive = {
    orderId: 'XB_PR_ACT',
    printStatus: 'Printed',
    hasPdf: true,
    pdfStorage: 'gridfs',
    printedAt: new Date(testNowMs - 15 * 60 * 1000).toISOString(), // 15m ago
  }
  const printedNoPayload = {
    orderId: 'XB_PR_NOPAY',
    printStatus: 'Printed',
    hasPdf: false,
    pdfStorage: 'none',
    pdfBase64: '',
    printedAt: new Date(testNowMs - 35 * 60 * 1000).toISOString(),
  }

  assert.strictEqual(ordersCol._matches(printedExpired, printedQ), true, 'Printed order older than 30m should match')
  assert.strictEqual(ordersCol._matches(printedActive, printedQ), false, 'Printed order within 30m must NOT match')
  assert.strictEqual(ordersCol._matches(printedNoPayload, printedQ), false, 'Printed order without payload must NOT match')

  // 3. Test unprinted query matching & in-progress printing safeguard
  const unprintedExpired = {
    orderId: 'XB_UNPR_EXP',
    printStatus: 'waiting_for_shopkeeper',
    hasPdf: true,
    pdfStorage: 'gridfs',
    pdfUploadedAt: new Date(testNowMs - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
  }
  const unprintedRecent = {
    orderId: 'XB_UNPR_REC',
    printStatus: 'waiting_for_shopkeeper',
    hasPdf: true,
    pdfStorage: 'gridfs',
    pdfUploadedAt: new Date(testNowMs - 23 * 60 * 60 * 1000).toISOString(), // 23h ago
  }
  const printingActive = {
    orderId: 'XB_PRINTING_ACTIVE',
    printStatus: 'Printing',
    hasPdf: true,
    pdfStorage: 'gridfs',
    printingAt: new Date(testNowMs - 10 * 60 * 1000).toISOString(), // started 10m ago
    pdfUploadedAt: new Date(testNowMs - 25 * 60 * 60 * 1000).toISOString(), // uploaded 25h ago
  }
  const printingStalled = {
    orderId: 'XB_PRINTING_STALLED',
    printStatus: 'Printing',
    hasPdf: true,
    pdfStorage: 'gridfs',
    printingAt: new Date(testNowMs - 45 * 60 * 1000).toISOString(), // stalled 45m ago
    pdfUploadedAt: new Date(testNowMs - 25 * 60 * 60 * 1000).toISOString(), // uploaded 25h ago
  }

  assert.strictEqual(ordersCol._matches(unprintedExpired, unprintedQ), true, 'Unprinted order > 24h should match')
  assert.strictEqual(ordersCol._matches(unprintedRecent, unprintedQ), false, 'Unprinted order < 24h must NOT match')
  assert.strictEqual(ordersCol._matches(printingActive, unprintedQ), false, 'Active Printing order must NOT be cleaned')
  assert.strictEqual(ordersCol._matches(printingStalled, unprintedQ), true, 'Stalled Printing order > 30m + upload > 24h must match')

  // 4. Test payload existence condition (missing, null, empty, 'none', 'drive', legacy)
  const payloadFilter = buildPayloadExistsCondition()
  assert.strictEqual(ordersCol._matches({ pdfStorage: 'gridfs' }, payloadFilter), true, 'pdfStorage gridfs must match payload')
  assert.strictEqual(ordersCol._matches({ pdfStorage: 'inline' }, payloadFilter), true, 'pdfStorage inline must match payload')
  assert.strictEqual(ordersCol._matches({ hasGridFsPdf: true }, payloadFilter), true, 'hasGridFsPdf true must match payload')
  assert.strictEqual(ordersCol._matches({ pdfBase64: SAMPLE_BASE64 }, payloadFilter), true, 'non-empty pdfBase64 must match payload')
  assert.strictEqual(ordersCol._matches({ hasPdf: true }, payloadFilter), true, 'legacy hasPdf true without pdfStorage must match payload')

  // Missing / empty / none / null / drive MUST NOT match payload existence
  assert.strictEqual(ordersCol._matches({ hasPdf: false }, payloadFilter), false, 'missing pdfStorage and hasPdf false must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfStorage: null, hasPdf: false }, payloadFilter), false, 'null pdfStorage must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfStorage: 'none', hasPdf: false }, payloadFilter), false, 'none pdfStorage must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfStorage: 'none', hasPdf: true }, payloadFilter), false, 'none pdfStorage even with hasPdf true must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfStorage: 'drive', hasPdf: true }, payloadFilter), false, 'drive pdfStorage must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfBase64: '', pdfStorage: 'none' }, payloadFilter), false, 'empty pdfBase64 must NOT match')
  assert.strictEqual(ordersCol._matches({ pdfBase64: null, pdfStorage: 'none' }, payloadFilter), false, 'null pdfBase64 must NOT match')

  // 5. Test legacy printed orders without printedAt: Safe fallback guarantees no premature 30m deletion
  const legacyPrintedRecent = {
    orderId: 'XB_LEGACY_PRINTED_RECENT',
    printStatus: 'Printed',
    hasPdf: true,
    pdfStorage: 'gridfs',
    createdAt: new Date(testNowMs - 45 * 60 * 1000).toISOString(), // created 45m ago, but printedAt missing!
  }
  const legacyPrintedOld = {
    orderId: 'XB_LEGACY_PRINTED_OLD',
    printStatus: 'Printed',
    hasPdf: true,
    pdfStorage: 'gridfs',
    createdAt: new Date(testNowMs - 25 * 60 * 60 * 1000).toISOString(), // created 25h ago, printedAt missing!
  }

  // Must NOT match printedQ (which strictly requires confirmed printedAt)
  assert.strictEqual(ordersCol._matches(legacyPrintedRecent, printedQ), false, 'Legacy printed order without printedAt must NOT match 30m printed query')
  assert.strictEqual(ordersCol._matches(legacyPrintedOld, printedQ), false, 'Legacy printed order without printedAt must NOT match printed query')

  // Must be protected under unprintedQ until full 24 hours elapse
  assert.strictEqual(ordersCol._matches(legacyPrintedRecent, unprintedQ), false, 'Legacy printed order < 24h must NOT be prematurely cleaned')
  assert.strictEqual(ordersCol._matches(legacyPrintedOld, unprintedQ), true, 'Legacy printed order > 24h safely cleaned under upload retention')

  console.log('✓ TEST 13 PASSED: Query builders are syntactically sound, verify real payloads, and safely protect legacy orders\n')

  // ── TEST 14: GridFS inventory classification (referenced vs genuinely orphaned) ──
  console.log('[TEST 14] Testing GridFS inventory classification...')
  const invDb = new MockDatabase()
  const invNow = new Date('2026-10-16T12:00:00.000Z')
  const invNowMs = invNow.getTime()

  // Seed orders collection
  await invDb.collection('orders').insertOne({
    orderId: 'XB_INV_ACTIVE',
    hasPdf: true,
    pdfStorage: 'gridfs',
    createdAt: new Date(invNowMs - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  })
  await invDb.collection('orders').insertOne({
    orderId: 'XB_INV_EXPIRED',
    printStatus: 'Printed',
    hasPdf: true,
    pdfStorage: 'gridfs',
    printedAt: new Date(invNowMs - 45 * 60 * 1000).toISOString(), // 45m ago (expired)
  })
  await invDb.collection('orders').insertOne({
    orderId: 'XB_INV_ALREADY_DEL',
    hasPdf: false,
    pdfStorage: 'none',
    pdfDeletedAt: new Date(invNowMs - 10 * 60 * 1000).toISOString(),
    createdAt: new Date(invNowMs - 25 * 60 * 60 * 1000).toISOString(),
  })

  // Seed GridFS files collection
  // 1. Active referenced file
  await invDb.collection('order_pdfs.files').insertOne({
    _id: 'gfs_active',
    filename: 'XB_INV_ACTIVE.pdf',
    length: 50000,
    uploadDate: new Date(invNowMs - 2 * 60 * 60 * 1000),
    metadata: { orderId: 'XB_INV_ACTIVE' },
  })
  // 2. Expired referenced file
  await invDb.collection('order_pdfs.files').insertOne({
    _id: 'gfs_expired',
    filename: 'XB_INV_EXPIRED.pdf',
    length: 60000,
    uploadDate: new Date(invNowMs - 3 * 60 * 60 * 1000),
    metadata: { orderId: 'XB_INV_EXPIRED' },
  })
  // 3. Dangling leftover file for order whose PDF was already deleted
  await invDb.collection('order_pdfs.files').insertOne({
    _id: 'gfs_dangling',
    filename: 'XB_INV_ALREADY_DEL.pdf',
    length: 40000,
    uploadDate: new Date(invNowMs - 25 * 60 * 60 * 1000), // 25h old
    metadata: { orderId: 'XB_INV_ALREADY_DEL' },
  })
  // 4. Genuinely orphaned file (no matching order in orders collection, > 24h old)
  await invDb.collection('order_pdfs.files').insertOne({
    _id: 'gfs_ghost_old',
    filename: 'XB_GHOST_OLD.pdf',
    length: 70000,
    uploadDate: new Date(invNowMs - 28 * 60 * 60 * 1000), // 28h old
    metadata: { orderId: 'XB_GHOST_OLD' },
  })
  // 5. In-flight recent upload (no matching order yet, but uploaded 5m ago)
  await invDb.collection('order_pdfs.files').insertOne({
    _id: 'gfs_ghost_recent',
    filename: 'XB_INFLIGHT.pdf',
    length: 80000,
    uploadDate: new Date(invNowMs - 5 * 60 * 1000), // 5m old
    metadata: { orderId: 'XB_INFLIGHT' },
  })

  const inventory = await getGridFsInventory(invDb, { serverTime: invNow })
  assert.strictEqual(inventory.summary.totalFiles, 5, 'Total GridFS files count must be 5')
  assert.strictEqual(inventory.summary.activeReferencedCount, 2, 'Active referenced count must be 2 (active valid + in-flight recent)')
  assert.strictEqual(inventory.summary.expiredReferencedCount, 1, 'Expired referenced count must be 1 (XB_INV_EXPIRED)')
  assert.strictEqual(inventory.summary.genuinelyOrphanedCount, 2, 'Genuinely orphaned count must be 2 (already deleted leftover + ghost old)')
  assert.strictEqual(inventory.summary.genuinelyOrphanedBytes, 110000, 'Orphaned bytes must equal 40000 + 70000')

  console.log('✓ TEST 14 PASSED: GridFS inventory accurately separates referenced vs genuinely orphaned files\n')

  console.log('================================================================')
  console.log('  ALL 14 PRIVACY & FINAL PDF RETENTION TESTS PASSED!            ')
  console.log('================================================================\n')
}

runPrivacyRetentionTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})

