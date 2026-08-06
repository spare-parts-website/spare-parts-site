import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

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

    const notification = await createNotification({ userId, title, message, type, link })

    return NextResponse.json({ ok: true, notification })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
