async function verifyDeploy() {
  console.log('--- Probing Render API ---')
  try {
    const res = await fetch('https://xbuddy.onrender.com/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'initiateReprint', orderId: 'XB_PROBE_DUMMY' }),
    })
    const data = await res.json()
    console.log('Render initiateReprint probe status:', res.status, data)
    if (res.status === 404 && data?.error?.includes('not found in authoritative database')) {
      console.log('✓ Render is RUNNING the new reprint commit (b261e2a)!')
    } else {
      console.log('Render is still building or deploying...')
    }
  } catch (err) {
    console.error('Render probe error:', err.message)
  }

  console.log('\n--- Probing Vercel Frontend ---')
  try {
    const res = await fetch('https://xbuddysrkr.vercel.app?t=' + Date.now())
    const html = await res.text()
    const match = html.match(/\/assets\/main-([a-zA-Z0-9_-]+)\.js/)
    console.log('Vercel main bundle:', match ? match[0] : 'None')
    if (match && match[0].includes('main-D4x-mfcX.js')) {
      console.log('✓ Vercel is SERVING the new frontend bundle (main-D4x-mfcX.js)!')
    } else {
      console.log('Vercel is still deploying...')
    }
  } catch (err) {
    console.error('Vercel probe error:', err.message)
  }
}

verifyDeploy()
