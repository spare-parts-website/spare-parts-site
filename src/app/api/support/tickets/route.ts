import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'

const CATEGORIES = new Set(['GENERAL', 'ORDER', 'ACCOUNT', 'SELLER', 'PAYMENT', 'REPORT', 'RETURN_REFUND', 'TECHNICAL', 'OTHER'])
const STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED'])
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function ticketPayload(ticket: any, includePrivateIdentity: boolean) {
  return {
    id: ticket.id,
    category: ticket.category,
    subject: ticket.subject,
    status: ticket.status,
    orderId: ticket.orderId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    user: includePrivateIdentity && ticket.user ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email } : undefined,
    messages: ticket.messages.map((message: any) => ({
      id: message.id,
      body: message.body,
      authorRole: message.authorRole,
      author: message.author ? { id: message.author.id, name: message.author.name } : null,
      createdAt: message.createdAt.toISOString(),
    })),
  }
}

const include = {
  user: { select: { id: true, name: true, email: true } },
  messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, name: true } } } },
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')?.trim()
    const status = clean(searchParams.get('status'), 40).toUpperCase()
    const category = clean(searchParams.get('category'), 40).toUpperCase()
    const search = clean(searchParams.get('search'), 160)
    const filters: Prisma.SupportTicketWhereInput = session.role === 'ADMIN' ? {} : { userId: session.id }
    if (status && STATUSES.has(status)) filters.status = status
    if (category && CATEGORIES.has(category)) filters.category = category
    if (search) {
      filters.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }
    const tickets = id
      ? await db.supportTicket.findMany({ where: { id, ...(session.role === 'ADMIN' ? {} : { userId: session.id }) }, include })
      : await db.supportTicket.findMany({ where: filters, include, orderBy: { updatedAt: 'desc' }, take: 100 })
    if (id && !tickets[0]) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS })
    return NextResponse.json({ tickets: tickets.map((ticket) => ticketPayload(ticket, session.role === 'ADMIN')) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('Support ticket list failed', error)
    return NextResponse.json({ error: 'تعذر تحميل تذاكر الدعم' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    const body = await req.json()
    const subject = clean(body.subject, 160)
    const message = clean(body.message, 5000)
    const category = clean(body.category, 30).toUpperCase() || 'GENERAL'
    const orderId = clean(body.orderId, 100) || null
    if (subject.length < 3 || message.length < 2 || !CATEGORIES.has(category)) return NextResponse.json({ error: 'العنوان والرسالة والتصنيف مطلوبة' }, { status: 400, headers: PRIVATE_HEADERS })

    if (orderId && session.role !== 'ADMIN') {
      const order = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true, store: { select: { ownerId: true } } } })
      if (!order || (order.buyerId !== session.id && order.store.ownerId !== session.id)) return NextResponse.json({ error: 'لا يمكنك ربط هذه التذكرة بالطلب' }, { status: 403, headers: PRIVATE_HEADERS })
    }

    const ticket = await db.supportTicket.create({
      data: {
        userId: session.id,
        orderId,
        category,
        subject,
        messages: { create: { authorId: session.id, authorRole: session.role, body: message } },
      },
      include,
    })
    await audit({ actorId: session.id, action: 'SUPPORT_TICKET_CREATED', targetType: 'support_ticket', targetId: ticket.id, metadata: { category } })

    // Admin notifications are the single delivery path for new tickets. They
    // create the in-site notification first and independently send email only
    // when that admin has notifications enabled and is not bounce-suppressed.
    // This avoids a second SUPPORT_EMAIL copy drifting to a stale address.
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.allSettled(admins.map((admin) => createNotification({
      userId: admin.id,
      title: 'تذكرة دعم جديدة',
      message: `${subject} — ${category}`,
      type: 'SUPPORT',
      link: `/admin/support?ticket=${encodeURIComponent(ticket.id)}`,
      dedupeKey: `support-ticket/${ticket.id}/${admin.id}`,
    })))

    return NextResponse.json({ ticket: ticketPayload(ticket, false) }, { status: 201, headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('Support ticket creation failed', error)
    return NextResponse.json({ error: 'تعذر إنشاء تذكرة الدعم' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
