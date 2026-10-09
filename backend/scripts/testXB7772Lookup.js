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
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'XB7772');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();

          await new Promise(r => setTimeout(r, 4000));

          return {
            body: document.body.innerText,
            inputs: Array.from(document.querySelectorAll('input')).map(i => i.value),
            buttons: Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText, disabled: b.disabled }))
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    })

    console.log('Result for XB7772 search:', JSON.stringify(res.result?.value, null, 2))

    ws.close()
  } catch (err) {
    console.error('Error:', err)
  } finally {
    browserProcess.kill()
    process.exit(0)
  }
})()
