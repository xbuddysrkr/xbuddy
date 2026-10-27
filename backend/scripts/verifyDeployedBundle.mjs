async function checkVercelBundle() {
  const htmlRes = await fetch('https://xbuddysrkr.vercel.app/')
  const html = await htmlRes.text()
  const scriptRegex = /src="([^"]+main-[^"]+\.js)"/g
  const matches = []
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    matches.push(match[1])
  }
  console.log('Script matches in deployed HTML:', matches)
  if (matches.length > 0) {
    const jsUrl = new URL(matches[0], 'https://xbuddysrkr.vercel.app').href
    console.log('Fetching JS bundle:', jsUrl)
    const jsRes = await fetch(jsUrl)
    const js = await jsRes.text()
    console.log('Contains expired badge:', js.includes('Reprint window expired; document permanently deleted.'))
    console.log('Contains derived deadline calculation:', js.includes('18e5') || js.includes('30 * 60 * 1000') || js.includes('30*60*1e3') || js.includes('1800000'))
    console.log('Contains updateOrder:', js.includes('updateOrder'))
    console.log('Contains getStatusInfo / Printed label:', js.includes('"Printed"') || js.includes("'Printed'"))
  }
}
checkVercelBundle()
