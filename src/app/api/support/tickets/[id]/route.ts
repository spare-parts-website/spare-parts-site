import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { rateLimit } from '@/lib/rate-limit'
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination'

type Params = { params: Promise<{ id: string }> }
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }

function serializeTicket(ticket: any, admin: boolean) {
  return { id: ticket.id, category: ticket.category, subject: ticket.subject, status: ticket.status, orderId: ticket.orderId, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), user: admin && ticket.user ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email } : undefined }
}
function serializeMessage(message: any) { return { id: message.id, body: message.body, authorRole: message.authorRole, author: message.author ? { id: message.author.id, name: message.author.name } : null, createdAt: message.createdAt.toISOString() } }
async function loadTicket(id: string, userId: string, admin: boolean) { return db.supportTicket.findFirst({ where: { id, ...(admin ? {} : { userId }) }, include: { user: { select: { id: true, name: true, email: true } } } }) }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    const { id } = await params; const admin = session.role === 'ADMIN'; const ticket = await loadTicket(id, session.id, admin)
    if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS })
    const url = new URL(req.url); const limit = parseLimit(url.searchParams.get('limit'), 50, 100); const cursor = decodeCursor(url.searchParams.get('cursor'))
    const rows = await db.supportMessage.findMany({ where: { ticketId: id, ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}) }, include: { author: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
    const hasMore = rows.length > limit; const page = rows.slice(0, limit); const tail = page[page.length - 1]
    return NextResponse.json({ ticket: serializeTicket(ticket, admin), messages: page.reverse().map(serializeMessage), nextCursor: hasMore && tail ? encodeCursor(tail) : null }, { headers: PRIVATE_HEADERS })
  } catch (error) { console.error('Support ticket read failed', error); return NextResponse.json({ error: 'تعذر تحميل التذكرة' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    const { id } = await params
    const userLimit = await rateLimit(`support:reply:user:${session.id}`, session.role === 'ADMIN' ? 120 : 20, 15 * 60 * 1000); if (!userLimit.allowed) return NextResponse.json({ error: 'تم إرسال عدد كبير من ردود الدعم. حاول لاحقاً.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(userLimit.retryAfter) } })
    const ticketLimit = await rateLimit(`support:reply:ticket:${session.id}:${id}`, session.role === 'ADMIN' ? 30 : 10, 10 * 60 * 1000); if (!ticketLimit.allowed) return NextResponse.json({ error: 'ردود كثيرة على هذه التذكرة. حاول بعد قليل.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(ticketLimit.retryAfter) } })
    const admin = session.role === 'ADMIN'; const ticket = await loadTicket(id, session.id, admin); if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS })
    const body = await req.json(); const message = clean(body.message, 5000); if (message.length < 2) return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400, headers: PRIVATE_HEADERS })
    const result = await db.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: session.id, authorRole: session.role, body: message }, include: { author: { select: { id: true, name: true } } } })
      const updated = await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: admin ? 'WAITING_FOR_CUSTOMER' : 'WAITING_FOR_SUPPORT' }, include: { user: { select: { id: true, name: true, email: true } } } })
      return { created, updated }
    })
    if (admin) await Promise.allSettled([createNotification({ userId: ticket.userId, title: 'رد جديد من الدعم', message: `تمت إضافة رد على تذكرتك: ${ticket.subject}`, type: 'SUPPORT', link: `/support?ticket=${encodeURIComponent(ticket.id)}`, dedupeKey: `support-reply/${ticket.id}/${result.created.id}/${ticket.userId}` }), audit({ actorId: session.id, action: 'SUPPORT_TICKET_REPLIED', targetType: 'support_ticket', targetId: ticket.id })])
    return NextResponse.json({ ticket: serializeTicket(result.updated, admin), message: serializeMessage(result.created) }, { headers: PRIVATE_HEADERS })
  } catch (error) { console.error('Support ticket reply failed', error); return NextResponse.json({ error: 'تعذر إرسال الرد' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession(); if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    const { id } = await params; const current = await loadTicket(id, session.id, true); if (!current) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS })
    const body = await req.json(); const status = clean(body.status, 40).toUpperCase(); const allowed = new Set(['OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_SUPPORT','RESOLVED','CLOSED']); if (!allowed.has(status)) return NextResponse.json({ error: 'حالة التذكرة غير صالحة' }, { status: 400, headers: PRIVATE_HEADERS })
    const updated = await db.supportTicket.update({ where: { id }, data: { status }, include: { user: { select: { id: true, name: true, email: true } } } }); await audit({ actorId: session.id, action: 'SUPPORT_TICKET_STATUS_CHANGED', targetType: 'support_ticket', targetId: id, metadata: { from: current.status, to: status } })
    return NextResponse.json({ ticket: serializeTicket(updated, true) }, { headers: PRIVATE_HEADERS })
  } catch (error) { console.error('Support ticket update failed', error); return NextResponse.json({ error: 'تعذر تحديث التذكرة' }, { status: 500, headers: PRIVATE_HEADERS }) }
}
