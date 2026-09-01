import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'

type Params = { params: Promise<{ id: string }> }

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const include = {
  user: { select: { id: true, name: true, email: true } },
  messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, name: true } } } },
}

function serialize(ticket: any, admin: boolean) {
  return {
    id: ticket.id,
    category: ticket.category,
    subject: ticket.subject,
    status: ticket.status,
    orderId: ticket.orderId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    user: admin ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email } : undefined,
    messages: ticket.messages.map((message: any) => ({ id: message.id, body: message.body, authorRole: message.authorRole, author: message.author ? { id: message.author.id, name: message.author.name } : null, createdAt: message.createdAt.toISOString() })),
  }
}

async function loadTicket(id: string, userId: string, admin: boolean) {
  return db.supportTicket.findFirst({ where: { id, ...(admin ? {} : { userId }) }, include })
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { id } = await params
    const ticket = await loadTicket(id, session.id, session.role === 'ADMIN')
    if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 })
    return NextResponse.json({ ticket: serialize(ticket, session.role === 'ADMIN') }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('Support ticket read failed', error)
    return NextResponse.json({ error: 'تعذر تحميل التذكرة' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { id } = await params
    const ticket = await loadTicket(id, session.id, session.role === 'ADMIN')
    if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 })
    const body = await req.json()
    const message = clean(body.message, 5000)
    if (message.length < 2) return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })

    const updated = await db.$transaction(async (tx) => {
      await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: session.id, authorRole: session.role, body: message } })
      return tx.supportTicket.update({ where: { id: ticket.id }, data: { status: session.role === 'ADMIN' ? 'WAITING_FOR_CUSTOMER' : 'WAITING_FOR_SUPPORT' }, include })
    })
    if (session.role === 'ADMIN') {
      await Promise.allSettled([
        createNotification({ userId: ticket.userId, title: 'رد جديد من الدعم', message: `تمت إضافة رد على تذكرتك: ${ticket.subject}`, type: 'SUPPORT', link: `/support?ticket=${encodeURIComponent(ticket.id)}` }),
        audit({ actorId: session.id, action: 'SUPPORT_TICKET_REPLIED', targetType: 'support_ticket', targetId: ticket.id }),
      ])
    }
    return NextResponse.json({ ticket: serialize(updated, session.role === 'ADMIN') })
  } catch (error) {
    console.error('Support ticket reply failed', error)
    return NextResponse.json({ error: 'تعذر إرسال الرد' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    const { id } = await params
    const current = await loadTicket(id, session.id, true)
    if (!current) return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 })
    const body = await req.json()
    const status = clean(body.status, 40).toUpperCase()
    const allowed = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED'])
    if (!allowed.has(status)) return NextResponse.json({ error: 'حالة التذكرة غير صالحة' }, { status: 400 })
    const updated = await db.supportTicket.update({ where: { id }, data: { status }, include })
    await audit({ actorId: session.id, action: 'SUPPORT_TICKET_STATUS_CHANGED', targetType: 'support_ticket', targetId: id, metadata: { from: current.status, to: status } })
    return NextResponse.json({ ticket: serialize(updated, true) })
  } catch (error) {
    console.error('Support ticket update failed', error)
    return NextResponse.json({ error: 'تعذر تحديث التذكرة' }, { status: 500 })
  }
}
