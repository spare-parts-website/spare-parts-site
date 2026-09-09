import { NextRequest, NextResponse } from 'next/server'
import { coarseApiLimit } from '@/lib/coarse-rate-limit'

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const WEBHOOK_PATH = '/api/webhooks/resend'
const SUPABASE_ORIGIN = 'https://sufrsfrrrzhhdluolxdf.supabase.co'

function configuredOrigin(request: NextRequest) {
  const configured = process.env.APP_URL?.trim()
  if (configured) { try { return new URL(configured).origin } catch { /* fall through */ } }
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  return `${protocol}://${request.headers.get('host') || 'localhost:3000'}`
}
function requestId(request: NextRequest) { const incoming = request.headers.get('x-request-id')?.trim() || ''; return REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID() }
function requestAddress(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown' }
function nonce() { return btoa(crypto.randomUUID()) }

function contentSecurityPolicy(value: string, request: NextRequest, reportOnly = false) {
  const development = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${value}'${development}`,
    reportOnly ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE_ORIGIN}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
    'report-to csp-endpoint',
  ].filter(Boolean).join('; ')
}

function applyRequestId(response: NextResponse, id: string) { response.headers.set('x-request-id', id); return response }
function applyNonceSecurityHeaders(response: NextResponse, value: string, id: string, request: NextRequest) {
  applyRequestId(response, id)
  response.headers.set('Content-Security-Policy', contentSecurityPolicy(value, request))
  if (process.env.CSP_REPORT_ONLY === '1' && process.env.NODE_ENV !== 'production') response.headers.set('Content-Security-Policy-Report-Only', contentSecurityPolicy(value, request, true))
  response.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"')
  return response
}

function browserMutationAllowed(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname === WEBHOOK_PATH) return true
  const origin = request.headers.get('origin')?.trim()
  if (origin) { try { if (new URL(origin).origin !== configuredOrigin(request)) return false } catch { return false } }
  return request.headers.get('sec-fetch-site') !== 'cross-site'
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const id = requestId(request)
  if (pathname.startsWith('/api/')) {
    if (pathname !== WEBHOOK_PATH) {
      const coarse = coarseApiLimit(pathname, request.method, requestAddress(request))
      if (!coarse.allowed) return applyRequestId(NextResponse.json({ error: 'طلبات كثيرة. حاول مرة أخرى بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(coarse.retryAfter), 'Cache-Control': 'no-store, max-age=0' } }), id)
    }
    if (!browserMutationAllowed(request)) return applyRequestId(NextResponse.json({ error: 'طلب غير صالح' }, { status: 403 }), id)
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-request-id', id)
    return applyRequestId(NextResponse.next({ request: { headers: requestHeaders } }), id)
  }
  const value = nonce()
  const policy = contentSecurityPolicy(value, request)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', value)
  requestHeaders.set('x-request-id', id)
  requestHeaders.set('Content-Security-Policy', policy)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  return applyNonceSecurityHeaders(response, value, id, request)
}

export const config = {
  matcher: [{
    source: '/((?!api/home-marketplace$|_next/static|_next/image|.*\\.[^/]+$).*)',
    missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
  }],
}
