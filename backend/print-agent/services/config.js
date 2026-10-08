const fs = require('fs')
const path = require('path')

const DEFAULT_CONFIG = {
  stationId: 'SRKR-XEROX-01',
  selectedPrinter: '',
  cloudApiUrl: process.env.CLOUD_API_URL || 'https://xbuddysrkr.vercel.app',
  agentSecretKey: process.env.AGENT_SECRET_KEY || 'd834c5055c2a2401ee3f59cd121f59258403156e86034eab956dc099351dd9e4',
  port: parseInt(process.env.PRINT_AGENT_PORT || '3001', 10),
  version: '2.1.0',
  autoHeartbeat: true,
  heartbeatIntervalMs: 30000,
}

function resolveConfigDir() {
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  const appDataDir = path.join(programData, 'XBuddyPrintStation')
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true })
    }
    return appDataDir
  } catch {
    const localDir = path.join(__dirname, '..', 'data')
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true })
    }
    return localDir
  }
}

function resolveLogDir() {
  const configDir = resolveConfigDir()
  const logDir = path.join(configDir, 'logs')
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true })
    } catch {}
  }
  return logDir
}

function getConfigPath() {
  return path.join(resolveConfigDir(), 'config.json')
}

let cachedConfig = null

function loadConfig() {
  const configPath = getConfigPath()
  let config = { ...DEFAULT_CONFIG }

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      config = { ...config, ...data }
    } catch (err) {
      console.warn('[CONFIG] Failed to parse config.json, using defaults:', err.message)
    }
  } else {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    } catch {}
  }

  // Environment overrides if present
  if (process.env.STATION_ID) config.stationId = process.env.STATION_ID.trim().toUpperCase()
  if (process.env.SELECTED_PRINTER) config.selectedPrinter = process.env.SELECTED_PRINTER.trim()
  if (process.env.CLOUD_API_URL) config.cloudApiUrl = process.env.CLOUD_API_URL.trim()

  cachedConfig = config
  return config
}

function getConfig() {
  if (!cachedConfig) return loadConfig()
  return cachedConfig
}

function saveConfig(updates = {}) {
  const current = getConfig()
  const updated = {
    ...current,
    ...updates,
    stationId: updates.stationId ? String(updates.stationId).trim().toUpperCase() : current.stationId,
    selectedPrinter: updates.selectedPrinter !== undefined ? String(updates.selectedPrinter).trim() : current.selectedPrinter,
  }

  const configPath = getConfigPath()
  try {
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8')
    cachedConfig = updated
    return { success: true, config: updated }
  } catch (err) {
    console.error('[CONFIG_SAVE_ERROR]', err.message)
    return { success: false, error: err.message }
  }
}

module.exports = {
  DEFAULT_CONFIG,
  resolveConfigDir,
  resolveLogDir,
  getConfigPath,
  loadConfig,
  getConfig,
  saveConfig,
}
