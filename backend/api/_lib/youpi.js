import crypto from 'node:crypto'

/**
 * XBuddy × YouPI-PG Gateway Integration Adapter
 * 
 * Safety boundary:
 * YouPI-PG is experimental and not production-ready or certified.
 * This adapter is strictly for controlled development and staging testing.
 * Live mode is disabled by default via YOUPI_PG_ENABLED=false.
 */

export const DEFAULT_YOUPI_API_URL = 'http://localhost:6100'
export const DEFAULT_YOUPI_PORTAL_URL = 'http://localhost:7000'

/**
 * Feature flag check
 */
export function isYouPiEnabled() {
  const val = process.env.YOUPI_PG_ENABLED
  if (val === undefined || val === null || val === '') return true
  return String(val).trim().toLowerCase() !== 'false'
}

/**
 * Configuration accessor (server-side only)
 */
export function getYouPiConfig() {
  const apiUrl = (process.env.YOUPI_PG_API_URL || process.env.BASE_PAYMENT_API_URL || DEFAULT_YOUPI_API_URL).replace(/\/+$/, '')
  const portalUrl = (process.env.YOUPI_PG_PORTAL_URL || process.env.YOUPI_PG_CHECKOUT_URL || DEFAULT_YOUPI_PORTAL_URL).replace(/\/+$/, '')
  const merchantId = (process.env.YOUPI_PG_MERCHANT_ID || '').trim()
  const merchantKey = (process.env.YOUPI_PG_MERCHANT_KEY || process.env.YOUPI_PG_WEBHOOK_SECRET || '').trim()
  const webhookSecret = (process.env.YOUPI_PG_WEBHOOK_SECRET || process.env.YOUPI_PG_MERCHANT_KEY || '').trim()
  const publicKey = (process.env.YOUPI_PG_PUBLIC_KEY || '').trim()
  const returnUrl = (process.env.YOUPI_PG_RETURN_URL || '').trim()

  return {
    enabled: isYouPiEnabled(),
    apiUrl,
    portalUrl,
    merchantId,
    merchantKey,
    webhookSecret,
    publicKey,
    returnUrl,
  }
}

/**
 * Converts INR (Rupees) to integer paise.
 * Avoids IEEE-754 floating-point rounding errors.
 * E.g., 20.00 -> 2000, 14.50 -> 1450
 *
 * @param {number|string} rupees
 * @returns {number} Integer paise
 */
export function toPaise(rupees) {
  const num = typeof rupees === 'string' ? parseFloat(rupees.trim()) : Number(rupees)
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid rupees amount for paise conversion: ${rupees}`)
  }
  return Math.round(num * 100)
}

/**
 * Converts integer paise to standard 2-decimal rupee string format.
 * E.g., 2000 -> "20.00", 1450 -> "14.50"
 *
 * @param {number|string} paise
 * @returns {string} Rupee string with 2 decimals
 */
export function toRupeesString(paise) {
  const num = typeof paise === 'string' ? parseInt(paise.trim(), 10) : Number(paise)
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`Invalid paise amount for rupee string conversion: ${paise}`)
  }
  return (num / 100).toFixed(2)
}

/**
 * Computes HMAC-SHA256 digest over data.
 *
 * @param {string|Buffer} data
 * @param {string} secret
 * @returns {string} Hex-encoded HMAC digest
 */
export function generateHmac(data, secret) {
  if (!secret) throw new Error('HMAC generation failed: secret is required.')
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return crypto.createHmac('sha256', secret).update(buf).digest('hex')
}

/**
 * Timing-safe HMAC verification against expected hex signature.
 *
 * @param {string|Buffer} data
 * @param {string} secret
 * @param {string} expectedSignatureHex
 * @returns {boolean}
 */
export function verifyHmacConstantTime(data, secret, expectedSignatureHex) {
  if (!secret || !expectedSignatureHex) return false
  const actualSigHex = generateHmac(data, secret)
  const actualBuf = Buffer.from(actualSigHex, 'hex')
  const expectedBuf = Buffer.from(expectedSignatureHex, 'hex')

  if (actualBuf.length !== expectedBuf.length) {
    return false
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf)
}

/**
 * Official companion Android package identifiers for direct deep-link launching.
 * Matches YouPI-PG's packages/common/src/upi-providers.js registry.
 */
export const OFFICIAL_UPI_PACKAGES = Object.freeze({
  phonepe: 'com.phonepe.app',
  gpay: 'com.google.android.apps.nbu.paisa.user',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp',
  cred: 'com.dreamplug.androidapp',
})

/**
 * Builds a canonical upi://pay URI dynamically from server-validated parameters.
 *
 * @param {{
 *   payeeVpa: string,
 *   payeeName: string,
 *   amountPaise?: number|bigint,
 *   amount?: number|string,
 *   transactionRef?: string,
 *   transactionNote?: string,
 *   orderId?: string,
 *   currency?: string
 * }} options
 * @returns {string}
 */
export function buildUpiUri(options) {
  const amountStr = options.amountPaise !== undefined && options.amountPaise !== null
    ? toRupeesString(options.amountPaise)
    : (Number(options.amount) || 0).toFixed(2)

  const params = new URLSearchParams()
  params.set('pa', (options.payeeVpa || '').trim())
  params.set('pn', (options.payeeName || 'Xerox Buddy').trim())
  params.set('am', amountStr)
  params.set('cu', options.currency || 'INR')
  const txnId = (options.transactionRef || options.transactionNote || options.orderId || '').trim()
  if (txnId) {
    params.set('tn', txnId)
  }
  return `upi://pay?${params.toString()}`
}

