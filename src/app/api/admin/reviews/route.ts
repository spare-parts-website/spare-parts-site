import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

// Get all reviews (including blocked) for admin moderation
export async function GET() {
  try {
    await requireRole('ADMIN')
    const productReviews = await db.productReview.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        part: { select: { id: true, name: true, store: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const storeReviews = await db.storeReview.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ productReviews, storeReviews })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
