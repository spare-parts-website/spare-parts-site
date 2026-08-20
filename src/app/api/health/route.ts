import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { secretsMatch } from '@/lib/security'

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.HEALTHCHECK_SECRET
  if (!expectedSecret || !secretsMatch(req.headers.get('authorization'), `Bearer ${expectedSecret}`)) {
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
