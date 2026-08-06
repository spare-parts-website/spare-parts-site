import { NextRequest, NextResponse } from 'next/server'

// Internal helper to push a notification via WebSocket and persist in DB
// Can be called from other API routes
export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.AUTH_SECRET || 'local-development-only-change-me'
    if (req.headers.get('x-internal-notify-secret') !== expectedSecret) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await req.json()
    const { userId, title, message, type, link } = body

    if (!userId || !title || !message) {
      return NextResponse.json({ error: 'userId, title, message required' }, { status: 400 })
    }

    // Persist notification in DB
    const { db } = await import('@/lib/db')
    const notification = await db.notification.create({
      data: {
        userId,
        title,
        message,
        type: type || 'SYSTEM',
        link: link || null,
      },
    })

    // Push via WebSocket (fire and forget)
    try {
      await fetch('http://127.0.0.1:3004/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          notification: {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            link: notification.link,
            createdAt: notification.createdAt,
          },
        }),
      })
    } catch (e) {
      console.error('Failed to push WebSocket notification:', e)
    }

    return NextResponse.json({ ok: true, notification })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
