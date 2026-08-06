import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { rateLimit } from '@/lib/rate-limit'

function unauthorized() {
  return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
}

function databaseError(error: any) {
  const code = error?.code
  const message = String(error?.message || '')
  console.error('Chat database error', { code, message })

  if (code === 'P2021' || message.includes('ProductMessage')) {
    return NextResponse.json(
      { error: 'ميزة المحادثة غير جاهزة في قاعدة البيانات. شغّل ملف prisma/product-messages.sql في مشروع Supabase الصحيح ثم أعد النشر.' },
      { status: 503 },
    )
  }
  if (code === 'P2003') {
    return NextResponse.json({ error: 'بيانات المستخدم أو القطعة غير متوافقة. أعد تحميل الصفحة وسجّل الدخول من جديد.' }, { status: 409 })
  }
  return NextResponse.json({ error: 'حدث خطأ في قاعدة البيانات. راجع سجلات Vercel.' }, { status: 500 })
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

async function getInboxThreads(sessionId: string) {
  const [orderMessages, productMessages] = await Promise.all([
    db.chatMessage.findMany({
      where: { OR: [{ senderId: sessionId }, { receiverId: sessionId }] },
      include: {
        order: { select: { id: true, part: { select: { id: true, name: true, image: true } }, store: { select: { name: true } } } },
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.productMessage.findMany({
      where: { OR: [{ senderId: sessionId }, { receiverId: sessionId }] },
      include: {
        part: { select: { id: true, name: true, image: true } },
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const threads = new Map<string, any>()
  for (const message of orderMessages) {
    const other = message.senderId === sessionId ? message.receiver : message.sender
    const key = `order:${message.orderId}:${other.id}`
    if (!threads.has(key)) {
      threads.set(key, {
        kind: 'order', orderId: message.orderId, part: message.order.part,
        storeName: message.order.store.name, otherUser: other, lastMessage: message,
        unreadCount: message.receiverId === sessionId && !message.read ? 1 : 0,
      })
    }
  }
  for (const message of productMessages) {
    const other = message.senderId === sessionId ? message.receiver : message.sender
    const key = `product:${message.partId}:${other.id}`
    if (!threads.has(key)) {
      threads.set(key, {
        kind: 'product', partId: message.partId, participantId: other.id, part: message.part,
        otherUser: other, lastMessage: message,
        unreadCount: message.receiverId === sessionId && !message.read ? 1 : 0,
      })
    }
  }
  return Array.from(threads.values()).sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
  )
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')
    const partId = searchParams.get('partId')
    const participantId = searchParams.get('participantId')

    if (searchParams.get('scope') === 'inbox') {
      return NextResponse.json({ threads: await getInboxThreads(session.id) })
    }

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
    return databaseError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const limit = rateLimit(`chat:${session.id}`, 60, 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'رسائل كثيرة. حاول مرة أخرى بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const orderId = typeof body.orderId === 'string' ? body.orderId : null
    const partId = typeof body.partId === 'string' ? body.partId : null
    const participantId = typeof body.participantId === 'string' ? body.participantId : null
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.startsWith('https://') ? body.imageUrl : null

    if (!message && !imageUrl) return NextResponse.json({ error: 'اكتب رسالة أو أرفق صورة' }, { status: 400 })
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
          imageUrl,
        },
        include: { sender: { select: { id: true, name: true } } },
      })

      try {
        await createNotification({
          userId: target.otherUserId,
          title: 'رسالة عن قطعة غيار',
          message: `${session.name}: ${message || 'أرسل صورة'}`.substring(0, 70),
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
      data: { orderId, senderId: session.id, receiverId, message, imageUrl },
      include: { sender: { select: { id: true, name: true } } },
    })

    try {
      await createNotification({
        userId: receiverId,
        title: 'رسالة جديدة',
        message: `${session.name}: ${message || 'أرسل صورة'}`.substring(0, 70),
        type: 'CHAT',
        link: isBuyer ? 'shop-dashboard' : 'orders',
      })
    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ message: msg })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return databaseError(e)
  }
}
