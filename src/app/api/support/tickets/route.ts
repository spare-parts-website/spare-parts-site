import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { rateLimit } from '@/lib/rate-limit'
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination'

const CATEGORIES = new Set(['GENERAL','ORDER','ACCOUNT','SELLER','PAYMENT','REPORT','RETURN_REFUND','TECHNICAL','OTHER'])
const STATUSES = new Set(['OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_SUPPORT','RESOLVED','CLOSED'])
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }

const detailInclude = { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, name: true } } } } }
function detailPayload(ticket: any, includePrivateIdentity: boolean) { return { id: ticket.id, category: ticket.category, subject: ticket.subject, status: ticket.status, orderId: ticket.orderId, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), user: includePrivateIdentity && ticket.user ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email } : undefined, messages: ticket.messages.map((message: any) => ({ id: message.id, body: message.body, authorRole: message.authorRole, author: message.author ? { id: message.author.id, name: message.author.name } : null, createdAt: message.createdAt.toISOString() })) } }

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS }); const { searchParams } = new URL(req.url); const id = searchParams.get('id')?.trim()
    if (id) { const ticket = await db.supportTicket.findFirst({ where: { id, ...(session.role === 'ADMIN' ? {} : { userId: session.id }) }, include: detailInclude }); if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS }); return NextResponse.json({ ticket: detailPayload(ticket, session.role === 'ADMIN') }, { headers: PRIVATE_HEADERS }) }
    const status = clean(searchParams.get('status'), 40).toUpperCase(); const category = clean(searchParams.get('category'), 40).toUpperCase(); const search = clean(searchParams.get('search'), 160); const limit = parseLimit(searchParams.get('limit'), 25, 100); const cursor = decodeCursor(searchParams.get('cursor'))
    const where: Prisma.SupportTicketWhereInput = session.role === 'ADMIN' ? {} : { userId: session.id }; if (status && STATUSES.has(status)) where.status = status; if (category && CATEGORIES.has(category)) where.category = category; if (search) where.OR = [{ id: { contains: search, mode: 'insensitive' } }, { subject: { contains: search, mode: 'insensitive' } }, ...(session.role === 'ADMIN' ? [{ user: { name: { contains: search, mode: 'insensitive' as const } } }, { user: { email: { contains: search, mode: 'insensitive' as const } } }] : [])]
    if (cursor) { const updatedAt = new Date(cursor.createdAt); where.AND = [{ OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] }] }
    const rows = await db.supportTicket.findMany({ where, select: { id: true, category: true, subject: true, status: true, orderId: true, createdAt: true, updatedAt: true, ...(session.role === 'ADMIN' ? { user: { select: { id: true, name: true } } } : {}), _count: { select: { messages: true } }, messages: { select: { id: true, body: true, authorRole: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
    const page = rows.slice(0, limit); const tickets = page.map((ticket) => ({ id: ticket.id, category: ticket.category, subject: ticket.subject, status: ticket.status, orderId: ticket.orderId, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), user: 'user' in ticket ? ticket.user : undefined, messageCount: ticket._count.messages, lastMessage: ticket.messages[0] ? { id: ticket.messages[0].id, body: ticket.messages[0].body.slice(0, 240), authorRole: ticket.messages[0].authorRole, createdAt: ticket.messages[0].createdAt.toISOString() } : null }))
    const next = rows.length > limit && page.length ? Buffer.from(JSON.stringify({ createdAt: page[page.length - 1].updatedAt.toISOString(), id: page[page.length - 1].id })).toString('base64url') : null
    return NextResponse.json({ tickets, nextCursor: next }, { headers: PRIVATE_HEADERS })
  } catch (error) { console.error('Support ticket list failed', error); return NextResponse.json({ error: 'تعذر تحميل تذاكر الدعم' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS }); const userLimit = await rateLimit(`support:create:user:${session.id}`, session.role === 'ADMIN' ? 40 : 5, 60 * 60 * 1000); if (!userLimit.allowed) return NextResponse.json({ error: 'تم إنشاء عدد كبير من تذاكر الدعم. حاول لاحقاً.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(userLimit.retryAfter) } })
    const body = await req.json(); const subject = clean(body.subject, 160); const message = clean(body.message, 5000); const category = clean(body.category, 30).toUpperCase() || 'GENERAL'; const orderId = clean(body.orderId, 100) || null
    if (subject.length < 3 || message.length < 2 || !CATEGORIES.has(category)) return NextResponse.json({ error: 'العنوان والرسالة والتصنيف مطلوبة' }, { status: 400, headers: PRIVATE_HEADERS })
    if (orderId && session.role !== 'ADMIN') { const orderLimit = await rateLimit(`support:create:order:${session.id}:${orderId}`, 2, 6 * 60 * 60 * 1000); if (!orderLimit.allowed) return NextResponse.json({ error: 'لديك بالفعل طلبات دعم حديثة مرتبطة بهذا الطلب.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(orderLimit.retryAfter) } }); const order = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true, store: { select: { ownerId: true } } } }); if (!order || (order.buyerId !== session.id && order.store.ownerId !== session.id)) return NextResponse.json({ error: 'لا يمكنك ربط هذه التذكرة بالطلب' }, { status: 403, headers: PRIVATE_HEADERS }) }
    const ticket = await db.supportTicket.create({ data: { userId: session.id, orderId, category, subject, messages: { create: { authorId: session.id, authorRole: session.role, body: message } } }, include: detailInclude }); await audit({ actorId: session.id, action: 'SUPPORT_TICKET_CREATED', targetType: 'support_ticket', targetId: ticket.id, metadata: { category } })
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }); await Promise.allSettled(admins.map((admin) => createNotification({ userId: admin.id, title: 'تذكرة دعم جديدة', message: `${subject} — ${category}`, type: 'SUPPORT', link: `/admin/support?ticket=${encodeURIComponent(ticket.id)}`, dedupeKey: `support-ticket/${ticket.id}/${admin.id}` })))
    return NextResponse.json({ ticket: detailPayload(ticket, false) }, { status: 201, headers: PRIVATE_HEADERS })
  } catch (error) { console.error('Support ticket creation failed', error); return NextResponse.json({ error: 'تعذر إنشاء تذكرة الدعم' }, { status: 500, headers: PRIVATE_HEADERS }) }
}
