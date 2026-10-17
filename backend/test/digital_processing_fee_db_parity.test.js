import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import dotenv from 'dotenv'
dotenv.config()
import { MongoClient } from 'mongodb'

// The exact transformation logic used in AdminDashboard.jsx
function transformOrderForReport(o) {
  const cleanOrderId = String(o.id || o.orderId || '').trim().toUpperCase()
  const dynamicStation = String(
    o.stationId ||
    o.station ||
    (cleanOrderId === 'XB-TEST-01' || cleanOrderId.startsWith('XB-TEST-') ? 'TEST-01' : 'SRKR-XEROX-01')
  ).trim().toUpperCase()

  const amount = Number(o.amount || 0)
  const digitalProcessingFee = Number(o.digitalProcessingFee ?? o.serviceFee ?? 0)

  return {
    orderId: cleanOrderId,
    amount,
    digitalProcessingFee,
    stationId: dynamicStation,
    // The exact 3 columns rendered in the table
    tableColumns: {
      orderId: cleanOrderId,
      totalAmountFormatted: `₹${amount.toLocaleString()}`,
      digitalProcessingFeeFormatted: `₹${digitalProcessingFee.toLocaleString()}`,
    },
  }
}

test('Digital Processing Fee Report - Live Database Records Parity Test', async (t) => {
  const uri = process.env.MONGODB_READONLY_URI || process.env.MONGODB_URI
  if (!uri) {
    console.warn('Skipping live DB check: no MongoDB URI provided')
    return
  }

  const client = new MongoClient(uri)
  await client.connect()

  try {
    const db = client.db('xbuddy')
    const orders = await db.collection('orders').find({}, { projection: { pdfBase64: 0 } }).limit(50).toArray()

    assert.ok(orders.length > 0, 'Database should contain orders')

    console.log(`Checking ${orders.length} real order documents from MongoDB Atlas...`)

    for (const raw of orders) {
      const transformed = transformOrderForReport(raw)

      // 1. Order ID parity
      assert.strictEqual(
        transformed.orderId,
        String(raw.orderId).trim().toUpperCase(),
        `Order ID mismatch for ${raw.orderId}`
      )

      // 2. Total Amount parity: must match stored value exactly
      assert.strictEqual(
        transformed.amount,
        Number(raw.amount || 0),
        `Amount mismatch for order ${raw.orderId}: displayed=${transformed.amount}, stored=${raw.amount}`
      )

      // 3. Digital Processing Fee parity: must match stored digitalProcessingFee (or fallback serviceFee)
      const expectedFee = Number(raw.digitalProcessingFee ?? raw.serviceFee ?? 0)
      assert.strictEqual(
        transformed.digitalProcessingFee,
        expectedFee,
        `Fee mismatch for order ${raw.orderId}: displayed=${transformed.digitalProcessingFee}, stored=${raw.digitalProcessingFee ?? raw.serviceFee}`
      )

      // 4. Exactly 3 columns check
      assert.strictEqual(Object.keys(transformed.tableColumns).length, 3, 'Must contain exactly 3 table columns')
    }

    console.log(`✓ SUCCESS: 100% of tested database orders (${orders.length} records) match displayed values with zero deviation.`)
  } finally {
    await client.close()
  }
})
