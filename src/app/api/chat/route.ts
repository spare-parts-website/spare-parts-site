import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { moderateUserText } from '@/lib/content-moderation'
import { isPrivateImageOwnedBy } from '@/lib/private-image'
import { isPublicUploadUrl } from '@/lib/storage-url'
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

type InboxOrderRow = { kind: 'order'; orderId: string; partId: string; partName: string; partImage: string | null; storeName: string; otherId: string; otherName: string; message: string; imageUrl: string | null; createdAt: Date; unreadCount: bigint }
type InboxProductRow = { kind: 'product'; partId: string; partName: string; partImage: string | null; storeName: string; otherId: string; otherName: string; message: string; imageUrl: string | null; createdAt: Date; unreadCount: bigint }

function messageCursorWhere(cursor: ReturnType<typeof decodeCursor>) {
  if (!cursor) return undefined
  const createdAt = new Date(cursor.createdAt)
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] }
}

async function orderContext(orderId: string, userId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, buyerId: true, part: { select: { id: true, name: true, image: true } }, store: { select: { name: true, ownerId: true } } } })
  if (!order || (order.buyerId !== userId && order.store.ownerId !== userId)) return null
  return { order, otherId: order.buyerId === userId ? order.store.ownerId : order.buyerId }
}

async function productContext(partId: string, userId: string, requestedParticipantId?: string | null) {
  const part = await db.part.findUnique({ where: { id: partId }, select: { id: true, name: true, image: true, store: { select: { name: true, ownerId: true } } } })
  if (!part || part.store.ownerId === userId && !requestedParticipantId) return part && part.store.ownerId === userId ? { error: 'PARTICIPANT_REQUIRED' as const } : null
  const otherId = part.store.ownerId === userId ? requestedParticipantId! : part.store.ownerId
  if (otherId === userId) return null
  if (part.store.ownerId !== userId && requestedParticipantId && requestedParticipantId !== part.store.ownerId) return null
  const other = await db.user.findUnique({ where: { id: otherId }, select: { id: true } })
  if (!other) return null
  return { part, otherId }
}

