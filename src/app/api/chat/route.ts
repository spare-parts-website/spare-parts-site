import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// GET messages for an order
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')
    if (!orderId) return NextResponse.json({ error: 'orderId مطلوب' }, { status: 400 })

    // Verify user has access to this order
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const isBuyer = order.buyerId === session.id
    const isOwner = session.role === 'SHOP_OWNER' && order.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isBuyer && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const messages = await db.chatMessage.findMany({
      where: { orderId },
      include: {
        sender: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Mark received messages as read
    await db.chatMessage.updateMany({
      where: { orderId, receiverId: session.id, read: false },
      data: { read: true },
    })

    return NextResponse.json({ messages })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// POST - send a message
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { orderId, message } = await req.json()
    if (!orderId || !message?.trim()) {
      return NextResponse.json({ error: 'orderId و message مطلوبان' }, { status: 400 })
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const isBuyer = order.buyerId === session.id
    const isOwner = session.role === 'SHOP_OWNER' && order.store.ownerId === session.id
    if (!isBuyer && !isOwner) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const receiverId = isBuyer ? order.store.ownerId : order.buyerId

    const msg = await db.chatMessage.create({
      data: {
        orderId,
        senderId: session.id,
        receiverId,
        message: message.trim(),
      },
      include: { sender: { select: { id: true, name: true } } },
    })

    // Notify the receiver
    try {
      await fetch('http://127.0.0.1:3000/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-notify-secret': process.env.AUTH_SECRET || 'local-development-only-change-me',
        },
        body: JSON.stringify({
          userId: receiverId,
          title: 'رسالة جديدة',
          message: `${session.name}: ${message.trim().substring(0, 50)}`,
          type: 'CHAT',
          link: isBuyer ? 'shop-dashboard' : 'orders',
        }),
      })
    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ message: msg })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
