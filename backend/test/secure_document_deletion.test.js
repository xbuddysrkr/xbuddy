import dotenv from 'dotenv'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { Writable, Readable } from 'node:stream'

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(process.cwd(), '..', 'backend', '.env'),
  path.resolve(process.cwd(), '..', '.env'),
]
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    if (process.env.MONGODB_URI) break
  }
}

import { connectToDatabase, closeDatabaseConnection, setCachedDatabase } from '../api/_lib/mongodb.js'
import {
  savePdfToGridFS,
  hasPdfInGridFS,
  deletePdfFromGridFS,
  getGridFSBucket,
} from '../api/_lib/gridfs.js'
import {
  generateOrderDeletionSecret,
  hashOrderDeletionSecret,
  verifyOrderDeletionAuth,
  generateBoothSessionToken,
  generatePreviewToken,
} from '../api/_lib/boothAuth.js'
import { cleanupExpiredPdfs, cleanupAcknowledgedDeletionEvents } from '../api/_lib/retention.js'
import ordersHandler from '../api/orders.js'
import agentOrdersHandler from '../api/agent/orders.js'
import { purgeLocalOrderFiles } from '../print-agent/services/localServer.js'

const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.resolve(process.cwd(), '.pdf_cache')

// ── In-Memory Isolated Mock Storage for Test Safety & CI Independence ────────
class MockGridFSBucket {
  constructor(db, bucketName = 'order_pdfs') {
    this.db = db
    this.bucketName = bucketName
    this.deletedIds = []
  }

