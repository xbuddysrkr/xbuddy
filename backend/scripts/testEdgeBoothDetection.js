import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9222
const TARGET_URL = 'https://xbuddysrkr.vercel.app/booth.html'

console.log('--- STARTING CHROMIUM/EDGE REAL BROWSER DIAGNOSTIC ---')

// 1. Launch Edge with remote debugging port
const browserProcess = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-web-security',
  '--user-data-dir=' + process.env.TEMP + '\\edge_test_profile_' + Date.now(),
  'about:blank'
], { stdio: 'ignore' })

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

try {
  // Wait for Edge to open debugger port
  let pages = null
  for (let i = 0; i < 20; i++) {
    await wait(500)
    try {
      pages = await getJson('/json')
      if (pages && pages.length) break
    } catch {}
  }

  if (!pages || !pages.length) {
    throw new Error('Could not connect to Edge DevTools Protocol')
  }

  const targetPage = pages.find(p => p.type === 'page') || pages[0]
  const wsUrl = targetPage.webSocketDebuggerUrl
  console.log('Connected to Chromium/Edge CDP WebSocket:', wsUrl)

  const ws = new globalThis.WebSocket(wsUrl)

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  let msgId = 1
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++
      const handler = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === id) {
          ws.removeEventListener('message', handler)
          if (msg.error) reject(msg.error)
          else resolve(msg.result)
        }
      }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  // Enable Page, Runtime & Network
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')

  // Capture console messages & network errors
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value || a.description).join(' ')
        console.log(`[Browser Console]:`, args)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.log(`[Browser Exception]:`, msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description)
      } else if (msg.method === 'Network.loadingFailed') {
        console.log(`[Network Failed]:`, msg.params.requestId, msg.params.errorText, msg.params.canceled, msg.params.blockedReason, msg.params.corsErrorStatus)
      } else if (msg.method === 'Network.requestWillBeSent') {
        if (msg.params.request.url.includes('3001') || msg.params.request.url.includes('status')) {
          console.log(`[Network Request]:`, msg.params.request.method, msg.params.request.url, msg.params.request.headers)
        }
      } else if (msg.method === 'Network.responseReceived') {
        if (msg.params.response.url.includes('3001') || msg.params.response.url.includes('status')) {
          console.log(`[Network Response]:`, msg.params.response.status, msg.params.response.url, msg.params.response.headers)
        }
      }
    } catch {}
  })

  console.log(`Navigating to ${TARGET_URL}...`)
  await send('Page.navigate', { url: TARGET_URL })

  // Wait for navigation and initial render
  await wait(4000)

  // Evaluate document text and check if PIN entry is needed
  let evalRes = await send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true
  })
  let text = evalRes.result?.value || ''
  console.log('\nInitial page text snippet:\n', text.substring(0, 300))

    // Authenticate and reload into dashboard
    console.log('Authenticating booth session via sessionStorage...')
    await send('Runtime.evaluate', {
      expression: `
        sessionStorage.setItem('xbuddy_booth_auth', 'true');
        window.location.reload();
      `
    })

    // Wait for reload and agent status polling
    console.log('Waiting for reload and agent status polling (6s)...')
    await wait(6000)

  // Probe in-browser fetch directly to http://127.0.0.1:3001/status from the page context
  const inBrowserFetch = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        try {
          const r = await fetch('http://127.0.0.1:3001/status');
          const data = await r.json();
          return { success: true, status: r.status, data };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  })
  console.log('\nIn-Browser fetch to http://127.0.0.1:3001/status result:')
  console.log(JSON.stringify(inBrowserFetch.result?.value, null, 2))

  // Inspect DOM for Print Station Status
  evalRes = await send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true
  })
  text = evalRes.result?.value || ''

  console.log('\nCurrent Page Text on Live Booth:')
  console.log('Contains "Hardware Print Agent Connected":', text.includes('Hardware Print Agent Connected'))
  console.log('Contains "Silent Printing Enabled":', text.includes('Silent Printing Enabled'))
  console.log('Contains "Print Station Offline":', text.includes('Print Station Offline'))

  console.log('\nPage body extract:\n', text.slice(0, 600))

  ws.close()
} catch (err) {
  console.error('Diagnostic error:', err)
} finally {
  try { browserProcess.kill() } catch {}
  process.exit(0)
}