/**
 * Builds an Android intent URI for launching a specific UPI application directly.
 * Format: intent://pay?<UPI_PARAMS>#Intent;scheme=upi;package=<PACKAGE>;end
 *
 * @param {{
 *   payeeVpa: string,
 *   payeeName: string,
 *   amountPaise?: number|bigint,
 *   amount?: number|string,
 *   transactionRef?: string,
 *   transactionNote?: string,
 *   orderId?: string,
 *   currency?: string,
 *   packageName: string
 * }} options
 * @returns {string}
 */
export function buildUpiIntentUri(options) {
  if (!options.packageName || !options.packageName.trim()) {
    throw new Error('Package name is required for Android UPI intent URI')
  }
  const upiUri = buildUpiUri(options)
  const query = upiUri.split('?')[1] || ''
  const cleanPackage = options.packageName.trim()
  return `intent://pay?${query}#Intent;scheme=upi;package=${cleanPackage};end`
}

/**
 * Creates a payment session via YouPI-PG merchant REST API.
 * Follows the official YouPI-PG merchant contract:
 * POST /api/v1/payments
 * Headers: Content-Type: application/json, X-Merchant-Id, X-Merchant-Key
 *
 * @param {{
 *   orderId: string,
 *   amount: number|string,
 *   currency?: string,
 *   returnUrl?: string,
 *   customer?: { phoneNumber?: string, fullName?: string },
 *   metadata?: Record<string, any>,
 *   idempotencyKey?: string,
 *   configOverride?: Partial<ReturnType<typeof getYouPiConfig>>,
 *   fetchImpl?: typeof fetch
 * }} params
 * @returns {Promise<{
 *   paymentId: string,
 *   orderId: string,
 *   amount: string,
 *   amountPaise: string,
 *   currency: string,
 *   status: string,
 *   checkoutUrl: string
 * }>}
 */
export async function createYouPiPaymentSession(params) {
  const config = { ...getYouPiConfig(), ...(params.configOverride || {}) }
  const fetchFn = params.fetchImpl || globalThis.fetch

  // Ensure amount is formatted as 2-decimal string
  let rupeeString = ''
  if (typeof params.amount === 'number') {
    rupeeString = params.amount.toFixed(2)
  } else if (typeof params.amount === 'string') {
    const num = parseFloat(params.amount.trim())
    if (isNaN(num) || num <= 0) {
      throw new Error(`Invalid payment amount: ${params.amount}`)
    }
    rupeeString = num.toFixed(2)
  } else {
    throw new Error(`Invalid amount format: ${typeof params.amount}`)
  }

  const url = `${config.apiUrl}/api/v1/payments`
  const headers = {
    'Content-Type': 'application/json',
  }

  // Follow official YouPI-PG OpenAPI & SDK: X-Merchant-Id and X-Merchant-Key are passed when configured
  if (config.merchantId) {
    headers['X-Merchant-Id'] = config.merchantId
  }
  if (config.merchantKey) {
    headers['X-Merchant-Key'] = config.merchantKey
  }

  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey
  }

  const payload = {
    orderId: params.orderId,
    amount: rupeeString,
    currency: params.currency || 'INR',
    returnUrl: params.returnUrl || config.returnUrl || undefined,
    customer: params.customer || undefined,
    metadata: {
      source: 'xbuddy',
      service: 'print_order',
      ...(params.metadata || {}),
    },
  }

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`YouPI-PG payment initiation failed [HTTP ${res.status}]: ${errText}`)
  }

  return await res.json()
}