  openUploadStream(filename, options = {}) {
    const fileId = `grid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const filesCol = this.db.collection(`${this.bucketName}.files`)
    const chunksCol = this.db.collection(`${this.bucketName}.chunks`)
    const chunks = []

    const uploadStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk)
        callback()
      },
      final: async (callback) => {
        try {
          const totalBuffer = Buffer.concat(chunks)
          await filesCol.insertOne({
            _id: fileId,
            filename,
            length: totalBuffer.length,
            uploadDate: new Date(),
            contentType: options.contentType || 'application/pdf',
            metadata: options.metadata || {},
          })
          await chunksCol.insertOne({
            files_id: fileId,
            n: 0,
            data: totalBuffer,
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

function cloneDoc(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (Array.isArray(obj)) return obj.map(cloneDoc)
  const copy = {}
  for (const [k, v] of Object.entries(obj)) {
    copy[k] = cloneDoc(v)
  }
  return copy
}

class MockCollection {
  constructor(name) {
    this.name = name
    this.docs = new Map()
  }

  async insertOne(doc) {
    const _id = doc._id || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const clone = cloneDoc({ ...doc, _id })
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
    return this._project(cloneDoc(match), options?.projection)
  }

  find(filter = {}, options = {}) {
    let results = Array.from(this.docs.values()).filter(d => this._matches(d, filter))
    const cursor = {
      sort: (sortObj) => {
        if (sortObj?.createdAt) {
          results.sort((a, b) => (sortObj.createdAt === -1 ? (b.createdAt || '').localeCompare(a.createdAt || '') : (a.createdAt || '').localeCompare(b.createdAt || '')))
        }
        return cursor
      },
      limit: (n) => {
        results = results.slice(0, n)
        return cursor
      },
      toArray: async () => results.map(d => this._project(cloneDoc(d), options?.projection)),
    }
    return cursor
  }

  async updateOne(filter = {}, update = {}, options = {}) {
    const doc = await this.findOne(filter)
    if (!doc) {
      if (options?.upsert) {
        const newDoc = { ...filter }
        if (update.$set) Object.assign(newDoc, cloneDoc(update.$set))
        if (update.$setOnInsert) Object.assign(newDoc, cloneDoc(update.$setOnInsert))
        await this.insertOne(newDoc)
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    }

    const realDoc = this.docs.get(String(doc._id))
    if (update.$set) {
      Object.assign(realDoc, cloneDoc(update.$set))
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!Array.isArray(realDoc[k])) realDoc[k] = []
        realDoc[k].push(cloneDoc(v))
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        realDoc[k] = (realDoc[k] || 0) + v
      }
    }
    if (update.$addToSet) {
      for (const [k, v] of Object.entries(update.$addToSet)) {
        if (!Array.isArray(realDoc[k])) realDoc[k] = []
        if (!realDoc[k].includes(v)) {
          realDoc[k].push(cloneDoc(v))
        }
      }
    }
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async updateMany(filter = {}, update = {}) {
    let count = 0
    for (const [id, doc] of this.docs.entries()) {
      if (this._matches(doc, filter)) {
        if (update.$set) {
          Object.assign(doc, cloneDoc(update.$set))
        }
        if (update.$push) {
          for (const [k, v] of Object.entries(update.$push)) {
            if (!Array.isArray(doc[k])) doc[k] = []
            doc[k].push(cloneDoc(v))
          }
        }
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            doc[k] = (doc[k] || 0) + v
          }
        }
        if (update.$addToSet) {
          for (const [k, v] of Object.entries(update.$addToSet)) {
            if (!Array.isArray(doc[k])) doc[k] = []
            if (!doc[k].includes(v)) {
              doc[k].push(cloneDoc(v))
            }
          }
        }
        count++
      }
    }
    return { matchedCount: count, modifiedCount: count }
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    // Atomic document lock emulation: match and mutate in the same synchronous execution turn
    const all = Array.from(this.docs.values())
    const match = all.find(d => this._matches(d, filter))
    if (!match) return null

    const realDoc = this.docs.get(String(match._id))
    if (realDoc) {
      if (update.$set) {
        Object.assign(realDoc, cloneDoc(update.$set))
      }
      if (update.$push) {
        for (const [k, v] of Object.entries(update.$push)) {
          if (!Array.isArray(realDoc[k])) realDoc[k] = []
          realDoc[k].push(cloneDoc(v))
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          realDoc[k] = (realDoc[k] || 0) + v
        }
      }
      if (update.$addToSet) {
        for (const [k, v] of Object.entries(update.$addToSet)) {
          if (!Array.isArray(realDoc[k])) realDoc[k] = []
          if (!realDoc[k].includes(v)) {
            realDoc[k].push(cloneDoc(v))
          }
        }
      }
    }
    return this._project(cloneDoc(realDoc || match), options?.projection)
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

  async indexes() {
    return this._indexes || [
      { v: 2, key: { _id: 1 }, name: '_id_' },
    ]
  }

  async createIndex(keys, options = {}) {
    if (!this._indexes) {
      this._indexes = [{ v: 2, key: { _id: 1 }, name: '_id_' }]
    }
    const name = options.name || Object.keys(keys).map(k => `${k}_1`).join('_')
    const idx = { v: 2, key: keys, name, ...options }
    this._indexes.push(idx)
    return name
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
        if ('$ne' in v) {
          if (docVal === v.$ne) return false
        }
        if ('$type' in v) {
          if (v.$type === 'date') {
            if (!(docVal instanceof Date) || isNaN(docVal.getTime())) return false
          } else if (v.$type === 'string') {
            if (typeof docVal !== 'string') return false
          }
        }
        if ('$in' in v) {
          if (Array.isArray(docVal)) {
            if (!docVal.some(item => v.$in.includes(item))) return false
          } else {
            if (!v.$in.includes(docVal)) return false
          }
        }
        if ('$nin' in v) {
          if (Array.isArray(docVal)) {
            if (docVal.some(item => v.$nin.includes(item))) return false
          } else {
            if (v.$nin.includes(docVal)) return false
          }
        }
        if ('$lt' in v) {
          if (docVal === null || docVal === undefined) return false
          const a = docVal instanceof Date ? docVal.getTime() : new Date(docVal).getTime()
          const b = v.$lt instanceof Date ? v.$lt.getTime() : new Date(v.$lt).getTime()
          if (isNaN(a) || isNaN(b) || a >= b) return false
        }
        if ('$lte' in v) {
          if (docVal === null || docVal === undefined) return false
          const a = docVal instanceof Date ? docVal.getTime() : new Date(docVal).getTime()
          const b = v.$lte instanceof Date ? v.$lte.getTime() : new Date(v.$lte).getTime()
          if (isNaN(a) || isNaN(b) || a > b) return false
        }
        if ('$elemMatch' in v) {
          if (!Array.isArray(docVal)) return false
          const match = docVal.some(item => this._matches(item, v.$elemMatch))
          if (!match) return false
        }
      } else {
        if (docVal !== v) return false
      }
    }
    return true
  }

  _getNested(obj, keyPath) {
    if (!obj) return undefined
    if (!keyPath.includes('.')) return obj[keyPath]
    const parts = keyPath.split('.')
    let curr = obj
    for (const p of parts) {
      if (curr === undefined || curr === null) return undefined
      curr = curr[p]
    }
    return curr
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
    this.databaseName = 'xbuddy_isolated_mock_test'
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
    return { ok: 1 }
  }
}

function createMockReqRes({ method = 'POST', query = {}, body = {}, headers = {}, url = '/api/orders' }) {
  const req = {
    method,
    query,
    body,
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

async function runSecureDeletionTestSuite() {
  console.log('=================================================================')
  console.log('  STARTING XBUDDY SECURE USER-CONTROLLED DOCUMENT DELETION TEST  ')
  console.log('=================================================================\n')

  // ── 1. DATABASE ISOLATION & FAIL-CLOSED PRODUCTION GUARD ───────────────────
  const mockDb = new MockDatabase()
  const mockBucket = new MockGridFSBucket(mockDb)
  mockDb._mockBucket = mockBucket
  setCachedDatabase({ close: async () => {} }, mockDb)

  const { db } = await connectToDatabase()
  assert.strictEqual(db.databaseName, 'xbuddy_isolated_mock_test', 'Must strictly run against isolated mock test database')
  if (db.databaseName === 'xbuddy' && process.env.ALLOW_PROD_TESTING !== 'true') {
    throw new Error('[SECURITY_FAIL_CLOSED] Refusing to run destructive deletion tests on production database "xbuddy"!')
  }
  console.log(`[TEST_DB_ISOLATION] Strictly running in isolated test database: "${db.databaseName}"\n`)

  const ordersCol = db.collection('orders')
  const stationsCol = db.collection('stations')
  await stationsCol.insertOne({
    stationId: 'SRKR-XEROX-01',
    status: 'online',
    archived: false,
    decommissioned: false,
    lastHeartbeat: new Date().toISOString(),
  })
  const testIdsToCleanup = []

  try {
    // ── TEST 1: Creation of order returns deletionToken to the client ───────
    console.log('[TEST 1] Verifying deletionToken is generated and returned on order creation...')
    const orderId1 = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderId1)

    const { req: req1Save, res: res1Save } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderId1,
        fileName: 'project_report.pdf',
        copies: 2,
        totalPages: 5,
        amount: 23,
        printingCost: 20,
        digitalProcessingFee: 3,
        paymentStatus: 'paid',
        transactionId: 'TXN_TEST_12345',
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(req1Save, res1Save)
    assert.strictEqual(res1Save.statusCode, 200, `Order creation should return 200, got ${res1Save.statusCode}`)
    assert.ok(res1Save.bodyData?.deletionToken, 'Order creation must return deletionToken to client')
    const token1 = res1Save.bodyData.deletionToken

    // Verify deletionSecretHash is stored in database, but NOT raw deletionSecret
    const savedDoc1 = await ordersCol.findOne({ orderId: orderId1 })
    assert.ok(savedDoc1.deletionSecretHash, 'Document must store deletionSecretHash')
    assert.strictEqual(savedDoc1.deletionToken, undefined, 'Document must NEVER store raw deletionToken')
    assert.strictEqual(savedDoc1.deletionSecret, undefined, 'Document must NEVER store raw deletionSecret')
    console.log('✓ TEST 1 PASSED: Order created, deletionToken returned to student, SHA-256 hash stored in DB\n')

    // ── TEST 2: Unauthorized delete request without token fails (HTTP 401) ──
    console.log('[TEST 2] Testing deleteOrderDocument without any authorization token...')
    const { req: req2Unauth, res: res2Unauth } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1 },
    })
    await ordersHandler(req2Unauth, res2Unauth)
    assert.strictEqual(res2Unauth.statusCode, 401, `Missing token must return 401, got ${res2Unauth.statusCode}`)
    assert.strictEqual(res2Unauth.bodyData?.success, false)
    console.log('✓ TEST 2 PASSED: Anonymous deletion strictly rejected with HTTP 401\n')

    // ── TEST 3: Guessable orderId alone cannot authorize deletion (HTTP 401) ──
    console.log('[TEST 3] Testing deletion with only guessable orderId in query/body...')
    const { req: req3Guess, res: res3Guess } = createMockReqRes({
      query: { action: 'deleteOrderDocument', orderId: orderId1 },
      body: {},
    })
    await ordersHandler(req3Guess, res3Guess)
    assert.strictEqual(res3Guess.statusCode, 401, `Guessable order ID must return 401, got ${res3Guess.statusCode}`)
    console.log('✓ TEST 3 PASSED: Guessable Order ID alone cannot authorize deletion\n')

    // ── TEST 4: Student with invalid/mismatched token cannot delete (HTTP 403) ──
    console.log('[TEST 4] Testing deletion with invalid token or token belonging to another order...')
    const fakeToken = 'wrong_secret_hash_value_1234567890abcdef'
    const { req: req4Wrong, res: res4Wrong } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: fakeToken },
    })
    await ordersHandler(req4Wrong, res4Wrong)
    assert.strictEqual(res4Wrong.statusCode, 403, `Mismatched token must return 403, got ${res4Wrong.statusCode}`)
    assert.strictEqual(res4Wrong.bodyData?.success, false)
    console.log('✓ TEST 4 PASSED: Cross-order / forged deletion tokens rejected with HTTP 403\n')

    // ── Create unrelated second order to test isolation ─────────────────────
    const orderId2 = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderId2)
    const { req: req2Save, res: res2Save } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderId2,
        fileName: 'unrelated_document.pdf',
        copies: 1,
        totalPages: 2,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(req2Save, res2Save)
    assert.strictEqual(res2Save.statusCode, 200)

    // Ensure both files exist in GridFS prior to deletion
    const exists1Before = await hasPdfInGridFS(db, orderId1)
    const exists2Before = await hasPdfInGridFS(db, orderId2)
    assert.ok(exists1Before, 'Order 1 file must exist in GridFS before deletion')
    assert.ok(exists2Before, 'Order 2 file must exist in GridFS before deletion')

    // ── TEST 5: Authorized student deletes their own document ────────────────
    console.log('[TEST 5] Testing successful deletion by authorized student...')
    const { req: req5Del, res: res5Del } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: token1 },
    })
    await ordersHandler(req5Del, res5Del)
    assert.strictEqual(res5Del.statusCode, 200, `Authorized deletion must return 200, got ${res5Del.statusCode}: ${JSON.stringify(res5Del.bodyData)}`)
    assert.strictEqual(res5Del.bodyData?.success, true)
    assert.strictEqual(res5Del.bodyData?.documentDeleted, true)
    assert.strictEqual(res5Del.bodyData?.documentStorageStatus, 'deleted')
    console.log('✓ TEST 5 PASSED: Authorized deletion completed successfully with HTTP 200\n')

    // ── TEST 6: Real GridFS file and chunks are deleted ─────────────────────
    console.log('[TEST 6] Verifying physical GridFS file deletion for deleted order...')
    const exists1After = await hasPdfInGridFS(db, orderId1)
    assert.strictEqual(exists1After, false, 'GridFS file for order 1 must be permanently removed')
    console.log('✓ TEST 6 PASSED: Order 1 document permanently removed from GridFS\n')

    // ── TEST 7: Unrelated order document remains completely untouched ──────
    console.log('[TEST 7] Verifying unrelated order document is preserved in GridFS...')
    const exists2After = await hasPdfInGridFS(db, orderId2)
    assert.strictEqual(exists2After, true, 'Unrelated order 2 document must remain intact in GridFS')
    console.log('✓ TEST 7 PASSED: Unrelated orders are strictly isolated and preserved\n')

    // ── TEST 8: Order metadata and payment history preserved ────────────────
    console.log('[TEST 8] Verifying order history, financial fields, and storage flags...')
    const order1PostDel = await ordersCol.findOne({ orderId: orderId1 })
    assert.strictEqual(order1PostDel.orderId, orderId1)
    assert.strictEqual(order1PostDel.amount, 23, 'Order amount must be preserved')
    assert.strictEqual(order1PostDel.printingCost, 20, 'Printing cost must be preserved')
    assert.strictEqual(order1PostDel.digitalProcessingFee, 3, 'Digital processing fee must be preserved')
    assert.strictEqual(order1PostDel.paymentStatus, 'paid', 'Payment status must be preserved')
    assert.strictEqual(order1PostDel.transactionId, 'TXN_TEST_12345', 'Transaction reference must be preserved')
    assert.strictEqual(order1PostDel.copies, 2, 'Copies must be preserved')
    assert.strictEqual(order1PostDel.totalPages, 5, 'Total pages must be preserved')
    assert.strictEqual(order1PostDel.hasPdf, false, 'hasPdf must be set to false')
    assert.strictEqual(order1PostDel.pdfStorage, 'none', 'pdfStorage must be set to none')
    assert.strictEqual(order1PostDel.documentDeleted, true, 'documentDeleted must be set to true')
    assert.strictEqual(order1PostDel.documentStorageStatus, 'deleted', 'documentStorageStatus must be deleted')
    assert.strictEqual(order1PostDel.pdfUrl, null, 'pdfUrl must be cleared')
    assert.strictEqual(order1PostDel.fileUrl, null, 'fileUrl must be cleared')
    assert.strictEqual(order1PostDel.gridFsFileId, null, 'gridFsFileId must be cleared')
    assert.ok(order1PostDel.documentDeletedAt, 'documentDeletedAt must be an ISO timestamp')
    assert.strictEqual(order1PostDel.printStatus, 'document_deleted', 'Unprinted order status should transition to document_deleted')

    // Verify audit log
    assert.ok(Array.isArray(order1PostDel.auditLog), 'Order must have audit log')
    const deleteAudit = order1PostDel.auditLog.find(e => e.action === 'document_deleted_by_student')
    assert.ok(deleteAudit, 'Audit log must contain document_deleted_by_student event')
    console.log('✓ TEST 8 PASSED: All financial and order fields preserved; storage references cleared; audit logged\n')

    // ── TEST 9: Duplicate deletion request is safely idempotent ─────────────
    console.log('[TEST 9] Testing duplicate deletion request idempotency...')
    const { req: req9Dup, res: res9Dup } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId1, deletionToken: token1 },
    })
    await ordersHandler(req9Dup, res9Dup)
    assert.strictEqual(res9Dup.statusCode, 200, `Duplicate delete should return 200, got ${res9Dup.statusCode}`)
    assert.strictEqual(res9Dup.bodyData?.success, true)
    assert.strictEqual(res9Dup.bodyData?.idempotent, true)
    console.log('✓ TEST 9 PASSED: Duplicate deletion requests are safely idempotent\n')

    // ── TEST 10: getOrderPdf returns HTTP 410 Gone for deleted document ─────
    console.log('[TEST 10] Testing getOrderPdf on deleted document...')
    const previewToken = generatePreviewToken(orderId1)
    const { req: req10Pdf, res: res10Pdf } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderPdf', orderId: orderId1, token: previewToken },
    })
    await ordersHandler(req10Pdf, res10Pdf)
    assert.strictEqual(res10Pdf.statusCode, 410, `Deleted PDF download must return 410, got ${res10Pdf.statusCode}`)
    assert.strictEqual(res10Pdf.bodyData?.success, false)
    assert.strictEqual(res10Pdf.bodyData?.deleted, true)
    console.log('✓ TEST 10 PASSED: Download attempt on deleted document returns HTTP 410 Gone\n')

    // ── TEST 11: Active printing blocks deletion (HTTP 409 Conflict) ────────
    console.log('[TEST 11] Testing deletion while order is actively printing...')
    const orderIdPrint = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdPrint)
    const { req: reqPrintSave, res: resPrintSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdPrint,
        fileName: 'active_print.pdf',
        copies: 1,
        amount: 15,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqPrintSave, resPrintSave)
    assert.strictEqual(resPrintSave.statusCode, 200, `Save orderPrint must return 200: ${JSON.stringify(resPrintSave.bodyData)}`)
    const printToken = resPrintSave.bodyData.deletionToken

    // Set order status to 'Printing' in DB
    await ordersCol.updateOne({ orderId: orderIdPrint }, { $set: { printStatus: 'Printing' } })

    const { req: reqPrintDel, res: resPrintDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdPrint, deletionToken: printToken },
    })
    await ordersHandler(reqPrintDel, resPrintDel)
    assert.strictEqual(resPrintDel.statusCode, 409, `Deleting while printing must return 409, got ${resPrintDel.statusCode}`)
    assert.strictEqual(resPrintDel.bodyData?.conflict, true)
    console.log('✓ TEST 11 PASSED: Actively printing orders safely block deletion with HTTP 409 Conflict\n')

    // ── TEST 12: Print Agent claim on deleted order fails (HTTP 410 Gone) ───
    console.log('[TEST 12] Testing Print Agent claim on deleted order...')
    const agentKey = process.env.AGENT_SECRET_KEY || 'XB_AGENT_PROD_SECRET_KEY_SUPER_SECURE_2026'
    const { req: reqClaim, res: resClaim } = createMockReqRes({
      method: 'POST',
      url: `/api/agent/orders/${orderId1}/claim`,
      query: { route: `${orderId1}/claim` },
      headers: { 'x-agent-key': agentKey },
    })
    await agentOrdersHandler(reqClaim, resClaim)
    assert.strictEqual(resClaim.statusCode, 410, `Claim on deleted order must return 410, got ${resClaim.statusCode}`)
    assert.strictEqual(resClaim.bodyData?.documentDeleted, true)
    console.log('✓ TEST 12 PASSED: Print Agent claim on deleted order rejected with HTTP 410 Gone\n')

    // ── TEST 13: Already-printed order retains 'Printed' status on deletion ──
    console.log('[TEST 13] Testing deletion of already printed document...')
    const orderIdPrinted = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdPrinted)
    const { req: reqPrintedSave, res: resPrintedSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdPrinted,
        fileName: 'history_print.pdf',
        copies: 1,
        amount: 20,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqPrintedSave, resPrintedSave)
    assert.strictEqual(resPrintedSave.statusCode, 200, `Save orderPrinted must return 200: ${JSON.stringify(resPrintedSave.bodyData)}`)
    const printedToken = resPrintedSave.bodyData.deletionToken

    // Mark as Printed with printedAt timestamp
    await ordersCol.updateOne({ orderId: orderIdPrinted }, {
      $set: { printStatus: 'Printed', printedAt: new Date().toISOString() }
    })

    const { req: reqDelPrinted, res: resDelPrinted } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdPrinted, deletionToken: printedToken },
    })
    await ordersHandler(reqDelPrinted, resDelPrinted)
    assert.strictEqual(resDelPrinted.statusCode, 200)

    const postDelPrinted = await ordersCol.findOne({ orderId: orderIdPrinted })
    assert.strictEqual(postDelPrinted.printStatus, 'Printed', 'Printed status must be preserved for order history')
    assert.strictEqual(postDelPrinted.documentDeleted, true)
    console.log('✓ TEST 13 PASSED: Printed order preserves "Printed" printStatus while document is deleted\n')

    // ── TEST 14: Booth / station admin session override can delete ───────────
    console.log('[TEST 14] Testing station booth authorization override for deletion...')
    const boothToken = generateBoothSessionToken()
    const { req: reqBoothDel, res: resBoothDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderId2 },
      headers: { 'x-booth-session': boothToken },
    })
    await ordersHandler(reqBoothDel, resBoothDel)
    assert.strictEqual(resBoothDel.statusCode, 200, `Booth session should authorize deletion, got ${resBoothDel.statusCode}`)
    console.log('✓ TEST 14 PASSED: Station operator session override successfully authorized deletion\n')

    // ── TEST 15: Public getOrderStatus sanitization ─────────────────────────
    console.log('[TEST 15] Verifying getOrderStatus sanitizes private document references...')
    const { req: reqStatus, res: resStatus } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: orderId1 },
    })
    await ordersHandler(reqStatus, resStatus)
    assert.strictEqual(resStatus.statusCode, 200)
    assert.strictEqual(resStatus.bodyData?.order?.documentDeleted, true)
    assert.strictEqual(resStatus.bodyData?.order?.hasPdf, false)
    assert.strictEqual(resStatus.bodyData?.order?.pdfUrl, undefined)
    assert.strictEqual(resStatus.bodyData?.order?.fileUrl, undefined)
    assert.strictEqual(resStatus.bodyData?.order?.gridFsFileId, undefined)
    console.log('✓ TEST 15 PASSED: getOrderStatus response is sanitized and confirms deletion\n')

    // ── TEST 16: Bilingual translation keys check (English & Telugu) ─────────
    console.log('[TEST 16] Verifying i18n locale keys in en.js and te.js...')
    const enModule = await import('../../frontend/src/i18n/locales/en.js')
    const teModule = await import('../../frontend/src/i18n/locales/te.js')
    const en = enModule.en || enModule.default
    const te = teModule.te || teModule.default

    const enOrders = en.orders || {}
    const teOrders = te.orders || {}

    const requiredKeys = [
      'deleteDocument',
      'deletePermanently',
      'deleteModalTitle',
      'deleteModalDesc',
      'deleteModalWarning',
      'deleteCancel',
      'deleting',
      'deleteSuccessTitle',
      'deleteSuccessDesc',
      'deletedByUser',
      'deletedByUserCaption',
      'autoDeleted',
      'autoDeletedCaption',
      'deletionUnavailablePrinting',
      'deleteFailed',
    ]

    for (const key of requiredKeys) {
      assert.ok(enOrders[key], `en.js missing key: myOrders.${key}`)
      assert.ok(teOrders[key], `te.js missing key: myOrders.${key}`)
    }
    console.log('✓ TEST 16 PASSED: All 15 i18n keys present in both English and Telugu\n')

    // ── TEST 17: Simultaneous print claim and deletion race condition ───────
    console.log('[TEST 17] Testing simultaneous print claim and deletion race condition...')
    const orderIdRace = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdRace)
    const { req: reqRaceSave, res: resRaceSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdRace,
        fileName: 'race_document.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqRaceSave, resRaceSave)
    assert.strictEqual(resRaceSave.statusCode, 200)
    const raceToken = resRaceSave.bodyData.deletionToken

    // Fire simultaneous delete and agent claim
    const { req: reqRaceDel, res: resRaceDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdRace, deletionToken: raceToken },
    })
    const raceAgentKey = process.env.AGENT_SECRET_KEY || 'XB_AGENT_PROD_SECRET_KEY_SUPER_SECURE_2026'
    const { req: reqRaceClaim, res: resRaceClaim } = createMockReqRes({
      method: 'POST',
      url: `/api/agent/orders/${orderIdRace}/claim`,
      query: { route: `${orderIdRace}/claim` },
      headers: { 'x-agent-key': raceAgentKey },
    })

    await Promise.all([
      ordersHandler(reqRaceDel, resRaceDel),
      agentOrdersHandler(reqRaceClaim, resRaceClaim),
    ])

    // Verify consistency: exactly one outcome must prevail cleanly
    const raceDoc = await ordersCol.findOne({ orderId: orderIdRace })
    if (resRaceDel.statusCode === 200) {
      // Deletion won: agent claim must have failed or been blocked
      assert.strictEqual(raceDoc.documentDeleted, true, 'Document must be deleted in DB')
      assert.notStrictEqual(resRaceClaim.statusCode, 200, 'Print claim must not succeed when deletion won')
      console.log('  -> Deletion reserved first: agent claim correctly rejected/blocked')
    } else {
      // Print claim won: deletion must have returned 409 Conflict (physical print protection)
      assert.strictEqual(resRaceDel.statusCode, 409, 'Deletion must return 409 when order is Printing')
      assert.strictEqual(raceDoc.printStatus, 'Printing', 'Order must be in Printing state')
      console.log('  -> Print claim reserved first: deletion safely rejected with 409 Conflict')
    }
    console.log('✓ TEST 17 PASSED: Simultaneous print claim and deletion race condition verified safe\n')

    // ── TEST 18: Print Station local file purge test (purgeLocalOrderFiles) ─
    console.log('[TEST 18] Testing Print Station local cache and pending directory file purge...')
    const downloadsDir = path.resolve(process.cwd(), 'backend', 'print-agent', 'downloads')
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true })
    const dummyPdf = path.join(downloadsDir, `${orderIdRace}.pdf`)
    const dummyB64 = path.join(downloadsDir, `${orderIdRace}_pending.b64`)
    fs.writeFileSync(dummyPdf, 'DUMMY_PDF_CONTENT')
    fs.writeFileSync(dummyB64, 'DUMMY_BASE64_CONTENT')
    assert.ok(fs.existsSync(dummyPdf), 'Dummy download file must exist before purge')

    const purgedCount = purgeLocalOrderFiles(orderIdRace)
    assert.ok(purgedCount >= 2, `purgeLocalOrderFiles must unlink local files (purged: ${purgedCount})`)
    assert.strictEqual(fs.existsSync(dummyPdf), false, 'Dummy PDF must be unlinked')
    assert.strictEqual(fs.existsSync(dummyB64), false, 'Dummy B64 must be unlinked')
    console.log('✓ TEST 18 PASSED: Local Print Station cached files completely purged\n')

    // ── TEST 19: Booth print release blocked when deletion is pending or deleted ──
    console.log('[TEST 19] Testing booth release blocked when deletion pending or deleted...')
    const orderIdBooth = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdBooth)
    const { req: reqBoothSave, res: resBoothSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdBooth,
        fileName: 'booth_guard.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqBoothSave, resBoothSave)
    assert.strictEqual(resBoothSave.statusCode, 200)

    // Mark documentDeletionPending: true in DB
    await ordersCol.updateOne({ orderId: orderIdBooth }, { $set: { documentDeletionPending: true } })

    const { req: reqBoothRelease, res: resBoothRelease } = createMockReqRes({
      query: { action: 'updateOrderStatus' },
      body: { orderId: orderIdBooth, printStatus: 'Printing' },
      headers: { 'x-booth-token': generateBoothSessionToken() },
    })
    await ordersHandler(reqBoothRelease, resBoothRelease)
    assert.strictEqual(resBoothRelease.statusCode, 410, `Booth release must return 410 when deletion pending, got ${resBoothRelease.statusCode}`)
    assert.strictEqual(resBoothRelease.bodyData?.documentDeletionPending, true)
    console.log('✓ TEST 19 PASSED: Booth release is strictly blocked during document deletion\n')

    // ── TEST 20: Midway storage failure recovery test ───────────────────────
    console.log('[TEST 20] Testing stale deletion reservation recovery and retry mechanism...')
    const orderIdRecover = `XB98${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdRecover)
    const { req: reqRecSave, res: resRecSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdRecover,
        fileName: 'recover_test.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqRecSave, resRecSave)
    assert.strictEqual(resRecSave.statusCode, 200)
    const recToken = resRecSave.bodyData.deletionToken

    // Simulate stale reservation from a crashed worker 90 seconds ago
    const staleTime = new Date(Date.now() - 90000).toISOString()
    await ordersCol.updateOne({ orderId: orderIdRecover }, {
      $set: { documentDeletionPending: true, documentDeletionPendingAt: staleTime }
    })

    // Student retries deletion with their token
    const { req: reqRetryDel, res: resRetryDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdRecover, deletionToken: recToken },
    })
    await ordersHandler(reqRetryDel, resRetryDel)
    assert.strictEqual(resRetryDel.statusCode, 200, `Stale reservation recovery must succeed with 200, got ${resRetryDel.statusCode}`)
    assert.strictEqual(resRetryDel.bodyData?.documentDeleted, true)

