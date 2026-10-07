// Simple logger with timestamps and color-coded levels
const colors = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
}

function timestamp() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false })
}

const logger = {
  info:    (msg) => console.log(`${colors.cyan}[${timestamp()}] INFO${colors.reset}  ${msg}`),
  success: (msg) => console.log(`${colors.green}[${timestamp()}] OK${colors.reset}    ${msg}`),
  warn:    (msg) => console.log(`${colors.yellow}[${timestamp()}] WARN${colors.reset}  ${msg}`),
  error:   (msg) => console.log(`${colors.red}[${timestamp()}] ERROR${colors.reset} ${msg}`),
  dim:     (msg) => console.log(`${colors.gray}[${timestamp()}] ...${colors.reset}   ${msg}`),
}

module.exports = logger
