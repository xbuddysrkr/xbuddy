import { spawn } from 'child_process'
import http from 'http'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9223
const TARGET_URL = 'https://xbuddysrkr.vercel.app/booth.html'

console.log('--- DIAGNOSING XB8212 IN REAL EDGE BROWSER ---')

const browserProcess = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-web-security',
  '--user-data-dir=' + process.env.TEMP + '\\edge_diag_' + Date.now(),
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
  let pages = null
  for (let i = 0; i < 20; i++) {
    await wait(500)
    try {
      pages = await getJson('/json')
      if (pages && pages.length) break
    } catch {}
  }

  const targetPage = pages.find(p => p.type === 'page') || pages[0]
  const ws = new globalThis.WebSocket(targetPage.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))

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

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value || a.description).join(' ')
        console.log(`[Browser Console]:`, args)
      } else if (msg.method === 'Network.requestWillBeSent') {
        if (msg.params.request.url.includes('orders') || msg.params.request.url.includes('3001')) {
          console.log(`[Network Request]:`, msg.params.request.method, msg.params.request.url)
        }
      } else if (msg.method === 'Network.responseReceived') {
        if (msg.params.response.url.includes('orders') || msg.params.response.url.includes('3001')) {
          console.log(`[Network Response]:`, msg.params.response.status, msg.params.response.url)
        }
      }
    } catch {}
  })

  await send('Page.navigate', { url: TARGET_URL })
  await wait(3000)

  // Auth session
  await send('Runtime.evaluate', {
    expression: `
      sessionStorage.setItem('xbuddy_booth_auth', 'true');
      window.location.reload();
    `
  })
  await wait(4000)

  // 1. Check what the page itself fetches
  console.log('--- EVALUATING BROWSER CONTEXT CALLS ---')
  const testCalls = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const res = {};
        // test fetchPendingOrders endpoint
        try {
          const r1 = await fetch('https://xbuddy.onrender.com/api/orders?action=listOrders');
          res.renderListOrders = { status: r1.status, ok: r1.ok, data: await r1.json() };
        } catch (e) { res.renderListOrders = { error: e.message }; }

        try {
          const r2 = await fetch('https://xbuddy.onrender.com/api/orders?action=getOrderStatus&orderId=XB8212');
          res.renderGetStatus = { status: r2.status, ok: r2.ok, data: await r2.json() };
        } catch (e) { res.renderGetStatus = { error: e.message }; }

        try {
          const r3 = await fetch('/api/orders?action=getOrderStatus&orderId=XB8212');
          res.relativeGetStatus = { status: r3.status, ok: r3.ok, type: r3.headers.get('content-type') };
        } catch (e) { res.relativeGetStatus = { error: e.message }; }

        // test local print agent release-print
        try {
          const r4 = await fetch('http://127.0.0.1:3001/status');
          res.agentStatus = { status: r4.status, data: await r4.json() };
        } catch (e) { res.agentStatus = { error: e.message }; }

        return res;
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  })

  console.log('Test Calls Result:');
  console.log(JSON.stringify(testCalls.result?.value, null, 2));

  // 2. Now let's test typing XB8212 into the input and clicking Find Order in the UI!
  console.log('\n--- TESTING UI INTERACTION: TYPING XB8212 AND FIND ORDER ---');
  await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const input = document.querySelector('input[placeholder="XB0000"]');
        if (input) {
          // React synthetic event trigger
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, 'XB8212');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `
  });
  await wait(1000);

  // Click Find Order button
  await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const buttons = [...document.querySelectorAll('button')];
        const findBtn = buttons.find(b => b.innerText.includes('Find Order'));
        if (findBtn) findBtn.click();
      })()
    `
  });
  await wait(3000);

  // Check what is rendered on screen now
  const pageState = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          bodyText: document.body.innerText,
          toastError: document.querySelector('.bg-rose-50')?.innerText || null,
          toastSuccess: document.querySelector('.bg-emerald-50')?.innerText || null,
          hasSelectedOrder: !!document.querySelector('.text-xl.font-black.font-mono'),
          selectedOrderId: document.querySelector('.text-xl.font-black.font-mono')?.innerText || null,
        }
      })()
    `,
    returnByValue: true
  });

  console.log('\nPage state after Find Order:');
  console.log(JSON.stringify(pageState.result?.value, null, 2));

  ws.close();
} catch (err) {
  console.error('Diagnostic error:', err);
} finally {
  try { browserProcess.kill() } catch {}
  process.exit(0);
}
