const fs     = require('fs')
const path   = require('path')
const dns    = require('dns')
const { spawn, exec } = require('child_process')
const logger = require('../utils/logger')

const AGENT_DIR    = path.join(__dirname, '..')
const TUNNEL_LOG   = path.join(AGENT_DIR, 'tunnel.log')
const TUNNEL_ERR   = path.join(AGENT_DIR, 'tunnel_err.log')
const TUNNEL_CACHE = path.join(AGENT_DIR, 'tunnel-url.txt')
const CLOUDFLARED  = path.join(AGENT_DIR, 'cloudflared.exe')
const GAS_URL      = process.env.GAS_TUNNEL_URL || process.env.GAS_URL || process.env.GAS_ORDERS_URL || 'https://script.google.com/macros/s/AKfycbxKJmtKejQsYy7zsYmUDVwKJ821szraMUT3BeZK0xEYpnmMWmhAzUvNrTbUMR_grRS0/exec'
const API_KEY      = process.env.GAS_API_KEY || process.env.API_KEY || 'XB_API_SECRET_KEY_2026'

let currentTunnelUrl   = null
let watcherInterval    = null
let healthCheckInterval = null
let consecutiveFails   = 0
let isOnlineState      = true

// Check if PC has active internet access
function checkInternet() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => resolve(!err))
  })
}

// Extract latest trycloudflare URL from logs
function extractUrl(content) {
  if (!content) return null
  const matches = [...content.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)]
  return matches.length > 0 ? matches[matches.length - 1][0] : null
}

function loadCachedUrl() {
  try {
    if (fs.existsSync(TUNNEL_CACHE)) {
      const url = fs.readFileSync(TUNNEL_CACHE, 'utf8').trim()
      if (url.startsWith('https://')) return url
    }
  } catch {}
  return null
}

function saveUrlToCache(url) {
  try { fs.writeFileSync(TUNNEL_CACHE, url, 'utf8') } catch {}
}

// Push tunnel URL to local public/tunnel-url.txt and sync to GitHub
function pushToGitHub(url) {
  try {
    const webDir = process.env.GITHUB_REPO_DIR || path.resolve(__dirname, '..', '..')
    if (fs.existsSync(webDir)) {
      const candidates = [
        path.join(webDir, 'frontend', 'public', 'tunnel-url.txt'),
        path.join(webDir, 'public', 'tunnel-url.txt'),
      ]
      let gitRelativeFile = null
      for (const p of candidates) {
        if (fs.existsSync(path.dirname(p))) {
          fs.writeFileSync(p, url.trim() + '\n', 'utf8')
          if (!gitRelativeFile) gitRelativeFile = path.relative(webDir, p).replace(/\\/g, '/')
        }
      }

      if (gitRelativeFile) {
        exec(`git add "${gitRelativeFile}" && git commit -m "tunnel: ${url}" && git push origin main`, {
          cwd: webDir,
          timeout: 25000
        }, (err, stdout, stderr) => {
          if (!err) {
            logger.success('Tunnel URL pushed to GitHub: ' + url)
          } else {
            // Silent or brief notice if git push is not ready
          }
        })
      }
    }
  } catch (err) {
    // Ignore non-fatal git push errors
  }
}

// Push tunnel URL to Google Apps Script with retry loop
async function publishToGas(url, maxRetries = 3) {
  const axios = require('axios')
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get(`${GAS_URL}?action=setTunnelUrl&key=${API_KEY}&url=${encodeURIComponent(url)}`, { timeout: 20000 })
      if (res.data && res.data.success) {
        logger.success(`Tunnel URL published to GAS: ${url}`)
        return true
      }
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
    }
  }
  return false
}

// Verify public tunnel is alive by requesting /status over HTTPS
async function verifyPublicTunnel(url) {
  const axios = require('axios')
  try {
    const res = await axios.get(`${url}/status`, { timeout: 12000 })
    if (res.data && res.data.success) {
      logger.success(`Public tunnel verified over HTTPS: ${url}/status -> 200 OK`)
      return true
    }
  } catch (err) {}
  return false
}

let lastTunnelStartAttempt = 0
const TUNNEL_START_COOLDOWN = 60000 // Only attempt start once every 60s if not running

// Ensure cloudflared.exe process is running
function ensureCloudflaredRunning() {
  if (!fs.existsSync(CLOUDFLARED)) return
  const now = Date.now()
  if (now - lastTunnelStartAttempt < TUNNEL_START_COOLDOWN) return

  exec('tasklist /fi "imagename eq cloudflared.exe"', (err, stdout) => {
    if (!stdout || !stdout.toLowerCase().includes('cloudflared.exe')) {
      lastTunnelStartAttempt = Date.now()
      logger.info('Starting Cloudflare Tunnel process...')
      try { fs.unlinkSync(TUNNEL_LOG) } catch {}
      const targetUrl = process.env.TUNNEL_TARGET_URL || process.env.LOCAL_API_URL || 'http://localhost:3001'
      const proc = spawn(CLOUDFLARED, [
        'tunnel', '--url', targetUrl, '--logfile', TUNNEL_LOG
      ], { cwd: AGENT_DIR, stdio: 'ignore', detached: true })
      proc.unref()
    }
  })
}

