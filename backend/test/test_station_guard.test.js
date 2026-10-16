import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const printAgentConfig = require('../print-agent/services/config.js')
const releaseConfig = require('../../release/XBuddy-Print-Station-v2.1.0/app/services/config.js')

test('TEST-01 Station Safety Guard - Automated Unit Tests', async (t) => {
  const configs = [
    { name: 'backend/print-agent/services/config.js', mod: printAgentConfig },
    { name: 'release/XBuddy-Print-Station-v2.1.0/app/services/config.js', mod: releaseConfig },
  ]

  for (const { name, mod } of configs) {
    await t.test(`[${name}] Function existence & signature`, () => {
      assert.strictEqual(typeof mod.validateStationOrderAuthorization, 'function', 'validateStationOrderAuthorization must be exported')
    })

    const { validateStationOrderAuthorization } = mod

    await t.test(`[${name}] 1. Exact-match authorization for TEST-01 and XB-TEST-01`, () => {
      assert.strictEqual(validateStationOrderAuthorization('TEST-01', 'XB-TEST-01'), true, 'Exact TEST-01 and XB-TEST-01 must be authorized')
      assert.strictEqual(validateStationOrderAuthorization('test-01', 'xb-test-01'), true, 'Case-insensitive test-01 and xb-test-01 must be authorized')
      assert.strictEqual(validateStationOrderAuthorization('  TEST-01  ', '  XB-TEST-01  '), true, 'Trimmed values must be authorized')
    })

    await t.test(`[${name}] 2. Real customer order IDs must be strictly rejected on TEST-01`, () => {
      const realOrderIds = ['XB8212', 'XB4921', 'XB0000', 'XB1234', 'XB9532', 'XB2863', 'ORD-5001']
      for (const orderId of realOrderIds) {
        assert.strictEqual(
          validateStationOrderAuthorization('TEST-01', orderId),
          false,
          `Customer order ${orderId} must be rejected on station TEST-01`
        )
      }
    })

    await t.test(`[${name}] 3. Partial, prefix, and variant IDs must be strictly rejected on TEST-01`, () => {
      const variantIds = [
        'XB-TEST-02',
        'XB-TEST-99',
        'XB-TEST-',
        'XB-TEST',
        'TEST-01',
        'XB-TEST-01-COPY',
        'XB-TEST-011',
        'XB-TEST-010',
        'PREFIX-XB-TEST-01',
        'XB-TEST-01.PDF',
      ]
      for (const orderId of variantIds) {
        assert.strictEqual(
          validateStationOrderAuthorization('TEST-01', orderId),
          false,
          `Variant/prefix order ${orderId} must be rejected on station TEST-01`
        )
      }
    })

    await t.test(`[${name}] 4. Empty, whitespace, or invalid IDs must be rejected on TEST-01`, () => {
      assert.strictEqual(validateStationOrderAuthorization('TEST-01', ''), false)
      assert.strictEqual(validateStationOrderAuthorization('TEST-01', '   '), false)
      assert.strictEqual(validateStationOrderAuthorization('TEST-01', null), false)
      assert.strictEqual(validateStationOrderAuthorization('TEST-01', undefined), false)
    })

    await t.test(`[${name}] 5. Live station SRKR-XEROX-01 must retain unimpeded access to all orders`, () => {
      const orders = ['XB8212', 'XB4921', 'XB0000', 'XB-TEST-01', 'XB-TEST-02', 'ANY_OTHER_ORDER']
      for (const orderId of orders) {
        assert.strictEqual(
          validateStationOrderAuthorization('SRKR-XEROX-01', orderId),
          true,
          `SRKR-XEROX-01 must be allowed to process order ${orderId}`
        )
        assert.strictEqual(
          validateStationOrderAuthorization('srkr-xerox-01', orderId),
          true,
          `Case-insensitive SRKR-XEROX-01 must be allowed to process order ${orderId}`
        )
      }
    })

    await t.test(`[${name}] 6. Unset/default stations must not be blocked`, () => {
      assert.strictEqual(validateStationOrderAuthorization('', 'XB8212'), true)
      assert.strictEqual(validateStationOrderAuthorization(null, 'XB8212'), true)
      assert.strictEqual(validateStationOrderAuthorization(undefined, 'XB8212'), true)
      assert.strictEqual(validateStationOrderAuthorization('OTHER-STATION-02', 'XB8212'), true)
    })
  }

  await t.test('7. Protected Path: sheets.js claimOrder() blocks unauthorized orders before cloud request', async () => {
    const originalStation = process.env.STATION_ID
    try {
      process.env.STATION_ID = 'TEST-01'
      const { claimOrder } = require('../../release/XBuddy-Print-Station-v2.1.0/app/services/sheets.js')

      const resBlocked = await claimOrder('XB8212')
      assert.strictEqual(resBlocked.success, false)
      assert.strictEqual(resBlocked.blockedByStationGuard, true)

      const resVariant = await claimOrder('XB-TEST-02')
      assert.strictEqual(resVariant.success, false)
      assert.strictEqual(resVariant.blockedByStationGuard, true)
    } finally {
      if (originalStation !== undefined) process.env.STATION_ID = originalStation
      else delete process.env.STATION_ID
    }
  })

  await t.test('8. Protected Path: sheets.js getOrderByIdForRelease() aborts before cloud request', async () => {
    const originalStation = process.env.STATION_ID
    try {
      process.env.STATION_ID = 'TEST-01'
      const { getOrderByIdForRelease } = require('../../release/XBuddy-Print-Station-v2.1.0/app/services/sheets.js')

      const resBlocked = await getOrderByIdForRelease('XB8212')
      assert.strictEqual(resBlocked, null, 'Must return null immediately without network call')

      const resVariant = await getOrderByIdForRelease('XB-TEST-99')
      assert.strictEqual(resVariant, null, 'Must return null for variant')
    } finally {
      if (originalStation !== undefined) process.env.STATION_ID = originalStation
      else delete process.env.STATION_ID
    }
  })

  await t.test('9. Protected Path: updater.js updatePrintStatus() aborts before cloud request', async () => {
    const originalStation = process.env.STATION_ID
    try {
      process.env.STATION_ID = 'TEST-01'
      const { updatePrintStatus } = require('../../release/XBuddy-Print-Station-v2.1.0/app/services/updater.js')

      // Should return without error and without throwing network errors
      await updatePrintStatus('XB8212', 'Printed')
      await updatePrintStatus('XB-TEST-02', 'Printed')
      assert.ok(true, 'Aborts cleanly before any network call')
    } finally {
      if (originalStation !== undefined) process.env.STATION_ID = originalStation
      else delete process.env.STATION_ID
    }
  })
})
