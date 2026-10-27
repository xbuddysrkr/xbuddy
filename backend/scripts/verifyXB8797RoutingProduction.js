import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9224
const TARGET_URL = 'https://xbuddysrkr.vercel.app/booth.html'
const ARTIFACT_DIR = 'C:\\Users\\SRKREC\\.gemini\\antigravity-ide\\brain\\b246a3cc-7676-44fc-b93d-8b140db7afd3'

console.log('--- STARTING XB8797 REAL BROWSER CDP PRODUCTION ROUTING VERIFICATION ---')

const profileDir = path.join(process.env.TEMP || '.', `edge_verify_xb8797_${Date.now()}`)
const browserProcess = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDir}`,
  'about:blank'
], { stdio: 'ignore' })

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${p}`, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new globalThis.WebSocket(wsUrl)
    this.id = 1
    this.callbacks = new Map()
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve)
      this.ws.addEventListener('error', reject)
      this.ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data)
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id)
          this.callbacks.delete(msg.id)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      })
    })
  }

  async send(method, params = {}) {
    const id = this.id++
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return res.result?.value
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    const buf = Buffer.from(res.data, 'base64')
    const outPath = path.join(ARTIFACT_DIR, filename)
    fs.writeFileSync(outPath, buf)
    console.log(`Saved screenshot: ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`)
    return outPath
  }

  close() {
    try { this.ws.close() } catch {}
  }
}