async function getInboxThreads(userId: string) {
  const [orders, products] = await Promise.all([
    db.$queryRaw<InboxOrderRow[]>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (m."orderId") m."orderId", m."message", m."imageUrl", m."createdAt",
          CASE WHEN m."senderId"=${userId} THEN m."receiverId" ELSE m."senderId" END AS "otherId"
        FROM public."ChatMessage" m
        WHERE m."senderId"=${userId} OR m."receiverId"=${userId}
        ORDER BY m."orderId", m."createdAt" DESC, m."id" DESC
      )
      SELECT 'order'::text AS kind, l."orderId", p.id AS "partId", p.name AS "partName", p.image AS "partImage", s.name AS "storeName",
        l."otherId", u.name AS "otherName", l.message, l."imageUrl", l."createdAt",
        (SELECT count(*) FROM public."ChatMessage" unread WHERE unread."orderId"=l."orderId" AND unread."receiverId"=${userId} AND unread.read=false)::bigint AS "unreadCount"
      FROM latest l JOIN public."Order" o ON o.id=l."orderId" JOIN public."Part" p ON p.id=o."partId" JOIN public."Store" s ON s.id=o."storeId" JOIN public."User" u ON u.id=l."otherId"
      ORDER BY l."createdAt" DESC LIMIT 50
    `),
    db.$queryRaw<InboxProductRow[]>(Prisma.sql`
      WITH relevant AS (
        SELECT m.*, CASE WHEN m."senderId"=${userId} THEN m."receiverId" ELSE m."senderId" END AS "otherId"
        FROM public."ProductMessage" m WHERE m."senderId"=${userId} OR m."receiverId"=${userId}
      ), latest AS (
        SELECT DISTINCT ON (r."partId",r."otherId") r."partId",r."otherId",r.message,r."imageUrl",r."createdAt"
        FROM relevant r ORDER BY r."partId",r."otherId",r."createdAt" DESC,r.id DESC
      )
      SELECT 'product'::text AS kind, l."partId",p.name AS "partName",p.image AS "partImage",s.name AS "storeName",
        l."otherId",u.name AS "otherName",l.message,l."imageUrl",l."createdAt",
        (SELECT count(*) FROM public."ProductMessage" unread WHERE unread."partId"=l."partId" AND unread."receiverId"=${userId} AND unread.read=false AND (unread."senderId"=l."otherId" OR unread."receiverId"=l."otherId"))::bigint AS "unreadCount"
      FROM latest l JOIN public."Part" p ON p.id=l."partId" JOIN public."Store" s ON s.id=p."storeId" JOIN public."User" u ON u.id=l."otherId"
      ORDER BY l."createdAt" DESC LIMIT 50
    `),
  ])
  return [...orders.map((row) => ({ kind: 'order' as const, orderId: row.orderId, part: { id: row.partId, name: row.partName, image: row.partImage }, storeName: row.storeName, otherUser: { id: row.otherId, name: row.otherName }, lastMessage: { message: row.message, imageUrl: row.imageUrl, createdAt: row.createdAt.toISOString() }, unreadCount: Number(row.unreadCount) })), ...products.map((row) => ({ kind: 'product' as const, partId: row.partId, participantId: row.otherId, part: { id: row.partId, name: row.partName, image: row.partImage }, storeName: row.storeName, otherUser: { id: row.otherId, name: row.otherName }, lastMessage: { message: row.message, imageUrl: row.imageUrl, createdAt: row.createdAt.toISOString() }, unreadCount: Number(row.unreadCount) }))].sort((a, b) => Date.parse(b.lastMessage.createdAt) - Date.parse(a.lastMessage.createdAt)).slice(0, 100)
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const url = new URL(req.url); const scope = url.searchParams.get('scope')
    if (scope === 'inbox' || scope === 'shop') {
      if (scope === 'shop') await requireRole('SHOP_OWNER')
      return NextResponse.json({ threads: await getInboxThreads(session.id) }, { headers: PRIVATE_HEADERS })
    }
    const orderId = url.searchParams.get('orderId')?.trim(); const partId = url.searchParams.get('partId')?.trim(); const participantId = url.searchParams.get('participantId')?.trim(); const limit = parseLimit(url.searchParams.get('limit'), 50, 100); const cursor = decodeCursor(url.searchParams.get('cursor'))
    if (!orderId && !partId) return NextResponse.json({ error: 'معرف المحادثة مطلوب' }, { status: 400, headers: PRIVATE_HEADERS })
    if (orderId) {
      const context = await orderContext(orderId, session.id); if (!context) return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
      const rows = await db.chatMessage.findMany({ where: { orderId, AND: [{ OR: [{ senderId: session.id, receiverId: context.otherId }, { senderId: context.otherId, receiverId: session.id }] }, ...(messageCursorWhere(cursor) ? [messageCursorWhere(cursor)!] : [])] }, include: { sender: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
      const hasMore = rows.length > limit; const page = rows.slice(0, limit); const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1]) : null
      return NextResponse.json({ messages: page.reverse(), nextCursor }, { headers: PRIVATE_HEADERS })
    }
    const context = await productContext(partId!, session.id, participantId); if (!context || 'error' in context) return NextResponse.json({ error: context && 'error' in context ? 'حدد العميل للمحادثة' : 'غير مصرح' }, { status: context && 'error' in context ? 400 : 403, headers: PRIVATE_HEADERS })
    const rows = await db.productMessage.findMany({ where: { partId: partId!, AND: [{ OR: [{ senderId: session.id, receiverId: context.otherId }, { senderId: context.otherId, receiverId: session.id }] }, ...(messageCursorWhere(cursor) ? [messageCursorWhere(cursor)!] : [])] }, include: { sender: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
    const hasMore = rows.length > limit; const page = rows.slice(0, limit); const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1]) : null
    return NextResponse.json({ messages: page.reverse(), nextCursor }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS }); console.error('Chat load failed', error); return NextResponse.json({ error: 'تعذر تحميل المحادثة. حاول مرة أخرى.' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(); const body = await req.json(); const orderId = typeof body.orderId === 'string' ? body.orderId : ''; const partId = typeof body.partId === 'string' ? body.partId : ''; const participantId = typeof body.participantId === 'string' ? body.participantId : null
    if (orderId) { const context = await orderContext(orderId, session.id); if (!context) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); await db.chatMessage.updateMany({ where: { orderId, senderId: context.otherId, receiverId: session.id, read: false }, data: { read: true } }); return NextResponse.json({ ok: true }) }
    if (partId) { const context = await productContext(partId, session.id, participantId); if (!context || 'error' in context) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); await db.productMessage.updateMany({ where: { partId, senderId: context.otherId, receiverId: session.id, read: false }, data: { read: true } }); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: 'معرف المحادثة مطلوب' }, { status: 400 })
  } catch { return NextResponse.json({ error: 'تعذر تحديث حالة القراءة' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(); const limit = await rateLimit(`chat:${session.id}:${requestAddress(req)}`, 40, 60_000)
    if (!limit.allowed) return NextResponse.json({ error: 'رسائل كثيرة. حاول بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json(); const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''; const partId = typeof body.partId === 'string' ? body.partId.trim() : ''; const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : null; const text = typeof body.message === 'string' ? body.message.trim().slice(0, 3000) : ''; const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    if (!text && !imageUrl) return NextResponse.json({ error: 'اكتب رسالة أو أرفق صورة' }, { status: 400 })
    if (text) { const moderation = moderateUserText(text); if (!moderation.allowed) return NextResponse.json({ error: moderation.message }, { status: 400 }) }
    if (imageUrl && session.role === 'BUYER') return NextResponse.json({ error: 'إرفاق الصور غير متاح لهذا الحساب' }, { status: 403 })
    if (imageUrl && !isPrivateImageOwnedBy(imageUrl, 'chat', session.id) && !isPublicUploadUrl(imageUrl)) return NextResponse.json({ error: 'رابط الصورة غير صالح' }, { status: 400 })
    let created; let receiverId: string; let title: string; let link: string
    if (orderId) {
      const context = await orderContext(orderId, session.id); if (!context) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); receiverId = context.otherId
      created = await db.chatMessage.create({ data: { orderId, senderId: session.id, receiverId, message: text, imageUrl: imageUrl || null }, include: { sender: { select: { id: true, name: true } } } }); title = 'رسالة جديدة عن طلب'; link = `/messages/${orderId}`
    } else if (partId) {
      const context = await productContext(partId, session.id, participantId); if (!context || 'error' in context) return NextResponse.json({ error: context && 'error' in context ? 'حدد العميل للمحادثة' : 'غير مصرح' }, { status: context && 'error' in context ? 400 : 403 }); receiverId = context.otherId
      created = await db.productMessage.create({ data: { partId, senderId: session.id, receiverId, message: text, imageUrl: imageUrl || null }, include: { sender: { select: { id: true, name: true } } } }); title = 'رسالة جديدة عن قطعة'; link = `/messages/part/${partId}?participant=${encodeURIComponent(session.id)}`
    } else return NextResponse.json({ error: 'معرف المحادثة مطلوب' }, { status: 400 })
    await createNotification({ userId: receiverId, title, message: text || 'صورة مرفقة', type: 'MESSAGE', link, dedupeKey: `message/${created.id}/${receiverId}` })
    return NextResponse.json({ message: created }, { status: 201, headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 }); console.error('Chat send failed', error); return NextResponse.json({ error: 'تعذر إرسال الرسالة' }, { status: 500 }) }
}
