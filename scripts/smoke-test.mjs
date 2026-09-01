const baseUrl = (process.env.SMOKE_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const healthSecret = process.env.HEALTHCHECK_SECRET
const skipData = process.env.SMOKE_SKIP_DATA === '1'
const expectBmw = process.env.SMOKE_EXPECT_BMW === '1'
const checks = [
  { path: '/', status: 200, html: true },
  { path: '/parts', status: 200, html: true },
  { path: '/stores', status: 200, html: true },
  { path: '/login', status: 200, html: true },
  { path: '/register', status: 200, html: true },
  { path: '/privacy', status: 200, html: true },
  { path: '/terms', status: 200, html: true },
  { path: '/returns', status: 200, html: true },
  { path: '/contact', status: 200, html: true },
  { path: '/favicon.ico', status: 200 },
  { path: '/does-not-exist', statuses: [200, 404], html: true, includes: 'الصفحة غير موجودة' },
  { path: '/api/health', status: 404 },
  { path: '/api/orders', status: 401, json: true },
  { path: '/api/notifications', status: 401, json: true },
  { path: '/api/admin/users', status: 403, json: true },
  { path: '/api/notify', method: 'POST', status: 403, json: true },
  { path: '/api/upload', method: 'POST', status: 403, json: true },
]

if (!skipData) {
  checks.push({ path: '/api/parts', status: 200, json: true }, { path: '/api/stores', status: 200, json: true })
}

if (expectBmw) {
  checks.push(
    { path: '/parts?search=bww', status: 200, html: true, includes: 'BMW' },
    { path: '/api/search?q=bww', status: 200, json: true, includes: 'BMW' },
  )
}

if (healthSecret) {
  checks.push({ path: '/api/health', status: 200, json: true, headers: { authorization: `Bearer ${healthSecret}` } })
}

let failed = false
for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method || 'GET',
      headers: check.headers,
      redirect: 'manual',
    })
    const contentType = response.headers.get('content-type') || ''
    const validType = check.json
      ? contentType.includes('application/json')
      : check.html
        ? contentType.includes('text/html')
        : true
    const validStatus = check.statuses ? check.statuses.includes(response.status) : response.status === check.status
    const validBody = check.includes ? (await response.clone().text()).includes(check.includes) : true
    if (!validStatus || !validType || !validBody) {
      failed = true
      console.error(`FAIL ${check.method || 'GET'} ${check.path}: expected ${check.status ?? check.statuses.join('/')}, received ${response.status} ${contentType}`)
    } else {
      console.log(`PASS ${check.method || 'GET'} ${check.path}: ${response.status}`)
    }
  } catch (error) {
    failed = true
    console.error(`FAIL ${check.path}: ${error instanceof Error ? error.message : error}`)
  }
}

try {
  const response = await fetch(`${baseUrl}/`)
  const csp = response.headers.get('content-security-policy') || ''
  if (!csp.includes("default-src 'self'") || !csp.includes("frame-ancestors 'none'")) {
    failed = true
    console.error('FAIL security headers: Content-Security-Policy is missing or incomplete')
  } else {
    console.log('PASS security headers: CSP present')
  }
} catch (error) {
  failed = true
  console.error(`FAIL security headers: ${error instanceof Error ? error.message : error}`)
}

if (failed) process.exit(1)
console.log(`Smoke tests passed for ${baseUrl}`)