    const finalRecDoc = await ordersCol.findOne({ orderId: orderIdRecover })
    assert.strictEqual(finalRecDoc.documentDeleted, true)
    assert.strictEqual(finalRecDoc.documentDeletionPending, false)
    console.log('✓ TEST 20 PASSED: Stale reservation recovered and document deletion completed cleanly\n')

    // ── TEST 21: Mobile Deletion Creates Durable Cloud Deletion Event ─────────
    console.log('[TEST 21] Testing mobile deletion: creates durable cloud event and sets stationCleanupPending...')
    const orderIdMob = `XB81${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdMob)
    const { req: reqMobSave, res: resMobSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdMob,
        fileName: 'mobile_doc.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqMobSave, resMobSave)
    assert.strictEqual(resMobSave.statusCode, 200)
    const mobToken = resMobSave.bodyData.deletionToken

    // Student executes deletion from mobile phone (simulated via API call)
    const { req: reqMobDel, res: resMobDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdMob, deletionToken: mobToken },
    })
    await ordersHandler(reqMobDel, resMobDel)
    assert.strictEqual(resMobDel.statusCode, 200)
    assert.strictEqual(resMobDel.bodyData?.documentDeleted, true)
    assert.strictEqual(resMobDel.bodyData?.stationCleanupPending, true, 'stationCleanupPending must be true immediately after mobile deletion')
    assert.ok(resMobDel.bodyData?.deletionEventId, 'Response must return durable deletionEventId')

    // Verify durable event recorded in deletion_events collection
    const eventsCol = mockDb.collection('deletion_events')
    const recordedEvent = await eventsCol.findOne({ orderId: orderIdMob })
    assert.ok(recordedEvent, 'Durable deletion event must exist in deletion_events collection')
    assert.strictEqual(recordedEvent.status, 'pending')
    assert.strictEqual(recordedEvent.orderId, orderIdMob)
    console.log('✓ TEST 21 PASSED: Mobile deletion creates durable cloud event and sets stationCleanupPending: true\n')

    // ── TEST 22: Station Polling Authentication & Privacy Strictness ──────────
    console.log('[TEST 22] Testing station agent authenticated polling and privacy guarantees...')
    const agentSecret = process.env.AGENT_SECRET_KEY || 'xbuddy-agent-secret-key-srkr-2025'

    // 22a: Unauthenticated poll rejected with 401
    const { req: reqUnauthPoll, res: resUnauthPoll } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events',
      headers: { 'x-agent-key': 'invalid-secret-key' },
    })
    await agentOrdersHandler(reqUnauthPoll, resUnauthPoll)
    assert.strictEqual(resUnauthPoll.statusCode, 401, 'Polling with invalid key must return 401')

    // 22b: Authenticated poll returns pending events
    const { req: reqAuthPoll, res: resAuthPoll } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events',
      headers: { 'x-agent-key': agentSecret },
    })
    await agentOrdersHandler(reqAuthPoll, resAuthPoll)
    assert.strictEqual(resAuthPoll.statusCode, 200)
    assert.ok(Array.isArray(resAuthPoll.bodyData?.events))
    const mobEventInList = resAuthPoll.bodyData.events.find(e => e.orderId === orderIdMob)
    assert.ok(mobEventInList, 'Pending event for mobile order must be in polling response')

    // 22c: STRICT PRIVACY VERIFICATION: No private student data exposed
    assert.strictEqual(typeof mobEventInList.eventId, 'string')
    assert.strictEqual(mobEventInList.orderId, orderIdMob)
    assert.ok(mobEventInList.deletedAt)
    assert.strictEqual(mobEventInList.deletionToken, undefined, 'deletionToken MUST NOT be exposed in polling event')
    assert.strictEqual(mobEventInList.deletionSecretHash, undefined, 'deletionSecretHash MUST NOT be exposed')
    assert.strictEqual(mobEventInList.studentName, undefined, 'Student name MUST NOT be exposed')
    assert.strictEqual(mobEventInList.phoneNumber, undefined, 'Phone number MUST NOT be exposed')
    assert.strictEqual(mobEventInList.pdfBase64, undefined, 'File data MUST NOT be exposed')
    assert.strictEqual(mobEventInList.pdfUrl, undefined, 'File URL MUST NOT be exposed')
    console.log('✓ TEST 22 PASSED: Agent polling is authenticated and exposes zero student personal info\n')

    // ── TEST 23: Station Cache Purge and Successful Cloud Acknowledgement ─────
    console.log('[TEST 23] Testing local station cache purge and cloud acknowledgement...')
    // Setup simulated cached local file in station downloads directory
    const stationDownloadsDir = path.resolve(process.cwd(), 'backend', 'print-agent', 'downloads')
    if (!fs.existsSync(stationDownloadsDir)) fs.mkdirSync(stationDownloadsDir, { recursive: true })
    const localCachedPdf = path.join(stationDownloadsDir, `${orderIdMob}.pdf`)
    fs.writeFileSync(localCachedPdf, 'SIMULATED_LOCAL_CACHE')
    assert.strictEqual(fs.existsSync(localCachedPdf), true, 'Simulated local cache file must exist before purge')

    // Station executes purgeLocalOrderFiles
    const mobPurgedCount = purgeLocalOrderFiles(orderIdMob)
    assert.ok(mobPurgedCount >= 1, `purgeLocalOrderFiles must remove at least 1 file (removed ${mobPurgedCount})`)
    assert.strictEqual(fs.existsSync(localCachedPdf), false, 'Local cached file must be unlinked')

    // Station acknowledges the event
    const { req: reqAck, res: resAck } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: {
        eventId: recordedEvent.eventId,
        orderId: orderIdMob,
        stationId: 'SRKR-XEROX-01',
      },
    })
    await agentOrdersHandler(reqAck, resAck)
    assert.strictEqual(resAck.statusCode, 200)
    assert.strictEqual(resAck.bodyData?.acknowledged, true)

    // Verify DB update: event acknowledged and order stationCleanupPending cleared
    const updatedEvent = await eventsCol.findOne({ eventId: recordedEvent.eventId })
    assert.ok(['acknowledged', 'completed'].includes(updatedEvent.status))
    assert.strictEqual(updatedEvent.allStationsAcknowledged, true)
    assert.ok(updatedEvent.acknowledgedAt)

    const updatedOrder = await ordersCol.findOne({ orderId: orderIdMob })
    assert.strictEqual(updatedOrder.stationCleanupPending, false)
    assert.ok(updatedOrder.stationCleanedAt)

    // Verify student status query reflects confirmed removal of stored copies
    const { req: reqStatusCheck, res: resStatusCheck } = createMockReqRes({
      method: 'GET',
      query: { action: 'getOrderStatus', orderId: orderIdMob },
      url: `/api/orders?action=getOrderStatus&orderId=${orderIdMob}`,
    })
    await ordersHandler(reqStatusCheck, resStatusCheck)
    assert.strictEqual(resStatusCheck.statusCode, 200)
    assert.strictEqual(resStatusCheck.bodyData?.order?.stationCleanupPending, false)
    assert.ok(resStatusCheck.bodyData?.order?.stationCleanedAt)
    console.log('✓ TEST 23 PASSED: Station cache purged and cloud deletion event successfully acknowledged\n')

    // ── TEST 24: Deletion While Print Station is Offline ──────────────────────
    console.log('[TEST 24] Testing deletion while Print Station is offline, surviving until reconnect...')
    const orderIdOff = `XB82${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdOff)
    const { req: reqOffSave, res: resOffSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdOff,
        fileName: 'offline_station.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqOffSave, resOffSave)
    const offToken = resOffSave.bodyData.deletionToken

    // Student deletes while station is offline (no polling happening)
    const { req: reqOffDel, res: resOffDel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdOff, deletionToken: offToken },
    })
    await ordersHandler(reqOffDel, resOffDel)
    assert.strictEqual(resOffDel.statusCode, 200)

    // Verify event remains pending in cloud while station is offline
    const offEvent = await eventsCol.findOne({ orderId: orderIdOff })
    assert.strictEqual(offEvent.status, 'pending')

    // Station reconnects later: polls pending events and receives offline event
    const { req: reqReconnectPoll, res: resReconnectPoll } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events',
      headers: { 'x-agent-key': agentSecret },
    })
    await agentOrdersHandler(reqReconnectPoll, resReconnectPoll)
    const receivedOffEvent = resReconnectPoll.bodyData?.events?.find(e => e.orderId === orderIdOff)
    assert.ok(receivedOffEvent, 'Offline deletion event must be delivered once station reconnects')

    // Station processes and acks upon reconnection
    const { req: reqOffAck, res: resOffAck } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: { eventId: offEvent.eventId, orderId: orderIdOff, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqOffAck, resOffAck)
    assert.strictEqual(resOffAck.statusCode, 200)

    const finalOffEvent = await eventsCol.findOne({ orderId: orderIdOff })
    assert.ok(['acknowledged', 'completed'].includes(finalOffEvent.status))
    assert.strictEqual(finalOffEvent.allStationsAcknowledged, true)
    console.log('✓ TEST 24 PASSED: Deletion survives station offline state and purges upon reconnect\n')

    // ── TEST 25: Duplicate Event Delivery & Idempotent Processing ─────────────
    console.log('[TEST 25] Testing duplicate event delivery and idempotent acknowledgement...')
    // Re-sending ack for already acknowledged event (e.g., network retry)
    const { req: reqDupAck, res: resDupAck } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: { eventId: offEvent.eventId, orderId: orderIdOff, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqDupAck, resDupAck)
    assert.strictEqual(resDupAck.statusCode, 200, 'Duplicate ack must return 200 idempotently')
    assert.strictEqual(resDupAck.bodyData?.acknowledged, true)

    // Re-purging already purged local files is safe and returns 0
    const secondPurgeCount = purgeLocalOrderFiles(orderIdOff)
    assert.strictEqual(secondPurgeCount, 0, 'Second purge on already removed files must safely return 0')
    console.log('✓ TEST 25 PASSED: Duplicate event delivery and processing is strictly idempotent\n')

    // ── TEST 26: Failed Cache Deletion and Retry Resilience ───────────────────
    console.log('[TEST 26] Testing failed station cleanup retry resilience...')
    const orderIdRetry = `XB83${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdRetry)
    const { req: reqRtySave, res: resRtySave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdRetry,
        fileName: 'retry_station.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqRtySave, resRtySave)
    const rtyToken = resRtySave.bodyData.deletionToken

    // Delete order
    await ordersHandler(
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdRetry, deletionToken: rtyToken } }).req,
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdRetry, deletionToken: rtyToken } }).res
    )

    // Simulate poll cycle 1: agent receives event but fails to ack (network drop)
    const { req: reqPoll1, res: resPoll1 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events',
      headers: { 'x-agent-key': agentSecret },
    })
    await agentOrdersHandler(reqPoll1, resPoll1)
    const rtyEvent1 = resPoll1.bodyData.events.find(e => e.orderId === orderIdRetry)
    assert.ok(rtyEvent1)
    // No ack sent (simulating network drop / crash)

    // Simulate poll cycle 2: event must still be returned since it was not acknowledged
    const { req: reqPoll2, res: resPoll2 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events',
      headers: { 'x-agent-key': agentSecret },
    })
    await agentOrdersHandler(reqPoll2, resPoll2)
    const rtyEvent2 = resPoll2.bodyData.events.find(e => e.orderId === orderIdRetry)
    assert.ok(rtyEvent2, 'Unacknowledged event must remain pending for next poll attempt')

    // Now ack succeeds on retry
    const { req: reqRetryAck, res: resRetryAck } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: { eventId: rtyEvent2.eventId, orderId: orderIdRetry, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqRetryAck, resRetryAck)
    assert.strictEqual(resRetryAck.statusCode, 200)
    console.log('✓ TEST 26 PASSED: Failed acknowledgement retried safely on subsequent poll cycle\n')

    // ── TEST 27: Multiple Independent Print Stations ─────────────────────────
    console.log('[TEST 27] Testing multiple independent print stations handling events...')
    const orderIdMulti = `XB84${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdMulti)
    const { req: reqMltSave, res: resMltSave } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdMulti,
        fileName: 'multi_station.pdf',
        copies: 1,
        amount: 10,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqMltSave, resMltSave)
    const mltToken = resMltSave.bodyData.deletionToken

    // Delete order
    await ordersHandler(
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdMulti, deletionToken: mltToken } }).req,
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdMulti, deletionToken: mltToken } }).res
    )

    // Station A (SRKR-XEROX-01) polls for pending events
    const { req: reqPollA, res: resPollA } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      query: { stationId: 'SRKR-XEROX-01' },
      headers: { 'x-agent-key': agentSecret, 'x-station-id': 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqPollA, resPollA)
    const eventForMulti = resPollA.bodyData.events.find(e => e.orderId === orderIdMulti)
    assert.ok(eventForMulti, 'Station A must receive pending deletion event')

    // Station A purges local cache and acknowledges
    purgeLocalOrderFiles(orderIdMulti)
    const { req: reqAckA, res: resAckA } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: { eventId: eventForMulti.eventId, orderId: orderIdMulti, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqAckA, resAckA)
    assert.strictEqual(resAckA.statusCode, 200)

    // Station A polls again: must NOT receive the already acknowledged event
    const { req: reqPollA2, res: resPollA2 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      query: { stationId: 'SRKR-XEROX-01' },
      headers: { 'x-agent-key': agentSecret, 'x-station-id': 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqPollA2, resPollA2)
    const eventA2 = (resPollA2.bodyData.events || []).find(e => e.orderId === orderIdMulti)
    assert.strictEqual(eventA2, undefined, 'Station A must not receive already acknowledged event')

    // Station B (SRKR-XEROX-02) polls: MUST STILL receive event despite Station A having acknowledged!
    const { req: reqPollB, res: resPollB } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': agentSecret, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqPollB, resPollB)
    const eventForMultiB = resPollB.bodyData.events.find(e => e.orderId === orderIdMulti)
    assert.ok(eventForMultiB, 'Station B must still receive event even after Station A has acknowledged')

    // Station B purges its own local files and acknowledges
    purgeLocalOrderFiles(orderIdMulti)
    const { req: reqAckB, res: resAckB } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': agentSecret },
      body: { eventId: eventForMulti.eventId, orderId: orderIdMulti, stationId: 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqAckB, resAckB)
    assert.strictEqual(resAckB.statusCode, 200)

    // Station B polls again: must NOT receive the already acknowledged event
    const { req: reqPollB2, res: resPollB2 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': agentSecret, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqPollB2, resPollB2)
    const eventB2 = (resPollB2.bodyData.events || []).find(e => e.orderId === orderIdMulti)
    assert.strictEqual(eventB2, undefined, 'Station B must not receive already acknowledged event')

    // Verify in MongoDB: event recorded both stations in acknowledgedStations
    const finalMultiEvent = await eventsCol.findOne({ eventId: eventForMulti.eventId })
    assert.ok(finalMultiEvent.acknowledgedStations.includes('SRKR-XEROX-01'))
    assert.ok(finalMultiEvent.acknowledgedStations.includes('SRKR-XEROX-02'))
    console.log('✓ TEST 27 PASSED: Multiple independent print stations receive and acknowledge events independently without interference\n')

    // ── TEST 28: Strict Prevention of Printing, Claiming, or Restoring ────────
    console.log('[TEST 28] Testing absolute lockdown: deleted document cannot be claimed, released, or reprinted...')
    // Attempt agent print claim on deleted order
    const { req: reqClaimDel, res: resClaimDel } = createMockReqRes({
      method: 'POST',
      url: `/api/agent/orders/${orderIdMulti}/claim`,
      headers: { 'x-agent-key': agentSecret },
    })
    await agentOrdersHandler(reqClaimDel, resClaimDel)
    assert.strictEqual(resClaimDel.statusCode, 410, `Claim on deleted document must return 410, got ${resClaimDel.statusCode}`)
    assert.strictEqual(resClaimDel.bodyData?.documentDeleted, true)

    // Attempt booth release
    const { req: reqBoothLock, res: resBoothLock } = createMockReqRes({
      query: { action: 'updateOrderStatus' },
      body: { orderId: orderIdMulti, printStatus: 'Printing' },
      headers: { 'x-booth-token': generateBoothSessionToken() },
    })
    await ordersHandler(reqBoothLock, resBoothLock)
    assert.strictEqual(resBoothLock.statusCode, 410)

    // Attempt student reprint
    const { req: reqReprintDel, res: resReprintDel } = createMockReqRes({
      query: { action: 'reprintOrder' },
      body: { orderId: orderIdMulti, reprintPin: '1234' },
      headers: { 'x-booth-token': generateBoothSessionToken() },
    })
    await ordersHandler(reqReprintDel, resReprintDel)
    assert.strictEqual(resReprintDel.bodyData?.success, false, 'Reprint on deleted document must be rejected')
    assert.ok([400, 410].includes(resReprintDel.statusCode), `Reprint status must be 400 or 410, got ${resReprintDel.statusCode}`)

    // Attempt student re-deletion (already deleted, returns idempotent success)
    const { req: reqRedel, res: resRedel } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdMulti, deletionToken: mltToken },
    })
    await ordersHandler(reqRedel, resRedel)
    assert.strictEqual(resRedel.statusCode, 200)
    assert.strictEqual(resRedel.bodyData?.documentDeleted, true)
    console.log('✓ TEST 28 PASSED: Deleted document is permanently locked against printing, claiming, release, or re-download\n')

    // ── TEST 29: 7-Day TTL Policy for Acknowledged Deletion Events Only ───────
    console.log('[TEST 29] Testing 7-day TTL policy for acknowledged events; pending events strictly preserved...')
    const eightDaysAgoIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const tenDaysAgoIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    // 1. Acknowledged event from 8 days ago (should be purged by 7-day policy because all stations acknowledged)
    await eventsCol.insertOne({
      eventId: 'dev_old_ack_8d',
      orderId: 'XB890001',
      status: 'acknowledged',
      acknowledgedStations: ['SRKR-XEROX-01'],
      allStationsAcknowledged: true,
      acknowledgedAt: eightDaysAgoIso,
      acknowledgedAtDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      createdAt: eightDaysAgoIso,
    })

    // 2. Acknowledged event from 2 days ago (should be preserved)
    await eventsCol.insertOne({
      eventId: 'dev_recent_ack_2d',
      orderId: 'XB890002',
      status: 'acknowledged',
      acknowledgedStations: ['SRKR-XEROX-01'],
      acknowledgedAt: twoDaysAgoIso,
      acknowledgedAtDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdAt: twoDaysAgoIso,
    })

    // 3. Pending event from 10 days ago (MUST NEVER EXPIRE AUTOMATICALLY!)
    await eventsCol.insertOne({
      eventId: 'dev_stale_pending_10d',
      orderId: 'XB890003',
      status: 'pending',
      acknowledgedStations: [],
      acknowledgedAt: null,
      createdAt: tenDaysAgoIso,
    })

    // Run the 7-day TTL cleanup job
    const ttlCleanupResult = await cleanupAcknowledgedDeletionEvents(mockDb)
    assert.strictEqual(ttlCleanupResult.success, true)
    assert.strictEqual(ttlCleanupResult.cleanedCount, 1, 'Exactly 1 stale acknowledged event should be purged')

    // Verify: 8-day acknowledged event purged
    const oldAck = await eventsCol.findOne({ eventId: 'dev_old_ack_8d' })
    assert.strictEqual(oldAck, null, '8-day old acknowledged event must be purged')

    // Verify: 2-day acknowledged event preserved
    const recentAck = await eventsCol.findOne({ eventId: 'dev_recent_ack_2d' })
    assert.ok(recentAck, '2-day old acknowledged event must be preserved')

    // Verify: 10-day pending event STRICTLY PRESERVED
    const stalePending = await eventsCol.findOne({ eventId: 'dev_stale_pending_10d' })
    assert.ok(stalePending, 'Stale pending event must NEVER be expired or pruned automatically')
    assert.strictEqual(stalePending.status, 'pending')

    // Verify order and financial records are completely untouched
    const sampleOrder = await ordersCol.findOne({ orderId: orderIdMulti })
    assert.ok(sampleOrder, 'Order record must remain intact')
    assert.strictEqual(sampleOrder.amount, 10, 'Financial amount must remain untouched')
    assert.strictEqual(sampleOrder.documentDeleted, true, 'Deletion status remains recorded')
    console.log('✓ TEST 29 PASSED: 7-day TTL policy purges stale acknowledged events while strictly protecting pending events and order history\n')

    // ── TEST 30: Station Identity Binding & Impersonation Prevention ─────────
    console.log('[TEST 30] Testing station identity binding: stations cannot impersonate other stations...')
    const station01Key = 'agent-key-station-01-secure-secret'
    const station02Key = 'agent-key-station-02-secure-secret'
    process.env.AGENT_KEY_SRKR_XEROX_01 = station01Key
    process.env.AGENT_KEY_SRKR_XEROX_02 = station02Key
    process.env.AGENT_SECRET_KEYS = `${agentSecret},${station01Key},${station02Key}`

    // 1. Station A attempts to poll events claiming to be Station B (SRKR-XEROX-02)
    const { req: reqImpersonatePoll, res: resImpersonatePoll } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqImpersonatePoll, resImpersonatePoll)
    assert.strictEqual(resImpersonatePoll.statusCode, 403, 'Station A impersonating Station B on poll must return 403 Forbidden')
    assert.strictEqual(resImpersonatePoll.bodyData?.success, false)

    // 2. Station A attempts to ack an event on behalf of Station B (SRKR-XEROX-02)
    const { req: reqImpersonateAck, res: resImpersonateAck } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-02' },
      body: { eventId: 'dev_some_event', orderId: orderIdMulti, stationId: 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqImpersonateAck, resImpersonateAck)
    assert.strictEqual(resImpersonateAck.statusCode, 403, 'Station A impersonating Station B on ack must return 403 Forbidden')

    // 3. Station A polls with legitimate Station A identity -> succeeds
    const { req: reqLegitPollA, res: resLegitPollA } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      query: { stationId: 'SRKR-XEROX-01' },
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqLegitPollA, resLegitPollA)
    assert.strictEqual(resLegitPollA.statusCode, 200, 'Station A with legitimate credentials must succeed')
    assert.strictEqual(resLegitPollA.bodyData?.stationId, 'SRKR-XEROX-01')

    // 4. Station B polls with legitimate Station B identity -> succeeds
    const { req: reqLegitPollB, res: resLegitPollB } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqLegitPollB, resLegitPollB)
    assert.strictEqual(resLegitPollB.statusCode, 200, 'Station B with legitimate credentials must succeed')
    assert.strictEqual(resLegitPollB.bodyData?.stationId, 'SRKR-XEROX-02')

    // 5. Unauthenticated / invalid key rejected with 401
    const { req: reqInvalidKey, res: resInvalidKey } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      headers: { 'x-agent-key': 'bogus-invalid-key-xyz' },
    })
    await agentOrdersHandler(reqInvalidKey, resInvalidKey)
    assert.strictEqual(resInvalidKey.statusCode, 401, 'Invalid agent key must be rejected with 401')
    console.log('✓ TEST 30 PASSED: Station identity is bound to credentials; unauthorized station impersonation strictly blocked with 403\n')

    // ── TEST 31: Critical 8-Day Offline Scenario with Global Completion ────────
    console.log('[TEST 31] Testing critical 8-day offline scenario: Station B offline for 8 days, event preserved, purges on reconnect...')
    const stationsCol = db.collection('stations')
    // 1. Both Station A and Station B are registered in stations collection
    await stationsCol.updateOne(
      { stationId: 'SRKR-XEROX-01' },
      { $set: { stationId: 'SRKR-XEROX-01', status: 'online', updatedAt: new Date().toISOString() } },
      { upsert: true }
    )
    await stationsCol.updateOne(
      { stationId: 'SRKR-XEROX-02' },
      { $set: { stationId: 'SRKR-XEROX-02', status: 'online', updatedAt: new Date().toISOString() } },
      { upsert: true }
    )

    // 2. Student uploads and orders document
    const orderIdOffline8d = `XB85${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdOffline8d)
    const { req: reqSave8d, res: resSave8d } = createMockReqRes({
      body: {
        action: 'saveOrder',
        orderId: orderIdOffline8d,
        fileName: 'offline_8d_test.pdf',
        copies: 2,
        amount: 20,
        pdfBase64: SAMPLE_BASE64,
      },
    })
    await ordersHandler(reqSave8d, resSave8d)
    const token8d = resSave8d.bodyData.deletionToken

    // Create local cached copy on Station A to verify purge
    const testDownloadsDir = path.resolve(process.cwd(), 'backend', 'print-agent', 'downloads')
    if (!fs.existsSync(testDownloadsDir)) fs.mkdirSync(testDownloadsDir, { recursive: true })
    const stationAFilePath = path.join(testDownloadsDir, `${orderIdOffline8d}.pdf`)
    fs.writeFileSync(stationAFilePath, 'simulated-station-a-pdf-bytes')
    assert.ok(fs.existsSync(stationAFilePath), 'Station A local file must exist before test')

    // 3. Student requests document deletion
    const { req: reqDel8d, res: resDel8d } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdOffline8d, deletionToken: token8d },
    })
    await ordersHandler(reqDel8d, resDel8d)
    assert.strictEqual(resDel8d.statusCode, 200)

    // 4. Verify initial deletion event: requiredStations contains BOTH registered stations
    const initial8dEvent = await eventsCol.findOne({ orderId: orderIdOffline8d })
    assert.ok(initial8dEvent, 'Deletion event must be durably recorded')
    assert.strictEqual(initial8dEvent.status, 'pending')
    assert.ok(initial8dEvent.requiredStations.includes('SRKR-XEROX-01'))
    assert.ok(initial8dEvent.requiredStations.includes('SRKR-XEROX-02'))
    assert.strictEqual(initial8dEvent.allStationsAcknowledged, false)
    assert.strictEqual(initial8dEvent.completedAtDate, null, 'completedAtDate must be null while uncompleted')

    // 5. Station A receives event and acknowledges
    const { req: reqPollA8d, res: resPollA8d } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      query: { stationId: 'SRKR-XEROX-01' },
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqPollA8d, resPollA8d)
    const eventForA = (resPollA8d.bodyData?.events || []).find(e => e.orderId === orderIdOffline8d)
    assert.ok(eventForA, 'Station A must receive pending deletion event')

    // Station A purges local file and acks
    const purgedA = purgeLocalOrderFiles(orderIdOffline8d)
    assert.ok(purgedA >= 1, 'Station A must purge its local files')
    assert.strictEqual(fs.existsSync(stationAFilePath), false, 'Station A local file must be gone')

    const { req: reqAckA8d, res: resAckA8d } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
      body: { eventId: initial8dEvent.eventId, orderId: orderIdOffline8d, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqAckA8d, resAckA8d)
    assert.strictEqual(resAckA8d.statusCode, 200)
    assert.strictEqual(resAckA8d.bodyData?.status, 'partially_acknowledged', 'Status must be partially_acknowledged while Station B is unacknowledged')
    assert.strictEqual(resAckA8d.bodyData?.allStationsAcknowledged, false)

    // Verify DB state: partially acknowledged, completedAtDate remains strictly null
    const mid8dEvent = await eventsCol.findOne({ eventId: initial8dEvent.eventId })
    assert.strictEqual(mid8dEvent.status, 'partially_acknowledged')
    assert.deepStrictEqual(mid8dEvent.acknowledgedStations, ['SRKR-XEROX-01'])
    assert.strictEqual(mid8dEvent.allStationsAcknowledged, false)
    assert.strictEqual(mid8dEvent.completedAtDate, null, 'TTL completedAtDate MUST NOT be set on partial acknowledgement')

    // Station A polls again: MUST NOT receive event again
    const { req: reqPollA8d2, res: resPollA8d2 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-01',
      query: { stationId: 'SRKR-XEROX-01' },
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqPollA8d2, resPollA8d2)
    const eventA8d2 = (resPollA8d2.bodyData?.events || []).find(e => e.orderId === orderIdOffline8d)
    assert.strictEqual(eventA8d2, undefined, 'Station A must not receive already acknowledged event')

    // 6. Station B remains offline. Simulate 8 days passing!
    const backdate8dIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    await eventsCol.updateOne(
      { eventId: initial8dEvent.eventId },
      {
        $set: {
          createdAt: backdate8dIso,
          deletedAt: backdate8dIso,
          lastAcknowledgedAt: backdate8dIso,
        },
      }
    )

    // Run the 7-day TTL cleanup retention job during offline period
    const cleanupDuringOffline = await cleanupAcknowledgedDeletionEvents(db)
    assert.strictEqual(cleanupDuringOffline.success, true)

    // 7. Verify the event WAS NOT DELETED because Station B had not acknowledged!
    const preservedEvent = await eventsCol.findOne({ eventId: initial8dEvent.eventId })
    assert.ok(preservedEvent, 'Event MUST NOT be expired or deleted while Station B remains unacknowledged, even after 8 days!')
    assert.strictEqual(preservedEvent.status, 'partially_acknowledged')

    // 8. Reconnect Station B on Day 8: Station B polls cloud
    const { req: reqPollB8d, res: resPollB8d } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqPollB8d, resPollB8d)
    assert.strictEqual(resPollB8d.statusCode, 200)
    const eventForB = (resPollB8d.bodyData?.events || []).find(e => e.orderId === orderIdOffline8d)
    assert.ok(eventForB, 'Station B MUST receive the deletion event upon reconnecting on Day 8')

    // Station B purges its local cache (simulating Station B's independent local filesystem)
    const stationBFilePath = path.join(testDownloadsDir, `${orderIdOffline8d}.pdf`)
    fs.writeFileSync(stationBFilePath, 'simulated-station-b-pdf-bytes')
    assert.ok(fs.existsSync(stationBFilePath), 'Station B file must exist before purge')
    const purgedB = purgeLocalOrderFiles(orderIdOffline8d)
    assert.ok(purgedB >= 1, 'Station B must purge its local files')
    assert.strictEqual(fs.existsSync(stationBFilePath), false, 'Station B local file must be purged')

    // Station B acknowledges event
    const { req: reqAckB8d, res: resAckB8d } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
      body: { eventId: initial8dEvent.eventId, orderId: orderIdOffline8d, stationId: 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqAckB8d, resAckB8d)
    assert.strictEqual(resAckB8d.statusCode, 200)
    assert.strictEqual(resAckB8d.bodyData?.status, 'completed', 'Status must transition to "completed" once all stations have acknowledged')
    assert.strictEqual(resAckB8d.bodyData?.allStationsAcknowledged, true)

    // 9. Verify event is now globally complete: TTL clock starts NOW
    const finalCompletedEvent = await eventsCol.findOne({ eventId: initial8dEvent.eventId })
    assert.strictEqual(finalCompletedEvent.status, 'completed')
    assert.strictEqual(finalCompletedEvent.allStationsAcknowledged, true)
    assert.ok(finalCompletedEvent.completedAtDate instanceof Date, 'completedAtDate must be a real MongoDB Date')
    assert.ok(finalCompletedEvent.acknowledgedStations.includes('SRKR-XEROX-01'))
    assert.ok(finalCompletedEvent.acknowledgedStations.includes('SRKR-XEROX-02'))

    // 10. Verify order stationCleanupPending is now false
    const finalOrder8d = await ordersCol.findOne({ orderId: orderIdOffline8d })
    assert.strictEqual(finalOrder8d.stationCleanupPending, false)
    assert.ok(finalOrder8d.cleanedByStations.includes('SRKR-XEROX-01'))
    assert.ok(finalOrder8d.cleanedByStations.includes('SRKR-XEROX-02'))
    assert.strictEqual(finalOrder8d.amount, 20, 'Financial data must remain untouched')

    // 11. Neither station receives the event on subsequent polls
    const { res: resPollB8d2 } = createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(createMockReqRes({
      method: 'GET',
      url: '/api/agent/orders/deletion-events?stationId=SRKR-XEROX-02',
      query: { stationId: 'SRKR-XEROX-02' },
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
    }).req, resPollB8d2)
    assert.strictEqual((resPollB8d2.bodyData?.events || []).find(e => e.orderId === orderIdOffline8d), undefined)

    // 12. Simulate 8 days passing AFTER global completion
    await eventsCol.updateOne(
      { eventId: initial8dEvent.eventId },
      {
        $set: {
          completedAt: backdate8dIso,
          completedAtDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        },
      }
    )
    const cleanupAfterCompletion = await cleanupAcknowledgedDeletionEvents(db)
    assert.strictEqual(cleanupAfterCompletion.success, true)
    assert.ok(cleanupAfterCompletion.cleanedCount >= 1, 'Completed event must expire after 7-day TTL period post-completion')

    const expiredEventInDb = await eventsCol.findOne({ eventId: initial8dEvent.eventId })
    assert.strictEqual(expiredEventInDb, null, 'Completed event must be pruned after 7-day TTL')
    console.log('✓ TEST 31 PASSED: 8-day offline scenario verified: event preserved while offline, purged on reconnect, and TTL starts only after global completion\n')

    // ── TEST 32: Duplicate Acknowledgements and Network Retry Resilience ─────
    console.log('[TEST 32] Testing duplicate acknowledgements and network retry resilience...')
    const orderIdRetryDup = `XB86${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdRetryDup)
    const { res: resSaveDup } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdRetryDup, fileName: 'dup_test.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdRetryDup, fileName: 'dup_test.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveDup)
    const dupToken = resSaveDup.bodyData.deletionToken

    await ordersHandler(
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdRetryDup, deletionToken: dupToken } }).req,
      createMockReqRes({ query: { action: 'deleteOrderDocument' }, body: { orderId: orderIdRetryDup, deletionToken: dupToken } }).res
    )

    // Send 3 duplicate acks in rapid succession
    for (let i = 0; i < 3; i++) {
      const { req: reqDup, res: resDup } = createMockReqRes({
        method: 'POST',
        url: '/api/agent/orders/deletion-events/ack',
        headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
        body: { orderId: orderIdRetryDup, stationId: 'SRKR-XEROX-01' },
      })
      await agentOrdersHandler(reqDup, resDup)
      assert.strictEqual(resDup.statusCode, 200, `Duplicate ack #${i + 1} must return 200 OK`)
      assert.strictEqual(resDup.bodyData?.acknowledged, true)
    }

    const dupEvent = await eventsCol.findOne({ orderId: orderIdRetryDup })
    const station01Occurrences = dupEvent.acknowledgedStations.filter(st => st === 'SRKR-XEROX-01').length
    assert.strictEqual(station01Occurrences, 1, 'Duplicate acks must not create duplicate entries in acknowledgedStations')
    console.log('✓ TEST 32 PASSED: Duplicate acknowledgements and network retry resilience verified\n')

    // ── TEST 33: MongoDB TTL Lifecycle Edge Cases and Cleanup Sweep Selectivity ───
    console.log('[TEST 33] Testing MongoDB TTL lifecycle edge cases and cleanup sweep selectivity...')
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)

    const evPending8d = {
      eventId: 'ev_ttl_pending_8d',
      orderId: 'XB_TTL_PENDING_8D',
      status: 'pending',
      requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      acknowledgedStations: [],
      allStationsAcknowledged: false,
      completedAt: null,
      completedAtDate: null,
      createdAtDate: eightDaysAgo,
    }

    const evPartial8d = {
      eventId: 'ev_ttl_partial_8d',
      orderId: 'XB_TTL_PARTIAL_8D',
      status: 'partially_acknowledged',
      requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      acknowledgedStations: ['SRKR-XEROX-01'],
      allStationsAcknowledged: false,
      completedAt: null,
      completedAtDate: null,
      lastAcknowledgedAt: eightDaysAgo.toISOString(),
      createdAtDate: eightDaysAgo,
    }

    const evCompleted8d = {
      eventId: 'ev_ttl_completed_8d',
      orderId: 'XB_TTL_COMPLETED_8D',
      status: 'completed',
      requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      acknowledgedStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      allStationsAcknowledged: true,
      completedAt: eightDaysAgo.toISOString(),
      completedAtDate: eightDaysAgo,
      createdAtDate: eightDaysAgo,
    }

    const evCompleted2d = {
      eventId: 'ev_ttl_completed_2d',
      orderId: 'XB_TTL_COMPLETED_2D',
      status: 'completed',
      requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      acknowledgedStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      allStationsAcknowledged: true,
      completedAt: twoDaysAgo.toISOString(),
      completedAtDate: twoDaysAgo,
      createdAtDate: twoDaysAgo,
    }

    const evMissingCompletedDate = {
      eventId: 'ev_ttl_missing_completed_date',
      orderId: 'XB_TTL_MISSING_DATE',
      status: 'pending',
      requiredStations: ['SRKR-XEROX-01'],
      acknowledgedStations: [],
      allStationsAcknowledged: false,
      completedAt: null,
      // completedAtDate deliberately absent/missing
      createdAtDate: tenDaysAgo,
    }

    // Legacy ambiguous events:
    // (1) Legacy acknowledged event where only 1 of 2 stations acknowledged (allStationsAcknowledged: false)
    const evLegacyAckOneStation = {
      eventId: 'ev_legacy_ack_one_station',
      orderId: 'XB_LEGACY_ONE_STATION',
      status: 'acknowledged',
      requiredStations: ['SRKR-XEROX-01', 'SRKR-XEROX-02'],
      acknowledgedStations: ['SRKR-XEROX-01'],
      allStationsAcknowledged: false,
      acknowledgedAt: eightDaysAgo.toISOString(),
      acknowledgedAtDate: eightDaysAgo,
      createdAtDate: eightDaysAgo,
    }

    // (2) Legacy acknowledged event with missing allStationsAcknowledged field
    const evLegacyAckMissingAllAck = {
      eventId: 'ev_legacy_ack_missing_all_ack',
      orderId: 'XB_LEGACY_MISSING_ALL_ACK',
      status: 'acknowledged',
      acknowledgedStations: ['SRKR-XEROX-01'],
      // allStationsAcknowledged field is intentionally missing
      acknowledgedAt: eightDaysAgo.toISOString(),
      acknowledgedAtDate: eightDaysAgo,
      createdAtDate: eightDaysAgo,
    }

    await eventsCol.insertOne(evPending8d)
    await eventsCol.insertOne(evPartial8d)
    await eventsCol.insertOne(evCompleted8d)
    await eventsCol.insertOne(evCompleted2d)
    await eventsCol.insertOne(evMissingCompletedDate)
    await eventsCol.insertOne(evLegacyAckOneStation)
    await eventsCol.insertOne(evLegacyAckMissingAllAck)

    // 1. Verify native MongoDB TTL index evaluation invariants
    const isEligibleForNativeTtl = (doc, ttlSeconds = 604800) => {
      // In native MongoDB, TTL indices only expire documents if the field is a BSON Date
      if (!doc || !(doc.completedAtDate instanceof Date) || isNaN(doc.completedAtDate.getTime())) {
        return false
      }
      return (Date.now() - doc.completedAtDate.getTime()) >= ttlSeconds * 1000
    }

    assert.strictEqual(isEligibleForNativeTtl(evPending8d), false, 'Pending event older than 8 days must NEVER be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evPartial8d), false, 'Partially acknowledged event older than 8 days must NEVER be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evMissingCompletedDate), false, 'Event with missing completedAtDate must NEVER be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evCompleted2d), false, 'Completed event younger than 7 days must NOT be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evLegacyAckOneStation), false, 'Legacy event with 1 station ack must NOT be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evLegacyAckMissingAllAck), false, 'Legacy event with missing allAck must NOT be eligible for native TTL')
    assert.strictEqual(isEligibleForNativeTtl(evCompleted8d), true, 'Completed event older than 7 days MUST be eligible for native TTL')

    // 2. Track index state before cleanup sweep to ensure zero automatic index drop/recreation
    const indexesBeforeSweep = await eventsCol.indexes()

    // Run the cleanup sweep
    const sweepResult = await cleanupAcknowledgedDeletionEvents(mockDb)
    assert.strictEqual(sweepResult.success, true, 'Cleanup sweep must succeed')
    assert.strictEqual(sweepResult.cleanedCount, 1, 'Cleanup sweep must delete exactly 1 completed event older than 7 days')

    // Verify existing indexes were preserved without drop or recreate
    const indexesAfterSweep = await eventsCol.indexes()
    assert.strictEqual(indexesAfterSweep.length, indexesBeforeSweep.length, 'Index count must not change')

    // 3. Verify retention after sweep
    const checkPending8d = await eventsCol.findOne({ eventId: 'ev_ttl_pending_8d' })
    assert.notStrictEqual(checkPending8d, null, 'Pending event older than 8 days MUST be retained')

    const checkPartial8d = await eventsCol.findOne({ eventId: 'ev_ttl_partial_8d' })
    assert.notStrictEqual(checkPartial8d, null, 'Partially acknowledged event older than 8 days MUST be retained')

    const checkCompleted2d = await eventsCol.findOne({ eventId: 'ev_ttl_completed_2d' })
    assert.notStrictEqual(checkCompleted2d, null, 'Completed event younger than 7 days MUST remain')

    const checkMissingDate = await eventsCol.findOne({ eventId: 'ev_ttl_missing_completed_date' })
    assert.notStrictEqual(checkMissingDate, null, 'Event with missing completedAtDate MUST remain')

    const checkLegacyOneStation = await eventsCol.findOne({ eventId: 'ev_legacy_ack_one_station' })
    assert.notStrictEqual(checkLegacyOneStation, null, 'Legacy event with 1 station ack MUST be retained')

    const checkLegacyMissingAllAck = await eventsCol.findOne({ eventId: 'ev_legacy_ack_missing_all_ack' })
    assert.notStrictEqual(checkLegacyMissingAllAck, null, 'Legacy event with missing allStationsAcknowledged MUST be retained')

    const checkCompleted8d = await eventsCol.findOne({ eventId: 'ev_ttl_completed_8d' })
    assert.strictEqual(checkCompleted8d, null, 'Completed event older than 7 days MUST be deleted by cleanup sweep')

    console.log('✓ TEST 33 PASSED: MongoDB TTL lifecycle edge cases and cleanup sweep selectivity verified\n')

    // ── TEST 34: Station Registry Fail-Closed Safety & Multi-Station Scenarios ──
    console.log('[TEST 34] Testing station registry fail-closed safety and edge cases...')

    // Case 1 & Case 7: Registry database query failure fails closed with 503,
    // leaves original document in GridFS and order metadata intact, rolls back reservation.
    const orderIdQueryFail = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdQueryFail)
    const { res: resSaveFail } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdQueryFail, fileName: 'fail_query.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdQueryFail, fileName: 'fail_query.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveFail)
    const failToken = resSaveFail.bodyData.deletionToken

    // Mock stationsCol.find throwing error
    const origFind = stationsCol.find.bind(stationsCol)
    stationsCol.find = () => { throw new Error('Simulated transient MongoDB network failure') }

    const { req: reqQueryFail, res: resQueryFail } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdQueryFail, deletionToken: failToken },
    })
    await ordersHandler(reqQueryFail, resQueryFail)
    assert.strictEqual(resQueryFail.statusCode, 503, 'Station registry query error must return HTTP 503 Service Unavailable')
    assert.strictEqual(resQueryFail.bodyData?.success, false)
    assert.ok(resQueryFail.bodyData?.error?.includes('Station registry discovery failed'))

    // Case 7: Confirm order metadata and GridFS file are completely intact, reservation rolled back
    const orderAfterQueryFail = await ordersCol.findOne({ orderId: orderIdQueryFail })
    assert.strictEqual(orderAfterQueryFail.documentDeleted, undefined, 'documentDeleted must not be true')
    assert.strictEqual(orderAfterQueryFail.documentDeletionPending, false, 'documentDeletionPending reservation must be rolled back to false')
    const gridFileQueryFail = await mockBucket.find({ 'metadata.orderId': orderIdQueryFail }).toArray()
    assert.ok(gridFileQueryFail.length > 0, 'GridFS file must remain intact when station discovery fails')

    // Restore find method
    stationsCol.find = origFind

    // Case 2: Empty station registry fails closed with HTTP 503
    const orderIdEmptyReg = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdEmptyReg)
    const { res: resSaveEmpty } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdEmptyReg, fileName: 'empty_reg.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdEmptyReg, fileName: 'empty_reg.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveEmpty)
    const emptyToken = resSaveEmpty.bodyData.deletionToken

    // Save and clear stations
    const savedStations = Array.from(stationsCol.docs.values())
    stationsCol.docs.clear()

    const { req: reqEmpty, res: resEmpty } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdEmptyReg, deletionToken: emptyToken },
    })
    await ordersHandler(reqEmpty, resEmpty)
    assert.strictEqual(resEmpty.statusCode, 503, 'Empty station registry must return HTTP 503 Service Unavailable')
    assert.ok(resEmpty.bodyData?.error?.includes('No eligible print stations'))
    const orderAfterEmpty = await ordersCol.findOne({ orderId: orderIdEmptyReg })
    assert.strictEqual(orderAfterEmpty.documentDeleted, undefined, 'documentDeleted must not be true on empty registry')
    assert.strictEqual(orderAfterEmpty.documentDeletionPending, false, 'Reservation must be rolled back on empty registry')

    // Case 3: Only TEST-prefixed stations registered fails closed for real customer orders
    await stationsCol.insertOne({ stationId: 'TEST-01', status: 'online', archived: false, decommissioned: false })
    await stationsCol.insertOne({ stationId: 'TEST-02', status: 'online', archived: false, decommissioned: false })

    const { req: reqTestOnly, res: resTestOnly } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdEmptyReg, deletionToken: emptyToken },
    })
    await ordersHandler(reqTestOnly, resTestOnly)
    assert.strictEqual(resTestOnly.statusCode, 503, 'Only test stations registered must return HTTP 503 for real customer order')

    // Case 4 & Case 8: One active production station works normally
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: 'SRKR-XEROX-01', status: 'online', archived: false, decommissioned: false })
    const orderIdSingle = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdSingle)
    const { res: resSaveSingle } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdSingle, fileName: 'single_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdSingle, fileName: 'single_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveSingle)
    const singleToken = resSaveSingle.bodyData.deletionToken

    const { req: reqSingle, res: resSingle } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdSingle, deletionToken: singleToken },
    })
    await ordersHandler(reqSingle, resSingle)
    assert.strictEqual(resSingle.statusCode, 200, 'Successful single-station deletion must return 200')
    const singleEvent = await eventsCol.findOne({ orderId: orderIdSingle })
    assert.deepStrictEqual(singleEvent.requiredStations, ['SRKR-XEROX-01'], 'Must snapshot single production station')

    // Case 5 & Case 6: Two production stations (one offline) snapshot both, and acknowledge independently
    await stationsCol.insertOne({
      stationId: 'SRKR-XEROX-02',
      status: 'offline', // Offline station!
      archived: false,
      decommissioned: false,
      lastHeartbeat: new Date(Date.now() - 3600000).toISOString(),
    })

    const orderIdDual = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdDual)
    const { res: resSaveDual } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdDual, fileName: 'dual_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdDual, fileName: 'dual_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveDual)
    const dualToken = resSaveDual.bodyData.deletionToken

    const { req: reqDual, res: resDual } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdDual, deletionToken: dualToken },
    })
    await ordersHandler(reqDual, resDual)
    assert.strictEqual(resDual.statusCode, 200, 'Dual-station order deletion must return 200')

    const dualEvent = await eventsCol.findOne({ orderId: orderIdDual })
    assert.ok(dualEvent.requiredStations.includes('SRKR-XEROX-01'), 'Must include SRKR-XEROX-01')
    assert.ok(dualEvent.requiredStations.includes('SRKR-XEROX-02'), 'Must include offline SRKR-XEROX-02')

    // Case 6: Multiple production stations acknowledging independently
    // Station 1 acknowledges:
    const { req: reqAck1, res: resAck1 } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': station01Key, 'x-station-id': 'SRKR-XEROX-01' },
      body: { orderId: orderIdDual, stationId: 'SRKR-XEROX-01' },
    })
    await agentOrdersHandler(reqAck1, resAck1)
    assert.strictEqual(resAck1.statusCode, 200)

    const dualEventAfterAck1 = await eventsCol.findOne({ orderId: orderIdDual })
    assert.strictEqual(dualEventAfterAck1.status, 'partially_acknowledged')
    assert.strictEqual(dualEventAfterAck1.allStationsAcknowledged, false)
    assert.strictEqual(dualEventAfterAck1.completedAtDate, null)

    // Station 2 acknowledges:
    const { req: reqAck2, res: resAck2 } = createMockReqRes({
      method: 'POST',
      url: '/api/agent/orders/deletion-events/ack',
      headers: { 'x-agent-key': station02Key, 'x-station-id': 'SRKR-XEROX-02' },
      body: { orderId: orderIdDual, stationId: 'SRKR-XEROX-02' },
    })
    await agentOrdersHandler(reqAck2, resAck2)
    assert.strictEqual(resAck2.statusCode, 200)

    const dualEventAfterAck2 = await eventsCol.findOne({ orderId: orderIdDual })
    assert.strictEqual(dualEventAfterAck2.status, 'completed')
    assert.strictEqual(dualEventAfterAck2.allStationsAcknowledged, true)
    assert.ok(dualEventAfterAck2.completedAtDate instanceof Date)

    console.log('✓ TEST 34 PASSED: Station registry fail-closed safety and multi-station cases verified\n')

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 35: Station Status Validation, Malformed Record Rejection & Authenticated Fallback
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- TEST 35: Station Status Validation, Malformed Record Rejection & Authenticated Fallback ---')

    // Case 1 & Case 2: Supported production statuses (online, printer_unavailable, offline, idle, ready, busy)
    // are all explicitly accepted and legitimate offline/printer_unavailable stations are retained
    stationsCol.docs.clear()
    const supportedStatuses = [
      { id: 'STATION-ONLINE', status: 'online' },
      { id: 'STATION-PRINTER-UNAVAIL', status: 'printer_unavailable' },
      { id: 'STATION-OFFLINE', status: 'offline' },
      { id: 'STATION-IDLE', status: 'idle' },
      { id: 'STATION-READY', status: 'ready' },
      { id: 'STATION-BUSY', status: 'busy' },
    ]
    for (const s of supportedStatuses) {
      await stationsCol.insertOne({
        stationId: s.id,
        status: s.status,
        archived: false,
        decommissioned: false,
      })
    }

    const orderIdAllStatuses = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdAllStatuses)
    const { res: resSaveAllSt } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdAllStatuses, fileName: 'all_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdAllStatuses, fileName: 'all_st.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveAllSt)
    const allStToken = resSaveAllSt.bodyData.deletionToken

    const { req: reqAllSt, res: resAllSt } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdAllStatuses, deletionToken: allStToken },
    })
    await ordersHandler(reqAllSt, resAllSt)
    assert.strictEqual(resAllSt.statusCode, 200, 'All supported production statuses must result in successful deletion')

    const allStEvent = await eventsCol.findOne({ orderId: orderIdAllStatuses })
    assert.strictEqual(allStEvent.requiredStations.length, 6, 'All 6 supported production stations must be snapshotted')
    assert.ok(allStEvent.requiredStations.includes('STATION-OFFLINE'), 'Offline station must be retained')
    assert.ok(allStEvent.requiredStations.includes('STATION-PRINTER-UNAVAIL'), 'Printer unavailable station must be retained')
    assert.ok(allStEvent.requiredStations.includes('STATION-ONLINE'), 'Online station must be included')
    assert.ok(allStEvent.requiredStations.includes('STATION-IDLE'), 'Idle station must be included')
    assert.ok(allStEvent.requiredStations.includes('STATION-READY'), 'Ready station must be included')
    assert.ok(allStEvent.requiredStations.includes('STATION-BUSY'), 'Busy station must be included')

    // Case 3: Exclude archived and decommissioned stations
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: 'ACTIVE-PROD-01', status: 'online', archived: false, decommissioned: false })
    await stationsCol.insertOne({ stationId: 'ARCHIVED-BY-FLAG', status: 'online', archived: true, decommissioned: false })
    await stationsCol.insertOne({ stationId: 'DECOM-BY-FLAG', status: 'online', archived: false, decommissioned: true })
    await stationsCol.insertOne({ stationId: 'ARCHIVED-BY-STATUS', status: 'archived', archived: false, decommissioned: false })
    await stationsCol.insertOne({ stationId: 'DECOM-BY-STATUS', status: 'decommissioned', archived: false, decommissioned: false })

    const orderIdArchived = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdArchived)
    const { res: resSaveArchived } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdArchived, fileName: 'arch.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdArchived, fileName: 'arch.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveArchived)
    const archToken = resSaveArchived.bodyData.deletionToken

    const { req: reqArch, res: resArch } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdArchived, deletionToken: archToken },
    })
    await ordersHandler(reqArch, resArch)
    assert.strictEqual(resArch.statusCode, 200)

    const archEvent = await eventsCol.findOne({ orderId: orderIdArchived })
    assert.deepStrictEqual(archEvent.requiredStations, ['ACTIVE-PROD-01'], 'Archived and decommissioned stations must be excluded')

    // Case 4: Unknown station status returns HTTP 503 and rolls back reservation
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: 'PROD-STATION-01', status: 'unknown_broken_status' })

    const orderIdUnknownStatus = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdUnknownStatus)
    const { res: resSaveUnkStatus } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdUnknownStatus, fileName: 'unk_status.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdUnknownStatus, fileName: 'unk_status.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveUnkStatus)
    const unkStatusToken = resSaveUnkStatus.bodyData.deletionToken

    const { req: reqUnkStatus, res: resUnkStatus } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdUnknownStatus, deletionToken: unkStatusToken },
    })
    await ordersHandler(reqUnkStatus, resUnkStatus)
    assert.strictEqual(resUnkStatus.statusCode, 503, 'Unknown production station status must return HTTP 503')
    assert.ok(resUnkStatus.bodyData?.error?.includes('Unknown or malformed production station status'), 'Error must specify malformed status')

    const unkStatusOrderDoc = await ordersCol.findOne({ orderId: orderIdUnknownStatus })
    assert.strictEqual(unkStatusOrderDoc.documentDeletionPending, false, 'Reservation must be rolled back')
    assert.ok(!unkStatusOrderDoc.documentDeleted, 'Document must not be deleted')

    // Case 5: Missing or empty station ID returns HTTP 503
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: '', status: 'online' })

    const orderIdEmptyId = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdEmptyId)
    const { res: resSaveEmptyId } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdEmptyId, fileName: 'empty_id.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdEmptyId, fileName: 'empty_id.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveEmptyId)
    const emptyIdToken = resSaveEmptyId.bodyData.deletionToken

    const { req: reqEmptyId, res: resEmptyId } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdEmptyId, deletionToken: emptyIdToken },
    })
    await ordersHandler(reqEmptyId, resEmptyId)
    assert.strictEqual(resEmptyId.statusCode, 503, 'Empty stationId must return HTTP 503')
    assert.ok(resEmptyId.bodyData?.error?.includes('invalid stationId format') || resEmptyId.bodyData?.error?.includes('missing or non-string stationId'))

    // Case 6: Invalid format station ID returns HTTP 503
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: 'INVALID BAD ID!@#', status: 'online' })

    const orderIdInvalidId = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdInvalidId)
    const { res: resSaveInvalidId } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdInvalidId, fileName: 'invalid_id.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdInvalidId, fileName: 'invalid_id.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveInvalidId)
    const invalidIdToken = resSaveInvalidId.bodyData.deletionToken

    const { req: reqInvalidId, res: resInvalidId } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdInvalidId, deletionToken: invalidIdToken },
    })
    await ordersHandler(reqInvalidId, resInvalidId)
    assert.strictEqual(resInvalidId.statusCode, 503, 'Invalid stationId format must return HTTP 503')

    // Case 7: Conflicting duplicate station IDs in registry return HTTP 503
    stationsCol.docs.clear()
    await stationsCol.insertOne({ stationId: 'SRKR-XEROX-01', status: 'online' })
    await stationsCol.insertOne({ stationId: 'srkr-xerox-01', status: 'idle' }) // duplicate normalized ID!

    const orderIdStationDup = `XB99${Math.floor(1000 + Math.random() * 9000)}`
    testIdsToCleanup.push(orderIdStationDup)
    const { res: resSaveStationDup } = createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdStationDup, fileName: 'dup.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    })
    await ordersHandler(createMockReqRes({
      body: { action: 'saveOrder', orderId: orderIdStationDup, fileName: 'dup.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
    }).req, resSaveStationDup)
    const dupStationToken = resSaveStationDup.bodyData.deletionToken

    const { req: reqStationDup, res: resStationDup } = createMockReqRes({
      query: { action: 'deleteOrderDocument' },
      body: { orderId: orderIdStationDup, deletionToken: dupStationToken },
    })
    await ordersHandler(reqStationDup, resStationDup)
    assert.strictEqual(resStationDup.statusCode, 503, 'Conflicting duplicate station IDs must return HTTP 503')
    assert.ok(resStationDup.bodyData?.error?.includes('Conflicting duplicate station ID detected in registry'))

    // Case 8: SINGLE_STATION_MODE fallback rejected without authenticated identity
    stationsCol.docs.clear()
    const origSingleMode = process.env.SINGLE_STATION_MODE
    const origDefaultStation = process.env.DEFAULT_STATION_ID
    const origFallbackKey = process.env.AGENT_KEY_AUTH_FALLBACK_01

    try {
      process.env.SINGLE_STATION_MODE = 'true'
      process.env.DEFAULT_STATION_ID = 'UNAUTHENTICATED-ROGUE-01'

      const orderIdUnauthFallback = `XB99${Math.floor(1000 + Math.random() * 9000)}`
      testIdsToCleanup.push(orderIdUnauthFallback)
      const { res: resSaveUnauth } = createMockReqRes({
        body: { action: 'saveOrder', orderId: orderIdUnauthFallback, fileName: 'unauth_fb.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
      })
      await ordersHandler(createMockReqRes({
        body: { action: 'saveOrder', orderId: orderIdUnauthFallback, fileName: 'unauth_fb.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
      }).req, resSaveUnauth)
      const unauthToken = resSaveUnauth.bodyData.deletionToken

      const { req: reqUnauth, res: resUnauth } = createMockReqRes({
        query: { action: 'deleteOrderDocument' },
        body: { orderId: orderIdUnauthFallback, deletionToken: unauthToken },
      })
      await ordersHandler(reqUnauth, resUnauth)
      assert.strictEqual(resUnauth.statusCode, 503, 'Unauthenticated single-station fallback must return HTTP 503')
      assert.ok(resUnauth.bodyData?.error?.includes('does not have an explicitly configured, authenticated identity'))

      // Case 9: SINGLE_STATION_MODE fallback succeeds when identity is authenticated
      process.env.DEFAULT_STATION_ID = 'AUTH-FALLBACK-01'
      process.env.AGENT_KEY_AUTH_FALLBACK_01 = 'test-secret-key-auth-fallback-01'

      const orderIdAuthFallback = `XB99${Math.floor(1000 + Math.random() * 9000)}`
      testIdsToCleanup.push(orderIdAuthFallback)
      const { res: resSaveAuthFb } = createMockReqRes({
        body: { action: 'saveOrder', orderId: orderIdAuthFallback, fileName: 'auth_fb.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
      })
      await ordersHandler(createMockReqRes({
        body: { action: 'saveOrder', orderId: orderIdAuthFallback, fileName: 'auth_fb.pdf', copies: 1, amount: 5, pdfBase64: SAMPLE_BASE64 },
      }).req, resSaveAuthFb)
      const authFbToken = resSaveAuthFb.bodyData.deletionToken

      const { req: reqAuthFb, res: resAuthFb } = createMockReqRes({
        query: { action: 'deleteOrderDocument' },
        body: { orderId: orderIdAuthFallback, deletionToken: authFbToken },
      })
      await ordersHandler(reqAuthFb, resAuthFb)
      assert.strictEqual(resAuthFb.statusCode, 200, 'Authenticated single-station fallback must succeed')

      const authFbEvent = await eventsCol.findOne({ orderId: orderIdAuthFallback })
      assert.deepStrictEqual(authFbEvent.requiredStations, ['AUTH-FALLBACK-01'], 'Must snapshot authenticated fallback station')
    } finally {
      if (origSingleMode !== undefined) process.env.SINGLE_STATION_MODE = origSingleMode
      else delete process.env.SINGLE_STATION_MODE

      if (origDefaultStation !== undefined) process.env.DEFAULT_STATION_ID = origDefaultStation
      else delete process.env.DEFAULT_STATION_ID

      if (origFallbackKey !== undefined) process.env.AGENT_KEY_AUTH_FALLBACK_01 = origFallbackKey
      else delete process.env.AGENT_KEY_AUTH_FALLBACK_01
    }

    console.log('✓ TEST 35 PASSED: Station status validation, malformed record rejection & authenticated fallback verified\n')

    console.log('=================================================================')
    console.log('  ALL SECURE DOCUMENT DELETION REGRESSION TESTS PASSED (35/35)   ')
    console.log('=================================================================\n')
  } finally {
    try {
      await closeDatabaseConnection()
    } catch {}
  }
}

runSecureDeletionTestSuite().catch(err => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})
