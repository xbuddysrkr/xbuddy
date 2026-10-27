async function checkVercel() {
  const res = await fetch('https://xbuddysrkr.vercel.app?t=' + Date.now())
  const html = await res.text()
  console.log('HTML status:', res.status)
  const match = html.match(/\/assets\/main-([a-zA-Z0-9_-]+)\.js/)
  console.log('Main bundle match:', match ? match[0] : 'None')
  if (match) {
    const jsRes = await fetch('https://xbuddysrkr.vercel.app' + match[0])
    const jsText = await jsRes.text()
    console.log('Bundle length:', jsText.length)
    console.log('Contains "Preparing Document":', jsText.includes('Preparing Document'))
    console.log('Contains "Transferring PDF to kiosk":', jsText.includes('Transferring PDF to kiosk'))
  }
}
checkVercel()
