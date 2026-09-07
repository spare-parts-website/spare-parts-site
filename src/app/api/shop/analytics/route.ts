import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

type MonthlyRow = { month: Date; revenue: number; orders: bigint }
type TopPartRow = { name: string; count: bigint; revenue: number }
type ResponseRow = { avgMinutes: number | null }

export async function GET() {
  try {
    const session = await requireRole('SHOP_OWNER'); const store = await db.store.findUnique({ where: { ownerId: session.id }, select: { id: true } }); if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1); sixMonthsAgo.setHours(0,0,0,0)
    const [orderStats,statusGroups,rating,monthlyRows,topRows,responseRows] = await Promise.all([
      db.order.aggregate({ where: { storeId: store.id }, _count: { _all: true } }),
      db.order.groupBy({ by: ['status'], where: { storeId: store.id }, _count: { _all: true } }),
      db.productReview.aggregate({ where: { blocked: false, part: { storeId: store.id } }, _avg: { rating: true }, _count: { rating: true } }),
      db.$queryRaw<MonthlyRow[]>(Prisma.sql`SELECT date_trunc('month',o."createdAt") AS month, coalesce(sum(o."totalPrice"),0)::float8 AS revenue, count(*)::bigint AS orders FROM public."Order" o WHERE o."storeId"=${store.id} AND o."paymentStatus"='PAID' AND o."createdAt">=${sixMonthsAgo} GROUP BY 1 ORDER BY 1 ASC`),
      db.$queryRaw<TopPartRow[]>(Prisma.sql`SELECT i."productName" AS name, sum(i.quantity)::bigint AS count, coalesce(sum(i."itemTotal"),0)::float8 AS revenue FROM public."OrderItem" i JOIN public."Order" o ON o.id=i."orderId" WHERE o."storeId"=${store.id} AND o."paymentStatus"='PAID' GROUP BY i."productName" ORDER BY count DESC, revenue DESC LIMIT 5`),
      db.$queryRaw<ResponseRow[]>(Prisma.sql`WITH incoming AS (SELECT m."partId",m."senderId",m."createdAt",(SELECT min(r."createdAt") FROM public."ProductMessage" r WHERE r."partId"=m."partId" AND r."senderId"=${session.id} AND r."receiverId"=m."senderId" AND r."createdAt">m."createdAt") AS replied FROM public."ProductMessage" m JOIN public."Part" p ON p.id=m."partId" WHERE p."storeId"=${store.id} AND m."receiverId"=${session.id}) SELECT avg(extract(epoch from (replied-"createdAt"))/60)::float8 AS "avgMinutes" FROM incoming WHERE replied IS NOT NULL`),
    ])
    const paid = await db.order.aggregate({ where: { storeId: store.id, paymentStatus: 'PAID' }, _count: { _all: true }, _sum: { totalPrice: true } })
    const statusCounts = Object.fromEntries(statusGroups.map((row) => [row.status, row._count._all])); const byMonth = new Map(monthlyRows.map((row) => [row.month.toISOString().slice(0,7), row])); const monthlyRevenue: Array<{ month: string; revenue: number; orders: number }> = []
    for (let i=5;i>=0;i--) { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth()-i); const key = date.toISOString().slice(0,7); const row = byMonth.get(key); monthlyRevenue.push({ month: date.toLocaleDateString('ar-EG',{ month:'short' }), revenue: row?.revenue || 0, orders: Number(row?.orders || 0) }) }
    return NextResponse.json({ stats: { totalOrders: orderStats._count._all, totalRevenue: paid._sum.totalPrice || 0, paidOrders: paid._count._all, avgRating: rating._avg.rating || 0, reviewCount: rating._count.rating, avgResponseMinutes: responseRows[0]?.avgMinutes == null ? null : Math.round(responseRows[0].avgMinutes) }, statusCounts, monthlyRevenue, topParts: topRows.map((row) => ({ name: row.name, count: Number(row.count), revenue: row.revenue })) })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}
