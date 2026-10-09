import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9226

const browserProcess = spawn(EDGE_PATH, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--disable-gpu',
  '--no-first-run',
  '--user-data-dir=' + process.env.TEMP + '\\edge_diag_' + Date.now(),
  'https://xbuddysrkr.vercel.app/booth.html'
], { stdio: 'ignore' })

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }
async function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + PORT + p, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

;(async () => {
  try {
    let pages = null
    for (let i = 0; i < 20; i++) {
      await wait(500)
      try {
        pages = await getJson('/json')
        if (pages && pages.length) break
      } catch {}
    }
    const ws = new globalThis.WebSocket(pages[0].webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))

    let id = 1
    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const curId = id++
        const h = (e) => {
          const m = JSON.parse(e.data)
          if (m.id === curId) {
            ws.removeEventListener('message', h)
            if (m.error) rej(m.error); else res(m.result)
          }
        }
        ws.addEventListener('message', h)
        ws.send(JSON.stringify({ id: curId, method, params }))
      })
    }

    await send('Runtime.enable')
    await wait(3000)

    // Authenticate
    await send('Runtime.evaluate', {
      expression: "sessionStorage.setItem('xbuddy_booth_auth', 'true'); window.location.reload();"
    })
    await wait(5000)

    // Search XB7772
    const res = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const input = document.querySelector('input[type="text"]');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, 'XB7772');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();

          await new Promise(r => setTimeout(r, 6000));

          const text = document.body.innerText;
          const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.innerText.trim(),
            disabled: b.disabled
          }));

          return {
            hasOrder: text.includes('XB7772'),
            orderCardPresent: text.includes('DocScanner'),
            buttons
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    })

    console.log('Result for XB7772 search:', JSON.stringify(res, null, 2))

    const scr = await send('Page.captureScreenshot')
    import('fs').then(fs => {
      fs.writeFileSync('C:\\Users\\SRKREC\\.gemini\\antigravity-ide\\brain\\b246a3cc-7676-44fc-b93d-8b140db7afd3\\live_booth_xb7772_lookup.png', Buffer.from(scr.data, 'base64'))
    })

    ws.close()
  } catch (err) {
    console.error('Error:', err)
  } finally {
    browserProcess.kill()
    process.exit(0)
  }
})()
