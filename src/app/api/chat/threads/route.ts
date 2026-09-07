import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

type ThreadRow = {
  kind: 'order' | 'product'
  orderId: string | null
  partId: string
  partName: string
  partImage: string | null
  storeName: string
  otherId: string
  otherName: string
  message: string
  imageUrl: string | null
  createdAt: Date
  sortId: string
  unreadCount: bigint
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const url = new URL(req.url)
    const scope = url.searchParams.get('scope') === 'shop' ? 'shop' : 'inbox'
    if (scope === 'shop') await requireRole('SHOP_OWNER')

    const limit = parseLimit(url.searchParams.get('limit'), 25, 50)
    const cursor = decodeCursor(url.searchParams.get('cursor'))
    const cursorAt = cursor ? new Date(cursor.createdAt) : null
    const cursorId = cursor?.id || null

    const rows = await db.$queryRaw<ThreadRow[]>(Prisma.sql`
      WITH order_latest AS (
        SELECT DISTINCT ON (m."orderId")
          'order'::text AS kind,
          m."orderId" AS "orderId",
          o."partId" AS "partId",
          p.name AS "partName",
          p.image AS "partImage",
          s.name AS "storeName",
          CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END AS "otherId",
          u.name AS "otherName",
          m.message,
          m."imageUrl",
          m."createdAt",
          m.id AS "sortId",
          (SELECT count(*) FROM public."ChatMessage" unread
            WHERE unread."orderId"=m."orderId" AND unread."receiverId"=${session.id} AND unread.read=false)::bigint AS "unreadCount"
        FROM public."ChatMessage" m
        JOIN public."Order" o ON o.id=m."orderId"
        JOIN public."Part" p ON p.id=o."partId"
        JOIN public."Store" s ON s.id=o."storeId"
        JOIN public."User" u ON u.id=CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END
        WHERE m."senderId"=${session.id} OR m."receiverId"=${session.id}
        ORDER BY m."orderId", m."createdAt" DESC, m.id DESC
      ),
      product_latest AS (
        SELECT DISTINCT ON (m."partId", CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END)
          'product'::text AS kind,
          NULL::text AS "orderId",
          m."partId" AS "partId",
          p.name AS "partName",
          p.image AS "partImage",
          s.name AS "storeName",
          CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END AS "otherId",
          u.name AS "otherName",
          m.message,
          m."imageUrl",
          m."createdAt",
          m.id AS "sortId",
          (SELECT count(*) FROM public."ProductMessage" unread
            WHERE unread."partId"=m."partId"
              AND unread."receiverId"=${session.id}
              AND unread."senderId"=CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END
              AND unread.read=false)::bigint AS "unreadCount"
        FROM public."ProductMessage" m
        JOIN public."Part" p ON p.id=m."partId"
        JOIN public."Store" s ON s.id=p."storeId"
        JOIN public."User" u ON u.id=CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END
        WHERE m."senderId"=${session.id} OR m."receiverId"=${session.id}
        ORDER BY m."partId", CASE WHEN m."senderId"=${session.id} THEN m."receiverId" ELSE m."senderId" END, m."createdAt" DESC, m.id DESC
      ),
      threads AS (
        SELECT * FROM order_latest
        UNION ALL
        SELECT * FROM product_latest
      )
      SELECT * FROM threads
      WHERE ${cursorAt ? Prisma.sql`("createdAt" < ${cursorAt} OR ("createdAt" = ${cursorAt} AND "sortId" < ${cursorId}))` : Prisma.sql`TRUE`}
      ORDER BY "createdAt" DESC, "sortId" DESC
      LIMIT ${limit + 1}
    `)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const threads = page.map((row) => ({
      kind: row.kind,
      orderId: row.orderId || undefined,
      partId: row.partId,
      participantId: row.kind === 'product' ? row.otherId : undefined,
      part: { id: row.partId, name: row.partName, image: row.partImage },
      storeName: row.storeName,
      otherUser: { id: row.otherId, name: row.otherName },
      lastMessage: { message: row.message, imageUrl: row.imageUrl, createdAt: row.createdAt.toISOString() },
      unreadCount: Number(row.unreadCount),
    }))
    const tail = page[page.length - 1]
    const nextCursor = hasMore && tail ? encodeCursor({ id: tail.sortId, createdAt: tail.createdAt }) : null
    return NextResponse.json({ threads, nextCursor }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS })
    if (message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    console.error('Chat thread load failed', error)
    return NextResponse.json({ error: 'تعذر تحميل المحادثات' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
