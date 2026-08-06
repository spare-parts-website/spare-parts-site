import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

function unauthorized() {
  return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
}

async function getProductParticipant(partId: string, sessionId: string, participantId: string | null) {
  const part = await db.part.findUnique({ where: { id: partId }, include: { store: true } })
  if (!part || part.blocked) return { error: NextResponse.json({ error: 'القطعة غير موجودة' }, { status: 404 }) }

  const isOwner = part.store.ownerId === sessionId
  const otherUserId = isOwner ? participantId : part.store.ownerId
  if (!otherUserId || otherUserId === sessionId) return { error: unauthorized() }

  if (isOwner) {
    const existing = await db.productMessage.count({
      where: {
        partId,
        OR: [
          { senderId: sessionId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: sessionId },
        ],
      },
    })
    if (!existing) return { error: unauthorized() }
  }

  return { part, otherUserId }
}

async function getShopThreads(sessionId: string) {
  const messages = await db.productMessage.findMany({
    where: { part: { store: { ownerId: sessionId } } },
    include: {
      part: { select: { id: true, name: true, image: true } },
      sender: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const threadMap = new Map<string, any>()
  for (const message of messages) {
    const buyer = message.senderId === sessionId ? message.receiver : message.sender
    const key = `${message.partId}:${buyer.id}`
    const current = threadMap.get(key)
    threadMap.set(key, {
      partId: message.partId,
      part: message.part,
      buyerId: buyer.id,
      buyer,
      lastMessage: message,
      unreadCount: (current?.unreadCount || 0) + (!message.read && message.receiverId === sessionId ? 1 : 0),
    })
  }

  return Array.from(threadMap.values()).reverse()
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')
    const partId = searchParams.get('partId')
    const participantId = searchParams.get('participantId')

    if (searchParams.get('scope') === 'shop') {
      if (session.role !== 'SHOP_OWNER') return unauthorized()
      return NextResponse.json({ threads: await getShopThreads(session.id) })
    }

    if (partId) {
      const target = await getProductParticipant(partId, session.id, participantId)
      if (target.error) return target.error

      const messages = await db.productMessage.findMany({
        where: {
          partId,
          OR: [
            { senderId: session.id, receiverId: target.otherUserId },
            { senderId: target.otherUserId, receiverId: session.id },
          ],
        },
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      await db.productMessage.updateMany({
        where: { partId, senderId: target.otherUserId, receiverId: session.id, read: false },
        data: { read: true },
      })
      return NextResponse.json({ messages, part: target.part, participantId: target.otherUserId })
    }

    if (!orderId) return NextResponse.json({ error: 'orderId أو partId مطلوب' }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true } })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const isBuyer = order.buyerId === session.id
    const isOwner = session.role === 'SHOP_OWNER' && order.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isBuyer && !isOwner && !isAdmin) return unauthorized()

    const messages = await db.chatMessage.findMany({
      where: { orderId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    await db.chatMessage.updateMany({ where: { orderId, receiverId: session.id, read: false }, data: { read: true } })
    return NextResponse.json({ messages })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const orderId = typeof body.orderId === 'string' ? body.orderId : null
    const partId = typeof body.partId === 'string' ? body.partId : null
    const participantId = typeof body.participantId === 'string' ? body.participantId : null
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!message) return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })
    if (message.length > 2000) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })

    if (partId) {
      const target = await getProductParticipant(partId, session.id, participantId)
      if (target.error) return target.error

      const msg = await db.productMessage.create({
        data: {
          partId,
          senderId: session.id,
          receiverId: target.otherUserId,
          message,
        },
        include: { sender: { select: { id: true, name: true } } },
      })

      try {
        await createNotification({
          userId: target.otherUserId,
          title: 'رسالة عن قطعة غيار',
          message: `${session.name}: ${message.substring(0, 50)}`,
          type: 'CHAT',
          link: 'shop-dashboard',
        })
      } catch (e) {
        console.error('Notify error:', e)
      }
      return NextResponse.json({ message: msg })
    }

    if (!orderId) return NextResponse.json({ error: 'orderId أو partId مطلوب' }, { status: 400 })
    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true } })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const isBuyer = order.buyerId === session.id
    const isOwner = session.role === 'SHOP_OWNER' && order.store.ownerId === session.id
    if (!isBuyer && !isOwner) return unauthorized()
    const receiverId = isBuyer ? order.store.ownerId : order.buyerId

    const msg = await db.chatMessage.create({
      data: { orderId, senderId: session.id, receiverId, message },
      include: { sender: { select: { id: true, name: true } } },
    })

    try {
      await createNotification({
        userId: receiverId,
        title: 'رسالة جديدة',
        message: `${session.name}: ${message.substring(0, 50)}`,
        type: 'CHAT',
        link: isBuyer ? 'shop-dashboard' : 'orders',
      })
    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ message: msg })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
