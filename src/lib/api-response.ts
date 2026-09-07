import { NextResponse } from 'next/server'

export function apiError(code: string, message: string, status = 400, requestId?: string | null, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message, ...(requestId ? { requestId } : {}) } }, { status, headers })
}

export function privateNoStoreHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  return headers
}
