import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const url = new URL(req.url)
    const type = url.searchParams.get('type') === 'store' ? 'store' : 'product'
    const limit = parseLimit(url.searchParams.get('limit'), 25, 50)
    const cursor = decodeCursor(url.searchParams.get('cursor'))
    const before = keysetBefore(cursor)

    if (type === 'store') {
      const rows = await db.storeReview.findMany({
        where: before || undefined,
        select: { id: true, rating: true, comment: true, blocked: true, createdAt: true, user: { select: { id: true, name: true } }, store: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      })
      const reviews = rows.slice(0, limit)
      return NextResponse.json({ type, reviews, nextCursor: rows.length > limit && reviews.length ? encodeCursor(reviews[reviews.length - 1]) : null }, { headers: PRIVATE_HEADERS })
    }

    const rows = await db.productReview.findMany({
      where: before || undefined,
      select: { id: true, rating: true, comment: true, blocked: true, createdAt: true, user: { select: { id: true, name: true } }, part: { select: { id: true, name: true, store: { select: { name: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })
    const reviews = rows.slice(0, limit)
    return NextResponse.json({ type, reviews, nextCursor: rows.length > limit && reviews.length ? encodeCursor(reviews[reviews.length - 1]) : null }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    console.error(error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
