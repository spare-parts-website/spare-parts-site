import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'

// Get all notifications for the current user
export async function GET() {
  try {
    const session = await requireAuth()
    const notifications = await db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = await db.notification.count({
      where: { userId: session.id, read: false },
    })
    return NextResponse.json({ notifications, unreadCount })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// Mark notification(s) as read
export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const { id, all } = body

    if (all) {
      await db.notification.updateMany({
        where: { userId: session.id, read: false },
        data: { read: true },
      })
    } else if (id) {
      await db.notification.updateMany({
        where: { id, userId: session.id },
        data: { read: true },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
