import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

function serverlessDevPlugin() {
  return {
    name: 'serverless-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/orders')) {
          try {
            const { default: handler } = await server.ssrLoadModule('/api/orders.js')
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

