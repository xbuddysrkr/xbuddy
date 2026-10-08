import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'xbuddy'
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || 'd834c5055c2a2401ee3f59cd121f59258403156e86034eab956dc099351dd9e4'

let cachedClient = null
let cachedDb = null

async function connectToDatabase() {
  if (cachedDb) return { client: cachedClient, db: cachedDb }
  if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is not defined')
  const client = await MongoClient.connect(MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  })
  const db = client.db(MONGODB_DB_NAME)
  cachedClient = client
  cachedDb = db
  return { client, db }
}

function validateAgentAuth(req) {
  const headerKey = req.headers?.['x-agent-key'] || req.headers?.['x-agent-secret']
  const queryKey = req.query?.agentKey || req.query?.key
  const provided = (headerKey || queryKey || '').trim()
  return Boolean(provided && provided === AGENT_SECRET_KEY)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-agent-key, Authorization, x-api-key')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!validateAgentAuth(req)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing x-agent-key header',
    })
  }

  try {
    const { db } = await connectToDatabase()
    const stationsCol = db.collection('stations')
    const nowIso = new Date().toISOString()

    if (req.method === 'POST') {
      const body = req.body || {}
      const cleanStationId = String(body.stationId || 'SRKR-XEROX-01').trim().toUpperCase()

      const updateDoc = {
        stationId: cleanStationId,
        printerName: String(body.printerName || 'Unknown'),
        printerAvailable: Boolean(body.printerAvailable),
        agentVersion: String(body.agentVersion || '2.1.0'),
        status: body.printerAvailable ? 'online' : 'printer_unavailable',
        lastHeartbeat: nowIso,
        lastHeartbeatEpoch: Date.now(),
        uptimeSeconds: Number(body.uptimeSeconds) || 0,
        systemInfo: body.systemInfo || {},
        updatedAt: nowIso,
      }

      await stationsCol.updateOne(
        { stationId: cleanStationId },
        {
          $set: updateDoc,
          $setOnInsert: { createdAt: nowIso },
        },
        { upsert: true }
      )

      return res.status(200).json({
        success: true,
        stationId: cleanStationId,
        status: updateDoc.status,
        serverTime: nowIso,
      })
    }

    if (req.method === 'GET') {
      const stationId = String(req.query?.stationId || '').trim().toUpperCase()
      if (stationId) {
        const station = await stationsCol.findOne({ stationId })
        if (!station) {
          return res.status(404).json({ success: false, error: 'Station not found' })
        }
        return res.status(200).json({ success: true, station })
      }

      const allStations = await stationsCol.find({}).sort({ updatedAt: -1 }).limit(50).toArray()
      return res.status(200).json({ success: true, count: allStations.length, stations: allStations })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (err) {
    console.error('[AGENT_HEARTBEAT_ERROR]', err)
    return res.status(500).json({ success: false, error: err.message || 'Internal error' })
  }
}
