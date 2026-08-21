import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createNotification } from '@/lib/notifications'

export async function POST() {
  try {
    const session = await requireAuth()
    const recent = await db.notification.findFirst({ where: { userId: session.id, type: 'ABANDONED_CART', createdAt: { gte: new Date(Date.now() - 3 * 86400000) } }, select: { id: true } })
    if (!recent) await createNotification({ userId: session.id, title: 'قطعك ما زالت في السلة', message: 'أكمل طلبك قبل تغيّر السعر أو نفاد المخزون.', type: 'ABANDONED_CART', link: 'cart' })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 401 }) }
}
