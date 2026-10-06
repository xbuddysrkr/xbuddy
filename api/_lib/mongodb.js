import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || 'xbuddy'

let cachedClient = null
let cachedDb = null
let indexesCreated = false

/**
 * Connects to MongoDB Atlas with connection caching across serverless invocations.
 * Strictly uses process.env.MONGODB_URI (never exposed to frontend/browser).
 */
export async function connectToDatabase() {
  if (!uri) {
    const error = new Error('MONGODB_URI environment variable is not defined')
    error.code = 'ERR_NO_URI'
    throw error
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb }
  }

  try {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    })

    await client.connect()
    const db = client.db(dbName)

    cachedClient = client
    cachedDb = db

    // Ensure required indexes once on connection
    if (!indexesCreated) {
      try {
        const orders = db.collection('orders')
        await Promise.all([
          orders.createIndex({ orderId: 1 }, { unique: true }),
          orders.createIndex({ createdAt: -1 }),
          orders.createIndex({ printStatus: 1, createdAt: -1 }),
          orders.createIndex({ paymentStatus: 1 }),
        ])
        indexesCreated = true
        console.log('[MongoDB] Connected to database "' + dbName + '" and verified indexes on collection "orders"')
      } catch (idxErr) {
        console.warn('[MongoDB] Index initialization notice:', idxErr.message)
      }
    }

    return { client: cachedClient, db: cachedDb }
  } catch (connErr) {
    console.error('[MongoDB Connection Error]:', connErr.message)
    throw connErr
  }
}

/**
 * Resets cached connection (useful for unit tests or retry logic).
 */
export async function closeDatabaseConnection() {
  if (cachedClient) {
    try {
      await cachedClient.close()
    } catch {}
    cachedClient = null
    cachedDb = null
    indexesCreated = false
  }
}
