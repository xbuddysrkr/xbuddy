import crypto from 'crypto'

/**
 * Constant-time safe string comparison to prevent timing attacks
 */
export function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf-8')
  const bufB = Buffer.from(b, 'utf-8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// ── Rate Limiting Sliding Window (In-Memory) ──────────────────────────────────
const PIN_MAX_ATTEMPTS = 5
const PIN_LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes
const pinAttemptMap = new Map()

export function checkPinRateLimit(ip) {
  const now = Date.now()
  const record = pinAttemptMap.get(ip)
  if (!record) return { allowed: true }

  if (now - record.firstAttemptTime > PIN_LOCKOUT_MS) {
    pinAttemptMap.delete(ip)
    return { allowed: true }
  }

  if (record.count >= PIN_MAX_ATTEMPTS) {
    const remainingSecs = Math.ceil((record.firstAttemptTime + PIN_LOCKOUT_MS - now) / 1000)
    return { allowed: false, remainingSecs }
  }

  return { allowed: true }
}

export function recordPinFailure(ip) {
  const now = Date.now()
  const record = pinAttemptMap.get(ip)
  if (!record || now - record.firstAttemptTime > PIN_LOCKOUT_MS) {
    pinAttemptMap.set(ip, { count: 1, firstAttemptTime: now })
  } else {
    record.count += 1
  }
}

export function resetPinAttempts(ip) {
  pinAttemptMap.delete(ip)
}

// ── Preview Password Rate Limiting ────────────────────────────────────────────
const PREVIEW_MAX_ATTEMPTS = 5
const PREVIEW_LOCKOUT_MS = 5 * 60 * 1000
const previewAttemptMap = new Map()

export function checkPreviewRateLimit(ip) {
  const now = Date.now()
  const record = previewAttemptMap.get(ip)
  if (!record) return { allowed: true }

  if (now - record.firstAttemptTime > PREVIEW_LOCKOUT_MS) {
    previewAttemptMap.delete(ip)
    return { allowed: true }
  }

  if (record.count >= PREVIEW_MAX_ATTEMPTS) {
    const remainingSecs = Math.ceil((record.firstAttemptTime + PREVIEW_LOCKOUT_MS - now) / 1000)
    return { allowed: false, remainingSecs }
  }

  return { allowed: true }
}

export function recordPreviewFailure(ip) {
  const now = Date.now()
  const record = previewAttemptMap.get(ip)
  if (!record || now - record.firstAttemptTime > PREVIEW_LOCKOUT_MS) {
    previewAttemptMap.set(ip, { count: 1, firstAttemptTime: now })
  } else {
    record.count += 1
  }
}

export function resetPreviewAttempts(ip) {
  previewAttemptMap.delete(ip)
}

// ── Server-Side Session & Token Signing Secret (No Hardcoded Fallback) ──────
export function getSessionSecret() {
  const secret = (
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.AGENT_SECRET_KEY ||
    process.env.AGENT_SECRET ||
    process.env.AUTH_SECRET
  )
  return secret ? String(secret).trim() : null
}

// ── Station Session Token (8-Hour Lifetime) ───────────────────────────────────
export function generateBoothSessionToken() {
  const secret = getSessionSecret()
  if (!secret) return null

  const expiresAt = Date.now() + 8 * 60 * 60 * 1000 // 8 hours
  const payload = `booth_station:${expiresAt}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${expiresAt}.${sig}`
}

export function verifyBoothSessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false
  const secret = getSessionSecret()
  if (!secret) return false

  const [expiresAtStr, sig] = token.split('.')
  const expiresAt = Number(expiresAtStr)
  if (isNaN(expiresAt) || expiresAt < Date.now()) return false

  const payload = `booth_station:${expiresAt}`
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return safeCompare(sig, expectedSig)
}

// ── Single-Use PDF Preview Token (Nonce-Backed & Replay Protected) ────────────
export function generatePreviewToken(orderId) {
  const secret = getSessionSecret()
  if (!secret) return null

  const cleanId = String(orderId || '').trim().toUpperCase()
  const expiresAt = Date.now() + 60 * 1000 // 60 seconds lifetime
  const nonce = crypto.randomBytes(16).toString('hex')
  const payload = `preview:${cleanId}:${expiresAt}:${nonce}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${expiresAt}.${nonce}.${sig}`
}

export function verifyPreviewToken(orderId, token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing_token' }
  const cleanId = String(orderId || '').trim().toUpperCase()
  const parts = token.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed_token' }

  const [expiresAtStr, nonce, sig] = parts
  const expiresAt = Number(expiresAtStr)
  if (isNaN(expiresAt) || expiresAt < Date.now()) {
    return { valid: false, reason: 'expired' }
  }

  const secret = getSessionSecret()
  if (!secret) return { valid: false, reason: 'misconfigured_secret' }

  const payload = `preview:${cleanId}:${expiresAt}:${nonce}`
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!safeCompare(sig, expectedSig)) {
    return { valid: false, reason: 'invalid_signature' }
  }

  const tokenId = `${cleanId}:${nonce}:${sig.slice(0, 16)}`
  return { valid: true, expiresAt, nonce, tokenId }
}

// ── Shared Preview Token Consumption & Replay Prevention ─────────────────────
let previewTokenIndexInitPromise = null

