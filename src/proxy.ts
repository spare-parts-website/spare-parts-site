import { NextRequest, NextResponse } from 'next/server'

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const WEBHOOK_PATH = '/api/webhooks/resend'

function configuredOrigin(request: NextRequest) {
  const configured = process.env.APP_URL?.trim()
  if (configured) {
    try { return new URL(configured).origin } catch { /* fall through to the request host */ }
  }
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  return `${protocol}://${request.headers.get('host') || 'localhost:3000'}`
}

function requestId(request: NextRequest) {
  const incoming = request.headers.get('x-request-id')?.trim() || ''
  return REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
}

function nonce() {
  return btoa(crypto.randomUUID())
}

function contentSecurityPolicy(value: string, request: NextRequest) {
  const development = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${value}'${development}`,
    // React uses a small number of style attributes for responsive charts and
    // progress indicators. Keep those attributes explicit while removing the
    // broad script unsafe-inline exception that allowed arbitrary execution.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
    request.nextUrl.pathname.startsWith('/api/') ? 'report-to csp-endpoint' : '',
  ].filter(Boolean).join('; ')
}

function applySecurityHeaders(response: NextResponse, value: string, id: string, request: NextRequest) {
  response.headers.set('x-request-id', id)
  response.headers.set('Content-Security-Policy', contentSecurityPolicy(value, request))
  response.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"')
  return response
}

function browserMutationAllowed(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname === WEBHOOK_PATH) return true
  // Resend is a server-to-server caller and does not send browser origin
  // headers. Browser requests with an explicit cross-site origin are rejected
  // before any route handler can read the signed session cookie.
  const origin = request.headers.get('origin')?.trim()
  if (origin) {
    try {
      if (new URL(origin).origin !== configuredOrigin(request)) return false
    } catch { return false }
  }
  return request.headers.get('sec-fetch-site') !== 'cross-site'
}

export function proxy(request: NextRequest) {
  const id = requestId(request)
  const value = nonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', value)
  requestHeaders.set('x-request-id', id)

  if (!browserMutationAllowed(request)) {
    const response = NextResponse.json({ error: 'طلب غير صالح' }, { status: 403 })
    return applySecurityHeaders(response, value, id, request)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  return applySecurityHeaders(response, value, id, request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
