import crypto from 'crypto'

export default async function handler(req, res) {
  try {
    const rawUrl = req.url || ''
    const urlObj = new URL(rawUrl, 'http://localhost')
    const action = (urlObj.searchParams.get('action') || req.body?.action || '').trim()

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
