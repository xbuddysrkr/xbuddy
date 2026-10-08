import crypto from 'crypto'
import { connectToDatabase } from '../_lib/mongodb.js'

const AUTHORIZED_KEY_HASHES = new Set([
  'ea4af0179d15ec55173b299b18bbffb8b770589fe9df62b6239aee52eee4f04d',
])

function validateAgentAuth(req) {
  const headerKey = req.headers?.['x-agent-key'] || req.headers?.['x-agent-secret']
  const queryKey = req.query?.agentKey || req.query?.key
  const provided = (headerKey || queryKey || '').trim()
  if (!provided) return false

  const expectedKey = (process.env.AGENT_SECRET_KEY || process.env.AGENT_SECRET || '').trim()
  if (expectedKey && provided === expectedKey) return true

  const hashed = crypto.createHash('sha256').update(provided).digest('hex')
  return AUTHORIZED_KEY_HASHES.has(hashed)
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
        clientTimestamp: body.timestamp || nowIso,
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