export async function ensurePreviewTokenIndexes(col) {
  if (!previewTokenIndexInitPromise) {
    previewTokenIndexInitPromise = Promise.all([
      col.createIndex({ tokenId: 1 }, { unique: true }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch(err => {
      previewTokenIndexInitPromise = null
      throw err
    })
  }
  return previewTokenIndexInitPromise
}

export async function consumePreviewToken(tokenId, orderId, expiresAt, db) {
  if (!tokenId) return { consumed: false, error: 'missing_token_id' }

  // FAIL CLOSED: Shared MongoDB instance is required. Zero in-memory fallback.
  if (!db) {
    console.error('[SECURITY_FAIL_CLOSED] Shared database instance required for preview token consumption.')
    return { consumed: false, error: 'Database unavailable for token consumption' }
  }

  try {
    const col = db.collection('consumed_preview_tokens')
    await ensurePreviewTokenIndexes(col)

    // Atomic insertion leveraging the unique index on tokenId across all serverless instances
    await col.insertOne({
      tokenId,
      orderId,
      consumedAt: new Date(),
      expiresAt: new Date(expiresAt),
    })

    return { consumed: true }
  } catch (err) {
    // MongoDB duplicate key error code 11000 indicates concurrent or sequential replay
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      return { consumed: false, replayed: true }
    }
    console.error('[TOKEN_CONSUMPTION_MONGO_ERROR]:', err.message)
    // Fail closed on any other database or network error
    return { consumed: false, error: err.message }
  }
}

// ── Agent Secret Key Hashes (Pre-hashed SHA-256 for rotation & station auth) ──
const STATIC_AUTHORIZED_KEY_HASHES = new Set([
  'ea4af0179d15ec55173b299b18bbffb8b770589fe9df62b6239aee52eee4f04d',
  '902e8dcb7609727cc887a27e612911d00d06474fac4673099fc4ae852b7f6ab0',
])

export function getAuthorizedKeyHashes() {
  const hashes = new Set(STATIC_AUTHORIZED_KEY_HASHES)
  const envHashesRaw = (process.env.AUTHORIZED_KEY_HASHES || '').trim()
  if (envHashesRaw) {
    envHashesRaw.split(',').forEach(h => {
      const clean = h.trim().toLowerCase()
      if (clean && clean.length === 64) {
        hashes.add(clean)
      }
    })
  }
  return hashes
}

/**
 * Validates agent authentication header or query param against environment keys or authorized hashes.
 */
export function validateAgentAuth(req) {
  if (!req) return false
  const headerKey = req.headers?.['x-agent-key'] ||
    req.headers?.['x-agent-secret'] ||
    req.headers?.['x-agent-secret-key'] ||
    req.query?.agentKey ||
    req.query?.agentSecret
  if (!headerKey || typeof headerKey !== 'string') return false
  const provided = headerKey.trim()
  if (!provided) return false

  // 1. Direct environment match (single or comma-delimited active keys)
  const envKeysRaw = [
    process.env.AGENT_SECRET_KEY,
    process.env.AGENT_SECRET,
    process.env.AGENT_SECRET_KEYS,
  ].filter(Boolean).join(',')

  const validEnvKeys = envKeysRaw.split(',').map(k => k.trim()).filter(Boolean)
  for (const envKey of validEnvKeys) {
    if (safeCompare(provided, envKey)) return true
  }

  // 2. SHA-256 hash match against authorized key registry (static + env-configured)
  const hashed = crypto.createHash('sha256').update(provided).digest('hex')
  const authorizedHashes = getAuthorizedKeyHashes()
  return authorizedHashes.has(hashed)
}

/**
 * Checks if a request comes from an authenticated station session, print agent, or admin.
 */
export function isBoothAuthorized(req) {
  if (!req) return false

  // 1. Print agent authentication (headers preserved, timing-safe & rotation supported)
  if (validateAgentAuth(req)) return true

  // 2. Admin key authentication
  const adminKey = (process.env.ADMIN_KEY || process.env.API_KEY || '').trim()
  const reqAdmin = req.headers?.['x-admin-key'] || req.headers?.['x-api-key']
  if (adminKey && reqAdmin && safeCompare(reqAdmin, adminKey)) return true

  // 2b. Admin password authentication (dashboard staff) - FAIL CLOSED: No hardcoded fallback
  const adminPassword = (process.env.ADMIN_PASSWORD || process.env.ADS_PASSWORD || '').trim()
  const reqAdminPass = req.headers?.['x-admin-password'] || req.body?.adminPassword || req.query?.adminPassword
  if (adminPassword && reqAdminPass && safeCompare(reqAdminPass, adminPassword)) return true

  // 3. Booth session token (HMAC-SHA256 signed session token)
  const authHeader = req.headers?.authorization
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const token = req.headers?.['x-booth-token'] || bearerToken || req.body?.boothToken || req.query?.boothToken
  if (token && verifyBoothSessionToken(token)) return true

  // 4. Test environment relaxation (strictly for test runner when enforcement is not required)
  const configuredPin = process.env.BOOTH_STATION_PIN || process.env.BOOTH_PIN
  if (!configuredPin && process.env.NODE_ENV === 'test' && process.env.ENFORCE_BOOTH_AUTH !== 'true') {
    return true
  }

  return false
}

