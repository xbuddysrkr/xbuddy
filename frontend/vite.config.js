import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

function serverlessDevPlugin() {
  return {
    name: 'serverless-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && (req.url.startsWith('/api/agent/orders') || req.url.startsWith('/api/orders'))) {
          // If MONGODB_URI is not configured locally, proxy to deployed Vercel cloud API
          if (!process.env.MONGODB_URI) {
            try {
              const baseUrl = (process.env.VITE_BACKEND_URL || process.env.VITE_API_URL || 'https://xbuddy.onrender.com').replace(/\/$/, '')
              const targetUrl = `${baseUrl}${req.url}`
              const buffers = []
              for await (const chunk of req) buffers.push(chunk)
              const body = Buffer.concat(buffers)

              const proxyHeaders = { ...req.headers, host: new URL(baseUrl).host }
              delete proxyHeaders['content-length']

              const proxyRes = await fetch(targetUrl, {
                method: req.method,
                headers: proxyHeaders,
                body: (req.method !== 'GET' && req.method !== 'HEAD') ? body : undefined,
              })

              res.statusCode = proxyRes.status
              proxyRes.headers.forEach((v, k) => {
                if (k.toLowerCase() !== 'content-encoding') res.setHeader(k, v)
              })
              const arrayBuf = await proxyRes.arrayBuffer()
              res.end(Buffer.from(arrayBuf))
              return
            } catch (proxyErr) {
              console.error('[Vite Proxy to Vercel Error]:', proxyErr.message)
            }
          }

          try {
            const isAgent = req.url.startsWith('/api/agent/orders')
            const modulePath = isAgent ? '/api/agent/orders.js' : '/api/orders.js'
            const { default: handler } = await server.ssrLoadModule(modulePath)
            let body = {}
            if (req.method === 'POST') {
              const buffers = []
              for await (const chunk of req) buffers.push(chunk)
              const data = Buffer.concat(buffers).toString()
              try { body = JSON.parse(data) } catch {}
            }
            req.body = body
            req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
            
            res.status = (code) => { res.statusCode = code; return res }
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
              return res
            }

            return await handler(req, res)
          } catch (err) {
            console.error('[Vite Serverless Dev Error]:', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: err.message }))
            return
          }
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), serverlessDevPlugin()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        booth: resolve(__dirname, 'booth.html'),
      }
    }
  }
})