async function run() {
  let cdp = null
  try {
    let pages = null
    for (let i = 0; i < 20; i++) {
      await wait(500)
      try {
        pages = await getJson('/json')
        if (pages && pages.length) break
      } catch {}
    }

    const targetPage = pages.find(p => p.type === 'page') || pages[0]
    cdp = new CDPClient(targetPage.webSocketDebuggerUrl)
    await cdp.connect()

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')

    console.log('Navigating to', TARGET_URL)
    await cdp.send('Page.navigate', { url: TARGET_URL })
    await wait(3000)

    // Unlock booth with PIN
    console.log('Authenticating booth session...')
    await cdp.evaluate(`
      sessionStorage.setItem('xbuddy_booth_auth', 'true');
      location.reload();
    `)
    await wait(4000)

    // Check loaded bundle scripts
    const loadedScripts = await cdp.evaluate(`
      Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean)
    `)
    console.log('Loaded scripts in production Booth:', loadedScripts)

    // ── TEST 1: Lookup Target Order XB8797 ──
    console.log('\n[TEST 1] Looking up target order XB8797 in production Booth...')
    await cdp.evaluate(`
      const input = document.querySelector('input[placeholder="XB0000"]') || document.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        input.select();
        document.execCommand('insertText', false, 'XB8797');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `)
    await wait(500)

    await cdp.evaluate(`
      const findBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Find Order'));
      if (findBtn) findBtn.click();
    `)
    await wait(4500)

    const xb8797State = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasOrderId = bodyText.includes('XB8797');
        const hasUnverifiedWarning = bodyText.includes('Unverified in Database') || bodyText.includes('Unverified in Authoritative Database');
        const hasDocScanner = bodyText.includes('DocScanner 8 Oct 2026') || bodyText.includes('DocScanner');
        const hasWaitingStatus = bodyText.includes('waiting_for_shopkeeper') || bodyText.includes('Waiting for Shopkeeper') || bodyText.includes('Pending Print');
        const hasPendingPayment = bodyText.includes('pending') || bodyText.includes('Payment Pending') || bodyText.includes('Verify UPI Payment');
        const releaseBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Print Document Now') ||
          b.textContent.includes('Reprint Document') ||
          b.textContent.includes('Release Disabled')
        );
        return {
          hasOrderId,
          hasDocScanner,
          hasUnverifiedWarning,
          hasWaitingStatus,
          hasPendingPayment,
          buttonText: releaseBtn ? releaseBtn.textContent.trim() : 'NOT_FOUND',
          buttonDisabled: releaseBtn ? releaseBtn.disabled : null,
        };
      })()
    `)
    console.log('Browser DOM state for XB8797:', JSON.stringify(xb8797State, null, 2))
    await cdp.evaluate(`window.scrollTo(0, 260)`)
    await wait(300)
    await cdp.captureScreenshot('production_booth_xb8797_lookup.png')

    // ── TEST 2: Nonexistent Order XB0000 Rejection ──
    console.log('\n[TEST 2] Looking up nonexistent order XB0000 in production Booth...')
    await cdp.evaluate(`
      const input = document.querySelector('input[placeholder="XB0000"]') || document.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        input.select();
      }
    `)
    await wait(200)
    await cdp.send('Input.insertText', { text: 'XB0000' })
    await wait(500)

    await cdp.evaluate(`
      const findBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Find Order'));
      if (findBtn) findBtn.click();
    `)
    await wait(4500)

    const xb0000State = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasNotFoundAlert = bodyText.includes('Order XB0000 not found in authoritative database') || bodyText.includes('Check the Order ID');
        const hasCard = bodyText.includes('XB0000');
        return {
          hasNotFoundAlert,
          hasCard,
          bodySnippet: bodyText.slice(0, 500).replace(/\\s+/g, ' ')
        };
      })()
    `)
    console.log('Browser DOM state for XB0000:', JSON.stringify(xb0000State, null, 2))
    await cdp.captureScreenshot('production_booth_xb0000_rejection.png')

    // ── TEST 3: Live Queue Tab Agreement ──
    console.log('\n[TEST 3] Checking Live Queue tab in production Booth...')
    await cdp.evaluate(`
      const queueTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Live Queue'));
      if (queueTab) queueTab.click();
    `)
    await wait(3000)

    const queueState = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasXB8797InQueue = bodyText.includes('XB8797');
        const queueTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Live Queue'));
        return {
          queueButtonText: queueTab ? queueTab.textContent.trim() : '',
          hasXB8797InQueue,
          bodySnippet: bodyText.slice(0, 500).replace(/\\s+/g, ' ')
        };
      })()
    `)
    console.log('Browser Live Queue state:', JSON.stringify(queueState, null, 2))
    await cdp.captureScreenshot('production_booth_live_queue.png')

    // ── TEST 4: Direct In-Browser HTML and 404 Contract Evaluation ──
    console.log('\n[TEST 4] Evaluating in-browser API contract for HTML, 404, and valid JSON responses...')
    const contractResults = await cdp.evaluate(`
      (async () => {
        // Import getOrderStatus from bundle
        const { getOrderStatus, isHtmlResponse } = await import('/src/utils/api.js');
        
        // 1. Target order XB8797
        const res8797 = await getOrderStatus('XB8797');
        
        // 2. Nonexistent order XB0000
        const res0000 = await getOrderStatus('XB0000');
        
        // 3. HTML response detection test
        const htmlSample = '<!DOCTYPE html><html><body><script src="/assets/main-123.js"></script></body></html>';
        const detectedAsHtml = isHtmlResponse(htmlSample, 'text/html');

        return {
          xb8797: {
            success: res8797?.success,
            orderId: res8797?.orderId,
            verified: res8797?.verified,
            verifiedInMongo: res8797?.verifiedInMongo,
            printStatus: res8797?.printStatus,
            paymentStatus: res8797?.paymentStatus,
            notFound: res8797?.notFound,
            unavailable: res8797?.unavailable,
          },
          xb0000: {
            success: res0000?.success,
            notFound: res0000?.notFound,
            unavailable: res0000?.unavailable,
            error: res0000?.error,
          },
          htmlSafety: {
            detectedAsHtml,
          }
        };
      })()
    `)
    console.log('In-browser contract verification results:', JSON.stringify(contractResults, null, 2))

    console.log('\n=== REAL BROWSER CDP PRODUCTION ROUTING VERIFICATION COMPLETED ===')
  } catch (err) {
    console.error('CDP verification error:', err)
  } finally {
    if (cdp) cdp.close()
    browserProcess.kill()
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
  }
}

run()
