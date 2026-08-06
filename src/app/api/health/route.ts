import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
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
