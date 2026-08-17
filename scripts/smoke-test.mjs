const baseUrl = (process.env.SMOKE_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const healthcheckSecret = process.env.HEALTHCHECK_SECRET
const checks = [
  { path: '/', expectedStatus: 200 },
  {
    path: '/api/health',
    expectedStatus: healthcheckSecret ? 200 : 404,
    headers: healthcheckSecret ? { authorization: `Bearer ${healthcheckSecret}` } : undefined,
  },
  { path: '/api/parts', expectedStatus: 200 },
  { path: '/api/stores', expectedStatus: 200 },
]
let failed = false

for (const { path, expectedStatus, headers } of checks) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers })
    const contentType = response.headers.get('content-type') || ''
    const expectsJson = path.startsWith('/api/') && expectedStatus !== 404
    if (response.status !== expectedStatus || (expectsJson && !contentType.includes('application/json'))) {
      failed = true
      console.error(`FAIL ${path}: ${response.status} ${contentType}`)
    } else {
      console.log(`PASS ${path}: ${response.status}`)
    }
  } catch (error) {
    failed = true
    console.error(`FAIL ${path}: ${error instanceof Error ? error.message : error}`)
  }
}

if (failed) process.exit(1)
console.log(`Smoke tests passed for ${baseUrl}`)
