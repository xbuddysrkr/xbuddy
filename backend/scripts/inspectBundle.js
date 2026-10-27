import fs from 'fs'

const content = fs.readFileSync('frontend/dist/assets/api-Cz-rUBJa.js', 'utf8')
const matches = content.match(/https:\/\/[^"'`\s]+\/api\/orders/g)
console.log('Matches for /api/orders in dist:', [...new Set(matches)])

const candFn = content.match(/getCandidateOrdersEndpoints[^{]+{([^}]+)}/)
console.log('Candidate fn match:', candFn ? candFn[0] : 'not found')
