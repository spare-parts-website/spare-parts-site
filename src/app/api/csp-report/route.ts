import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Accept browser CSP reports without retaining arbitrary page content. */
export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 64 * 1024) return new NextResponse(null, { status: 413 })
  try {
    const body = await request.json() as Record<string, unknown>
    const report = body['csp-report'] && typeof body['csp-report'] === 'object' ? body['csp-report'] as Record<string, unknown> : body
    const blockedURI = typeof report['blocked-uri'] === 'string' ? report['blocked-uri'].slice(0, 240) : ''
    const violatedDirective = typeof report['violated-directive'] === 'string' ? report['violated-directive'].slice(0, 160) : ''
    const documentURI = typeof report['document-uri'] === 'string' ? report['document-uri'].slice(0, 240) : ''
    if (blockedURI || violatedDirective) console.warn(JSON.stringify({ event: 'csp.violation', requestId: request.headers.get('x-request-id') || undefined, blockedURI, violatedDirective, documentURI }))
  } catch {
    // Reporting is best effort and must never turn a browser report into noise.
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
