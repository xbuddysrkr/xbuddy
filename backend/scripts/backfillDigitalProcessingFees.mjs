import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import dotenv from 'dotenv'
dotenv.config()
import { MongoClient } from 'mongodb'
import { calculateOrderPrice } from '../api/_lib/retention.js'

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('No MONGODB_URI found')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db('xbuddy')
  const orders = await db.collection('orders').find({}).toArray()
  let updatedCount = 0

  for (const o of orders) {
    const currentFee = Number(o.digitalProcessingFee ?? o.serviceFee ?? 0)
    if (!currentFee || currentFee <= 0) {
      const calc = calculateOrderPrice(o)
      let fee = calc.digitalProcessingFee
      if (o.amount && o.printingCost && Number(o.amount) > Number(o.printingCost)) {
        fee = Number(o.amount) - Number(o.printingCost)
      }
      const printCost = Number(o.printingCost) || Math.max(0, Number(o.amount || 0) - fee)

      await db.collection('orders').updateOne(
        { _id: o._id },
        {
          $set: {
            digitalProcessingFee: fee,
            serviceFee: fee,
            printingCost: printCost,
          },
        }
      )
      updatedCount++
    }
  }

  console.log(`Successfully backfilled ${updatedCount} orders with digitalProcessingFee and printingCost`)
  await client.close()
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
