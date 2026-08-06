const baseUrl = (process.env.SMOKE_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const checks = ['/', '/api/health', '/api/parts', '/api/stores']
let failed = false

for (const path of checks) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || (path.startsWith('/api/') && !contentType.includes('application/json'))) {
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
