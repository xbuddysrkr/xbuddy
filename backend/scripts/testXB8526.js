import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9228

const browser = spawn(EDGE_PATH, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--disable-gpu',
  '--no-first-run',
  '--user-data-dir=' + process.env.TEMP + '\\edge_test_' + Date.now(),
  'https://xbuddysrkr.vercel.app/booth.html'
], { stdio: 'ignore' })

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }
async function getJson(p) {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:' + PORT + p, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

;(async () => {
  try {
    let pages = null
    for (let i = 0; i < 20; i++) {
      await wait(500)
      try { pages = await getJson('/json'); if (pages && pages.length) break } catch {}
    }
    const ws = new globalThis.WebSocket(pages[0].webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 1
    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const curId = id++
        const h = (e) => {
          const m = JSON.parse(e.data)
          if (m.id === curId) { ws.removeEventListener('message', h); if (m.error) rej(m.error); else res(m.result) }
        }
        ws.addEventListener('message', h)
        ws.send(JSON.stringify({ id: curId, method, params }))
      })
    }
    await send('Runtime.enable')
    await wait(3000)
    await send('Runtime.evaluate', { expression: "sessionStorage.setItem('xbuddy_booth_auth', 'true'); location.reload();" })
    await wait(5000)

    // 1. In-browser fetch test to Render API
    const fetchRes = await send('Runtime.evaluate', {
      expression: `
        fetch('https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB8526')
          .then(r => r.json())
          .catch(e => ({ error: e.message }))
      `,
      awaitPromise: true,
      returnByValue: true
    })
    console.log('In-browser fetch response for XB8526:', JSON.stringify(fetchRes.result?.value, null, 2))

    // 2. Perform search via UI
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const input = document.querySelector('input[type="text"]');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, 'XB8526');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();
        })()
      `
    })

    await wait(8000)

    const uiCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            bodyText: document.body.innerText,
            buttons: Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim(), disabled: b.disabled }))
          };
        })()
      `,
      returnByValue: true
    })

    console.log('UI body text includes XB8526:', uiCheck.result?.value?.bodyText.includes('XB8526'))
    console.log('UI body text includes Unverified:', uiCheck.result?.value?.bodyText.includes('Unverified'))
    console.log('UI buttons:', uiCheck.result?.value?.buttons.filter(b => b.text.includes('Print') || b.text.includes('Release')))

    ws.close()
  } catch(e) {
    console.error(e)
  } finally {
    browser.kill()
    process.exit(0)
  }
})()
