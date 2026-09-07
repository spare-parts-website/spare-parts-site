import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  try {
    const session = await requireAuth()
    const unreadCount = await db.notification.count({ where: { userId: session.id, read: false } })
    return NextResponse.json({ unreadCount }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    console.error('Notification count failed', error)
    return NextResponse.json({ error: 'تعذر تحميل عدد الإشعارات' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
