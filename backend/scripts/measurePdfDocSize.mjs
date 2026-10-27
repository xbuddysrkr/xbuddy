import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
import dotenv from 'dotenv'
import path from 'path'
import { MongoClient } from 'mongodb'

dotenv.config({ path: path.resolve('backend/.env') })

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  const db = client.db('xbuddy')
  const docs = await db.collection('orders').aggregate([
    { $match: { orderId: { $in: ['XB9532', 'XB4611', 'XB1110', 'XB9996'] } } },
    {
      $project: {
        orderId: 1,
        fileName: 1,
        printStatus: 1,
        paymentStatus: 1,
        b64Len: { $strLenCP: { $ifNull: ['$pdfBase64', ''] } },
        b64Bytes: { $strLenBytes: { $ifNull: ['$pdfBase64', ''] } },
        hasDriveUrl: { $gt: [{ $strLenCP: { $ifNull: ['$driveUrl', ''] } }, 0] },
      }
    }
  ]).toArray()

  console.log('Result:', JSON.stringify(docs, null, 2))
  await client.close()
}

check().catch(console.error)