/**
 * Authoritatively verifies an incoming YouPI-PG webhook delivery.
 *
 * Contract:
 * - Signature Headers: X-Gateway-Signature ("sha256=<hex>") and/or X-Gateway-Signature-V2 ("sha256=<hex>")
 * - Timestamp: X-Gateway-Timestamp or payload.timestamp
 * - Delivery ID: X-Gateway-Delivery-Id
 * - Algorithm: HMAC-SHA256(secret, rawBody) OR HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * - Replay window: Default 2 hours, accommodating full retry schedule (up to 1h 12m)
 *
 * @param {{
 *   rawBody: string|Buffer,
 *   signatureHeader?: string,
 *   signatureV2Header?: string,
 *   timestampHeader?: string|number,
 *   deliveryIdHeader?: string,
 *   secret?: string,
 *   toleranceMs?: number
 * }} options
 * @returns {Record<string, any>} Verified webhook event object
 */
export function verifyYouPiWebhook(options) {
  const {
    rawBody,
    signatureHeader,
    signatureV2Header,
    timestampHeader,
    deliveryIdHeader,
    secret: customSecret,
    toleranceMs = 2 * 60 * 60 * 1000, // 2-hour tolerance window matching gateway retry backoff
  } = options || {}

  const secret = customSecret || getYouPiConfig().webhookSecret
  if (!secret) {
    throw new Error('Webhook verification failed: webhookSecret is not configured.')
  }

  if (!rawBody || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    throw new Error('Webhook verification failed: rawBody is required for signature verification.')
  }

  const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')

  const effectiveSigHeader = signatureHeader || signatureV2Header
  if (!effectiveSigHeader || typeof effectiveSigHeader !== 'string' || !effectiveSigHeader.startsWith('sha256=')) {
    throw new Error('Webhook verification failed: invalid signature header format (expected sha256=...).')
  }

  // 1. Verify timestamp header if supplied
  if (timestampHeader !== undefined && timestampHeader !== null) {
    const tsNum = Number(timestampHeader)
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > toleranceMs) {
      throw new Error('Webhook verification failed: timestamp header outside tolerance window (replay protection).')
    }
  }

  // 2. Perform constant-time HMAC check against raw body and/or `${timestamp}.${rawBody}`
  let sigValid = false

  if (signatureHeader && signatureHeader.startsWith('sha256=')) {
    const sigHex = signatureHeader.slice('sha256='.length).trim()
    if (verifyHmacConstantTime(rawBodyString, secret, sigHex)) {
      sigValid = true
    } else if (timestampHeader !== undefined && timestampHeader !== null && verifyHmacConstantTime(`${timestampHeader}.${rawBodyString}`, secret, sigHex)) {
      sigValid = true
    }
  }

  if (!sigValid && signatureV2Header && signatureV2Header.startsWith('sha256=')) {
    const sigV2Hex = signatureV2Header.slice('sha256='.length).trim()
    if (timestampHeader !== undefined && timestampHeader !== null && verifyHmacConstantTime(`${timestampHeader}.${rawBodyString}`, secret, sigV2Hex)) {
      sigValid = true
    } else if (verifyHmacConstantTime(rawBodyString, secret, sigV2Hex)) {
      sigValid = true
    }
  }

  if (!sigValid) {
    throw new Error('Webhook verification failed: cryptographic signature mismatch.')
  }

  // 3. Parse JSON body AFTER signature is verified
  let parsed = null
  try {
    parsed = JSON.parse(rawBodyString)
  } catch (parseErr) {
    throw new Error(`Webhook verification failed: malformed JSON payload: ${parseErr.message}`)
  }

  // 4. Verify embedded timestamp in payload if present
  if (parsed && parsed.timestamp !== undefined && parsed.timestamp !== null) {
    const bodyTs = Number(parsed.timestamp)
    if (!Number.isFinite(bodyTs) || Math.abs(Date.now() - bodyTs) > toleranceMs) {
      throw new Error('Webhook verification failed: signed payload timestamp outside tolerance window.')
    }
    if (timestampHeader !== undefined && timestampHeader !== null && String(timestampHeader).trim() !== String(parsed.timestamp).trim()) {
      throw new Error('Webhook verification failed: header timestamp does not match signed payload timestamp.')
    }
  }

  // 5. Verify delivery ID header matches payload if both supplied
  if (deliveryIdHeader && parsed && parsed.deliveryId && String(deliveryIdHeader).trim() !== String(parsed.deliveryId).trim()) {
    throw new Error('Webhook verification failed: deliveryId header does not match signed payload deliveryId.')
  }

  return parsed
}
