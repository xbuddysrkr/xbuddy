import crypto from 'crypto'

export default async function handler(req, res) {
  try {
    const rawUrl = req.url || ''
    const urlObj = new URL(rawUrl, 'http://localhost')
    const action = (urlObj.searchParams.get('action') || req.body?.action || '').trim()

    if (action === 'verifyPreviewPassword') {
      const password = String(req.body?.password || urlObj.searchParams.get('password') || '')
      const expectedPassword = process.env.BOOTH_PREVIEW_PASSWORD || 'XBuddy@4921'
      const orderId = String(req.body?.orderId || urlObj.searchParams.get('orderId') || '').trim().toUpperCase()

      if (password === expectedPassword) {
        const secret = process.env.JWT_SECRET || process.env.AGENT_SECRET || 'xbuddy_preview_token_secret_4921'
        const expiresAt = Date.now() + 5 * 60 * 1000
        const hmac = crypto.createHmac('sha256', secret).update(`${orderId}:${expiresAt}`).digest('hex')
        const previewToken = `${expiresAt}.${hmac}`

        return res.status(200).json({
          success: true,
          message: 'Preview access granted',
          orderId,
          previewToken,
          previewUrl: `/api/orders?action=getPdf&orderId=${encodeURIComponent(orderId)}&token=${previewToken}`,
        })
      }

      return res.status(401).json({
        success: false,
        error: 'Incorrect preview password. Access denied.',
      })
    }

    const targetUrl = `https://xbuddy.onrender.com${rawUrl.startsWith('/api') ? rawUrl : '/api/orders' + rawUrl}`
    const headers = { ...req.headers, host: 'xbuddy.onrender.com' }
    delete headers['content-length']
    let body = undefined
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })
    res.status(response.status)
    response.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, val)
      }
    })
    const data = await response.text()
    return res.send(data)
  } catch (err) {
    console.error('[API Orders Proxy Error]:', err.message)
    return res.status(503).json({ success: false, error: 'Proxy to canonical Orders API failed', details: err.message })
  }
}
