import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9229

const browser = spawn(EDGE_PATH, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--disable-gpu',
  '--no-first-run',
  '--user-data-dir=' + process.env.TEMP + '\\edge_diag_' + Date.now(),
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

    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', m.params.type, m.params.args.map(a => a.value || a.description).join(' '))
      }
      if (m.method === 'Network.responseReceived') {
        console.log('[BROWSER NETWORK RESPONSE]', m.params.response.url, m.params.response.status)
      }
    })

    await send('Runtime.enable')
    await send('Network.enable')
    await wait(2000)

    await send('Runtime.evaluate', { expression: "sessionStorage.setItem('xbuddy_booth_auth', 'true'); location.reload();" })
    await wait(5000)

    console.log('--- TYPING XB8526 AND CLICKING FIND ORDER ---')
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const input = document.querySelector('input[type="text"]');
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'XB8526');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();
        })()
      `
    })

    await wait(6000)

    const state = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            text: document.body.innerText,
            selectedCard: document.querySelector('.lg\\\\:col-span-7')?.innerText || 'NO_CARD'
          };
        })()
      `,
      returnByValue: true
    })

    console.log('State after search:', JSON.stringify(state.result?.value, null, 2))

    ws.close()
  } catch(e) {
    console.error(e)
  } finally {
    browser.kill()
    process.exit(0)
  }
})()
