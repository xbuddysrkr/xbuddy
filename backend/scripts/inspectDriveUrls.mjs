import { connectToDatabase, closeDatabaseConnection } from '../api/_lib/mongodb.js'
import dns from 'dns'
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (_) {}

async function inspectDriveUrls() {
  console.log('================================================================')
  console.log('         INVESTIGATION OF DRIVEURL REFERENCES IN XBUDDY         ')
  console.log('================================================================\n')

  const { db } = await connectToDatabase()
  const orders = await db.collection('orders').find({ driveUrl: { $exists: true, $ne: '' } }).toArray()

  console.log(`Found ${orders.length} orders with driveUrl references:\n`)

  const domainCounts = {}
  const records = []

  for (const o of orders) {
    const rawUrl = String(o.driveUrl || '').trim()
    let hostname = 'invalid-url'
    try {
      hostname = new URL(rawUrl).hostname
    } catch {}

    domainCounts[hostname] = (domainCounts[hostname] || 0) + 1

    const isGoogleDrive = hostname.includes('drive.google.com') || hostname.includes('docs.google.com')
    const isMock = rawUrl.includes('example.com') || rawUrl.includes('test') || rawUrl.includes('mock') || rawUrl.includes('sample')
    const hasGridFsPdf = Boolean(o.hasGridFsPdf)
    const hasInlineBase64 = Boolean(o.pdfBase64 && o.pdfBase64.length > 50)

    records.push({
      orderId: o.orderId,
      hostname,
      isGoogleDrive,
      isMock,
      hasGridFsPdf,
      hasInlineBase64,
      createdAt: o.createdAt,
      // Redacted URL signature
      urlSignature: rawUrl.slice(0, 30) + '...' + (rawUrl.length > 30 ? ` [len=${rawUrl.length}]` : '')
    })
  }

  console.log('Hostname distribution:')
  for (const [host, count] of Object.entries(domainCounts)) {
    console.log(`  - ${host.padEnd(25)}: ${count} record(s)`)
  }

  console.log('\nDetailed Breakdown:')
  for (const r of records) {
    console.log(`  • Order ${r.orderId.padEnd(8)} | Host: ${r.hostname.padEnd(20)} | Drive: ${r.isGoogleDrive ? 'Yes' : 'No '} | Mock: ${r.isMock ? 'Yes' : 'No '} | GridFS: ${r.hasGridFsPdf ? 'Yes' : 'No '} | Date: ${r.createdAt}`)
  }

  const realGoogleDriveCount = records.filter(r => r.isGoogleDrive).length
  const mockCount = records.filter(r => r.isMock).length
  const otherCount = records.length - realGoogleDriveCount - mockCount

  console.log('\nOwnership & Management Assessment:')
  console.log(`  1. Real Google Drive URLs: ${realGoogleDriveCount}`)
  console.log('     -> In XBuddy architecture, Google Drive links are provided directly by students submitting links or generated via Apps Script.')
  console.log('     -> XBuddy backend DOES NOT possess Google Drive OAuth/Service Account credentials to mutate or delete files from external student Google Drives.')
  console.log(`  2. Synthetic / Mock URLs:  ${mockCount}`)
  console.log('     -> Created during synthetic testing and integration tests.')
  console.log(`  3. Other hostnames:        ${otherCount}`)

  await closeDatabaseConnection()
  return {
    total: orders.length,
    domainCounts,
    realGoogleDriveCount,
    mockCount,
    otherCount,
  }
}

inspectDriveUrls().catch(err => {
  console.error(err)
  process.exit(1)
})
