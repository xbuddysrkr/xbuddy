import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9225

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
    if (!pages || !pages.length) throw new Error('Could not connect to Edge DevTools Protocol')

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
    await new Promise(r => setTimeout(r, 4000))

    const res = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const logs = [];
          try {
            const url1 = 'https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB7772';
            const t0 = performance.now();
            const r1 = await fetch(url1);
            const time1 = Math.round(performance.now() - t0);
            const text1 = await r1.text();
            logs.push({ url: url1, status: r1.status, timeMs: time1, text: text1 });
          } catch (e1) {
            logs.push({ url: 'render', error: e1.message });
          }

          try {
            const url2 = '/api/orders?action=getOrderStatus&orderId=XB7772';
            const r2 = await fetch(url2);
            const text2 = await r2.text();
            logs.push({ url: url2, status: r2.status, text: text2.slice(0, 100) });
          } catch (e2) {
            logs.push({ url: 'relative', error: e2.message });
          }

          return logs;
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    })

    console.log('In-Browser fetch result:')
    console.log(JSON.stringify(res.result?.value, null, 2))

    ws.close()
  } catch (err) {
    console.error('Error:', err)
  } finally {
    browserProcess.kill()
    process.exit(0)
  }
})()
