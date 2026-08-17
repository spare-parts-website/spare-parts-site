import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

function secretsMatch(actual: string | null, expected: string) {
  if (!actual) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.HEALTHCHECK_SECRET
  const authorization = req.headers.get('authorization')
  if (!expectedSecret || !secretsMatch(authorization, `Bearer ${expectedSecret}`)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json(
      { ok: true, database: 'ok' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('Health check failed', error)
    return NextResponse.json(
      { ok: false, database: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }
}