// Restart cloudflared.exe if the tunnel connection is broken
function restartTunnel() {
  logger.warn('Restarting Cloudflare Tunnel...')
  exec('taskkill /f /im cloudflared.exe', () => {
    setTimeout(() => {
      ensureCloudflaredRunning()
    }, 1500)
  })
}

// Watch tunnel logs until URL appears, publish it, then keep background monitor active
async function watchForTunnelUrl(maxWaitMs = 30000) {
  ensureCloudflaredRunning()
  const start = Date.now()

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        let content = ''
        if (fs.existsSync(TUNNEL_LOG)) content += fs.readFileSync(TUNNEL_LOG, 'utf8')
        if (fs.existsSync(TUNNEL_ERR)) content += fs.readFileSync(TUNNEL_ERR, 'utf8')
        const url = extractUrl(content)
        if (url) {
          clearInterval(interval)
          currentTunnelUrl = url
          saveUrlToCache(url)
          await publishToGas(url)
          pushToGitHub(url)
          await verifyPublicTunnel(url)
          logger.success(`Cloudflare tunnel active: ${url}`)
          startBackgroundWatchers()
          resolve(url)
          return
        }
      } catch {}

      if (Date.now() - start > maxWaitMs) {
        clearInterval(interval)
        logger.warn('Tunnel URL not found in log after timeout — mobile orders may not reach agent')
        startBackgroundWatchers()
        resolve(null)
      }
    }, 1000)
  })
}

// Background monitors for URL changes and self-healing internet reconnection
function startBackgroundWatchers() {
  // 1. Log watcher: detects new URL when cloudflared reconnects
  if (watcherInterval) clearInterval(watcherInterval)
  watcherInterval = setInterval(async () => {
    try {
      let content = ''
      if (fs.existsSync(TUNNEL_LOG)) content += fs.readFileSync(TUNNEL_LOG, 'utf8')
      if (fs.existsSync(TUNNEL_ERR)) content += fs.readFileSync(TUNNEL_ERR, 'utf8')
      const url = extractUrl(content)
      if (url && url !== currentTunnelUrl) {
        currentTunnelUrl = url
        saveUrlToCache(url)
        consecutiveFails = 0
        logger.success(`Cloudflare tunnel reconnected with new URL: ${url}`)
        await publishToGas(url)
        pushToGitHub(url)
        await verifyPublicTunnel(url)
      }
    } catch {}
  }, 3500)

  // 2. Health & Internet watchdog: checks connection health every 15 seconds
  if (healthCheckInterval) clearInterval(healthCheckInterval)
  healthCheckInterval = setInterval(async () => {
    try {
      const online = await checkInternet()

      if (!online) {
        if (isOnlineState) {
          isOnlineState = false
          logger.warn('⚠️  Internet disconnected! Standing by for auto-reconnect...')
        }
        return
      }

      // If we were offline and now came back online
      if (!isOnlineState) {
        isOnlineState = true
        consecutiveFails = 0
        logger.success('🌐 Internet reconnected! Verifying tunnel health...')
        ensureCloudflaredRunning()
        if (currentTunnelUrl) {
          await publishToGas(currentTunnelUrl)
          pushToGitHub(currentTunnelUrl)
        }
        return
      }

      // Check if cloudflared is still running
      ensureCloudflaredRunning()

      // Soft verify tunnel; do NOT kill cloudflared on occasional loopback timeouts
      if (currentTunnelUrl) {
        const axios = require('axios')
        try {
          const res = await axios.get(`${currentTunnelUrl}/status`, { timeout: 10000 })
          if (res.data && res.data.success) {
            consecutiveFails = 0
          } else {
            consecutiveFails++
          }
        } catch (e) {
          consecutiveFails++
        }

        // Only restart if consistently dead for 20 pings (5 minutes)
        if (consecutiveFails >= 20) {
          logger.warn(`Cloudflare tunnel unresponsive (${consecutiveFails} missed pings over 5 minutes). Auto-healing...`)
          consecutiveFails = 0
          restartTunnel()
        }
      }
    } catch (err) {}
  }, 15000)
}

function getTunnelUrl() {
  return currentTunnelUrl || null
}

module.exports = { watchForTunnelUrl, getTunnelUrl, publishToGas, extractUrl, verifyPublicTunnel }
