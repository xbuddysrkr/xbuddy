import dotenv from 'dotenv'
dotenv.config({ path: 'backend/.env' })
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import { MongoClient } from 'mongodb'

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  const col = client.db('xbuddy').collection('orders')
  const total = await col.countDocuments()
  const pending = await col.countDocuments({ paymentStatus: 'pending' })
  const paid = await col.countDocuments({ paymentStatus: { $in: ['paid', 'completed'] } })
  const printed = await col.countDocuments({ printStatus: 'Printed' })
  const printedAndPending = await col.countDocuments({ printStatus: 'Printed', paymentStatus: 'pending' })
  const printedAndPaid = await col.countDocuments({ printStatus: 'Printed', paymentStatus: { $in: ['paid', 'completed'] } })
  
  // Sample printed orders
  const samplePrinted = await col.find({ printStatus: 'Printed' }, { projection: { pdfBase64: 0 } }).sort({ createdAt: -1 }).limit(5).toArray()

  console.log('Payment & Print Statistics in MongoDB Atlas:')
  console.log({
    total,
    pendingPayment: pending,
    paidOrCompletedPayment: paid,
    totalPrinted: printed,
    printedWithPendingPayment: printedAndPending,
    printedWithPaidPayment: printedAndPaid
  })
  console.log('\nRecent 5 Printed Orders:')
  samplePrinted.forEach(o => {
    console.log(`- ${o.orderId}: printStatus="${o.printStatus}", paymentStatus="${o.paymentStatus}", amount=₹${o.amount}, UTR="${o.transactionId}", createdAt=${o.createdAt}`)
  })

  await client.close()
}

check().catch(console.error)
