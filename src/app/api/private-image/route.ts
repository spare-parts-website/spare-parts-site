import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

const BUCKET = 'protected-uploads'
const SAFE_PATH = /^[A-Za-z0-9._-]+$/

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const path = new URL(req.url).searchParams.get('path') || ''
    if (!SAFE_PATH.test(path)) return new NextResponse(null, { status: 404 })
    let allowed = session.role === 'ADMIN' || path.includes(`-${session.id}-`)
    if (!allowed && session.role === 'SHOP_OWNER') {
      const store = await db.store.findUnique({ where: { ownerId: session.id }, select: { id: true } })
      if (store) allowed = Boolean(await db.dispute.findFirst({ where: { storeId: store.id, evidenceUrls: { contains: encodeURIComponent(path) } }, select: { id: true } }))
    }
    if (!allowed) return new NextResponse(null, { status: 404 })
    const base = process.env.SUPABASE_URL?.replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!base || !key) return new NextResponse(null, { status: 503 })
    const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key }, cache: 'no-store' })
    if (!response.ok) return new NextResponse(null, { status: 404 })
    return new NextResponse(response.body, { headers: { 'Content-Type': response.headers.get('content-type') || 'image/webp', 'Cache-Control': 'private, max-age=300' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
