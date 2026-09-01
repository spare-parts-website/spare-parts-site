import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { headers: PRIVATE_HEADERS })
  }
  return NextResponse.json({ user: session }, { headers: PRIVATE_HEADERS })
}
