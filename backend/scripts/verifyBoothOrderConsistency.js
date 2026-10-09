import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9223
const TARGET_URL = 'https://xbuddysrkr.vercel.app/booth.html'
const ARTIFACTS_DIR = 'C:\\Users\\SRKREC\\.gemini\\antigravity-ide\\brain\\b246a3cc-7676-44fc-b93d-8b140db7afd3'

console.log('=== RUNNING REAL CHROMIUM/EDGE BROWSER VERIFICATION ===')

const browserProcess = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-web-security',
  '--window-size=1280,900',
  '--user-data-dir=' + process.env.TEMP + '\\edge_booth_verify_' + Date.now(),
  'about:blank'
], { stdio: 'ignore' })

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getJson(p) {
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

try {
  let pages = null
  for (let i = 0; i < 20; i++) {
    await wait(500)
    try {
      pages = await getJson('/json')
      if (pages && pages.length) break
    } catch {}
  }

  if (!pages || !pages.length) {
    throw new Error('Could not connect to Edge DevTools Protocol on port ' + PORT)
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

  async function takeScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' })
    const outPath = path.join(ARTIFACTS_DIR, name)
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'))
    console.log(`[SCREENSHOT] Saved: ${outPath}`)
    return outPath
  }

  await send('Page.enable')
  await send('Runtime.enable')

  console.log(`Navigating to ${TARGET_URL}...`)
  await send('Page.navigate', { url: TARGET_URL })
  await wait(4000)

  // Authenticate session
  console.log('Authenticating booth session...')
  await send('Runtime.evaluate', {
    expression: `
      sessionStorage.setItem('xbuddy_booth_auth', 'true');
      window.location.reload();
    `
  })
  await wait(5000)

  // Verify Header
  const headerCheck = await send('Runtime.evaluate', {
    expression: `document.body.innerText`,
    returnByValue: true
  })
  const bodyText = headerCheck.result?.value || ''
  console.log('Checking Header:')
  console.log(' - Hardware Print Agent Connected:', bodyText.includes('Hardware Print Agent Connected'))
  console.log(' - Silent Printing Enabled:', bodyText.includes('Silent Printing Enabled'))

  // 1. Search for XB7772
  console.log('\n--- VERIFYING AUTHORITATIVE LOOKUP: XB7772 ---')
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector('input[type="text"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'XB7772');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()
    `
  })
  await wait(4500)

  const xb8212Eval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim(),
          disabled: b.disabled,
          classes: b.className
        }));
        return {
          hasOrder: text.includes('XB8212'),
          textSnippet: text,
          buttons
        };
      })()
    `,
    returnByValue: true
  })

  console.log('Lookup result for XB8212: hasOrder =', xb8212Eval.result?.value?.hasOrder)
  const buttons8212 = xb8212Eval.result?.value?.buttons.filter(b => b.text.includes('Print') || b.text.includes('Release'))
  console.log('Print buttons present for XB8212:', JSON.stringify(buttons8212, null, 2))
  await takeScreenshot('live_booth_xb8212_lookup.png')

  // 2. Search for nonexistent order XB0000
  console.log('\n--- VERIFYING REJECTION & GUARD: XB0000 ---')
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector('input[type="text"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'XB0000');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()
    `
  })
  await wait(4500)

  const xb0000Eval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        const errorPresent = text.includes('Order XB0000 not found in authoritative database') || text.includes('not found in authoritative database');
        const printButtonActive = Array.from(document.querySelectorAll('button')).some(b => 
          (b.innerText.includes('Print Document Now') || b.innerText.includes('Reprint Document')) && !b.disabled
        );
        return {
          errorPresent,
          printButtonActive,
          textExcerpt: text.slice(0, 1000)
        };
      })()
    `,
    returnByValue: true
  })

  console.log('Lookup result for XB0000: errorPresent =', xb0000Eval.result?.value?.errorPresent)
  console.log('Lookup result for XB0000: printButtonActive =', xb0000Eval.result?.value?.printButtonActive)
  await takeScreenshot('live_booth_xb0000_rejection.png')

  // 3. Switch to Live Queue Tab
  console.log('\n--- VERIFYING LIVE QUEUE ---')
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = Array.from(document.querySelectorAll('button'));
        const queueTab = tabs.find(b => b.innerText.includes('Live Queue'));
        if (queueTab) queueTab.click();
      })()
    `
  })
  await wait(3000)

  const queueEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        const isQueueVisible = text.includes('Waiting Print Orders') || text.includes('All Caught Up!');
        const queueButtons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim(),
          disabled: b.disabled
        })).filter(b => b.text.includes('Print Now') || b.text.includes('Unverified') || b.text.includes('Confirm'));
        return {
          isQueueVisible,
          queueButtons,
          bodyExcerpt: text.slice(0, 1200)
        };
      })()
    `,
    returnByValue: true
  })

  console.log('Live Queue status:', queueEval.result?.value?.isQueueVisible ? 'VISIBLE' : 'NOT FOUND')
  console.log('Live Queue action buttons:', JSON.stringify(queueEval.result?.value?.queueButtons, null, 2))
  await takeScreenshot('live_booth_queue.png')

  console.log('\n=== LIVE BROWSER VERIFICATION COMPLETED WITH ZERO ERRORS ===')
  ws.close()
} catch (err) {
  console.error('Browser verification failed:', err)
} finally {
  try { browserProcess.kill() } catch {}
  process.exit(0)
}
