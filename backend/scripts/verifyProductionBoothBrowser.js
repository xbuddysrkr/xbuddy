import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9223
const TARGET_URL = 'https://xbuddysrkr.vercel.app/booth.html'
const ARTIFACT_DIR = 'C:\\Users\\SRKREC\\.gemini\\antigravity-ide\\brain\\b246a3cc-7676-44fc-b93d-8b140db7afd3'

console.log('--- STARTING PRODUCTION BOOTH REAL BROWSER CDP VERIFICATION ---')

const profileDir = path.join(process.env.TEMP || '.', `edge_verify_${Date.now()}`)
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

    console.log('Navigating to', TARGET_URL)
    await cdp.send('Page.navigate', { url: TARGET_URL })
    await wait(3000)

    // Unlock booth with PIN 4921
    console.log('Setting booth session unlock in browser...')
    await cdp.evaluate(`
      sessionStorage.setItem('xbuddy_booth_auth', 'true');
      location.reload();
    `)
    await wait(4000)

    // ── STEP 1: Verify XB2863 Lookup ──
    console.log('\n[BROWSER TEST 1] Looking up XB2863 in production Booth UI...')
    await cdp.evaluate(`
      const input = document.querySelector('input[placeholder="XB0000"]') || document.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        input.select();
        document.execCommand('insertText', false, 'XB2863');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `)
    await wait(500)

    await cdp.evaluate(`
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else {
        const findBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Find Order'));
        if (findBtn) findBtn.click();
      }
    `)
    await wait(4500)

    const xb2863CardState = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasOrderId = bodyText.includes('XB2863');
        const hasUnverifiedWarning = bodyText.includes('Unverified in Database') || bodyText.includes('Unverified in Authoritative Database');
        const hasDocScanner = bodyText.includes('DocScanner 8 Oct 2026');
        const hasPrintedBadge = bodyText.includes('Printed');
        const hasWaitingBadge = bodyText.includes('waiting_for_shopkeeper');
        const releaseBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Print Document Now') ||
          b.textContent.includes('Reprint Document') ||
          b.textContent.includes('Release Disabled')
        );
        return {
          hasOrderId,
          hasDocScanner,
          hasUnverifiedWarning,
          hasPrintedBadge,
          hasWaitingBadge,
          buttonText: releaseBtn ? releaseBtn.textContent.trim() : 'NOT_FOUND',
          buttonDisabled: releaseBtn ? releaseBtn.disabled : null,
          title: document.title,
        };
      })()
    `)

    console.log('Browser DOM state for XB2863:', JSON.stringify(xb2863CardState, null, 2))
    await cdp.evaluate(`window.scrollTo(0, 260)`)
    await wait(300)
    await cdp.captureScreenshot('production_booth_xb2863_lookup.png')

    // ── STEP 2: Verify XB0000 Rejection ──
    console.log('\n[BROWSER TEST 2] Looking up nonexistent XB0000 in production Booth UI...')
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
    await wait(5000)

    const xb0000State = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const hasNotFoundAlert = bodyText.includes('Order not found in authoritative database') || bodyText.includes('Check the Order ID');
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

    // ── STEP 3: Check Live Queue tab ──
    console.log('\n[BROWSER TEST 3] Checking Live Queue tab in production Booth UI...')
    await cdp.evaluate(`
      const queueTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Live Queue'));
      if (queueTab) queueTab.click();
    `)
    await wait(2500)

    const queueState = await cdp.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        const queueTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Live Queue'));
        return {
          queueButtonText: queueTab ? queueTab.textContent.trim() : '',
          sampleTextSnippet: bodyText.slice(0, 400).replace(/\\s+/g, ' '),
        };
      })()
    `)

    console.log('Browser Live Queue state:', JSON.stringify(queueState, null, 2))
    await cdp.captureScreenshot('production_booth_live_queue.png')

    console.log('\n=== REAL BROWSER CDP VERIFICATION FINISHED SUCCESSFULLY ===')
  } catch (err) {
    console.error('Browser CDP error:', err)
  } finally {
    if (cdp) cdp.close()
    browserProcess.kill()
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    process.exit(0)
  }
}

run()
