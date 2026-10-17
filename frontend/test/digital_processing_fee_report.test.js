import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// The exact transformation logic used in AdminDashboard.jsx
export function transformOrderForReport(o) {
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

export function groupOrdersByStation(orders) {
  const groups = {}
  orders.forEach(order => {
    const sId = String(
      order.stationId ||
      (order.id === 'XB-TEST-01' || String(order.id).startsWith('XB-TEST-') ? 'TEST-01' : 'SRKR-XEROX-01')
    ).trim().toUpperCase()

    if (!groups[sId]) {
      groups[sId] = []
    }
    groups[sId].push(order)
  })

  // Ensure known stations are dynamically present
  const knownStations = ['SRKR-XEROX-01', 'TEST-01']
  knownStations.forEach(s => {
    if (!groups[s]) {
      groups[s] = []
    }
  })

  return groups
}

test('Digital Processing Fee Report - Dynamic Grouping & Data Parity', async (t) => {
  await t.test('1. Table contract: exactly 3 columns (Order ID, Total Amount, Digital Processing Fee)', () => {
    const sampleRaw = {
      orderId: 'XB9999',
      amount: 15,
      digitalProcessingFee: 2,
      stationId: 'SRKR-XEROX-01',
    }
    const item = transformOrderForReport(sampleRaw)
    const columns = Object.keys(item.tableColumns)

    assert.strictEqual(columns.length, 3, 'Table must contain exactly 3 columns')
    assert.deepStrictEqual(columns, ['orderId', 'totalAmountFormatted', 'digitalProcessingFeeFormatted'])
    assert.strictEqual(item.tableColumns.orderId, 'XB9999')
    assert.strictEqual(item.tableColumns.totalAmountFormatted, '₹15')
    assert.strictEqual(item.tableColumns.digitalProcessingFeeFormatted, '₹2')
  })

  await t.test('2. Dynamic station support: SRKR-XEROX-01, TEST-01, and future stations', () => {
    const dataset = [
      { id: 'XB1001', amount: 10, digitalProcessingFee: 1, stationId: 'SRKR-XEROX-01' },
      { id: 'XB-TEST-01', amount: 5, digitalProcessingFee: 1, stationId: 'TEST-01' },
      { id: 'XB2001', amount: 20, digitalProcessingFee: 2, stationId: 'CAMPUS-MECH-02' },
      { id: 'XB3001', amount: 8, digitalProcessingFee: 1 }, // unassigned historical order
    ]

    const grouped = groupOrdersByStation(dataset)
    const stations = Object.keys(grouped)

    assert.ok(stations.includes('SRKR-XEROX-01'), 'Must include SRKR-XEROX-01')
    assert.ok(stations.includes('TEST-01'), 'Must include TEST-01')
    assert.ok(stations.includes('CAMPUS-MECH-02'), 'Must dynamically support future stations')
    assert.strictEqual(grouped['SRKR-XEROX-01'].length, 2, 'Unassigned order defaults to SRKR-XEROX-01')
    assert.strictEqual(grouped['TEST-01'].length, 1, 'TEST-01 contains exact test order')
    assert.strictEqual(grouped['CAMPUS-MECH-02'].length, 1, 'CAMPUS-MECH-02 contains future station order')
  })

  await t.test('3. Fee derivation: uses actual stored fee and total amount without recalculation', () => {
    // Order where stored fee is 3, even if an arbitrary formula might guess something else
    const rawOrder = {
      orderId: 'XB8888',
      amount: 45,
      digitalProcessingFee: 3,
      serviceFee: 3,
    }
    const reportItem = transformOrderForReport(rawOrder)

    // Verify stored fee is used directly
    assert.strictEqual(reportItem.amount, rawOrder.amount, 'Total amount must match stored amount')
    assert.strictEqual(reportItem.digitalProcessingFee, rawOrder.digitalProcessingFee, 'Fee must match stored digitalProcessingFee')
  })

  await t.test('4. AdminDashboard file inspection: table has exactly 3 columns and header grouping', () => {
    const dashboardFile = path.resolve(process.cwd(), 'src/components/AdminDashboard.jsx')
    const code = fs.readFileSync(dashboardFile, 'utf-8')

    // Verify exact 3 table header columns
    assert.match(code, /<th className="py-3 px-4 font-bold">Order ID<\/th>/)
    assert.match(code, /<th className="py-3 px-4 font-bold">Total Amount<\/th>/)
    assert.match(code, /<th className="py-3 px-4 font-bold">Digital Processing Fee<\/th>/)

    // Verify section heading with stationId
    assert.match(code, /Station: \{stationId\}/)

    // Verify actual stored values displayed
    assert.match(code, /\{formatCurrency\(order\.amount\)\}/)
    assert.match(code, /\{formatCurrency\(order\.digitalProcessingFee\)\}/)
  })
})
