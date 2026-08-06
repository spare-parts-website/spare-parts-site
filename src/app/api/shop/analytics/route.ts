import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

// GET analytics for shop owner dashboard
export async function GET() {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })

    // Get all orders for this store
    const orders = await db.order.findMany({
      where: { storeId: store.id },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        totalPrice: true,
        quantity: true,
        createdAt: true,
        part: { select: { name: true } },
      },
    })

    // Total revenue (paid orders)
    const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID')
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalPrice, 0)

    // Orders by status
    const statusCounts: Record<string, number> = {}
    orders.forEach((o) => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
    })

    // Monthly revenue (last 6 months)
    const now = new Date()
    const monthlyRevenue: { month: string; revenue: number; orders: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const monthOrders = orders.filter(
        (o) => o.createdAt >= monthStart && o.createdAt < monthEnd && o.paymentStatus === 'PAID'
      )
      monthlyRevenue.push({
        month: monthStart.toLocaleDateString('ar-EG', { month: 'short' }),
        revenue: monthOrders.reduce((sum, o) => sum + o.totalPrice, 0),
        orders: monthOrders.length,
      })
    }

    // Top selling parts
    const partSales: Record<string, { name: string; count: number; revenue: number }> = {}
    paidOrders.forEach((o) => {
      const name = o.part.name
      if (!partSales[name]) partSales[name] = { name, count: 0, revenue: 0 }
      partSales[name].count += o.quantity
      partSales[name].revenue += o.totalPrice
    })
    const topParts = Object.values(partSales).sort((a, b) => b.count - a.count).slice(0, 5)

    // Average rating
    const reviews = await db.productReview.findMany({
      where: { part: { storeId: store.id }, blocked: false },
      select: { rating: true },
    })
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

    return NextResponse.json({
      stats: {
        totalOrders: orders.length,
        totalRevenue,
        paidOrders: paidOrders.length,
        avgRating,
        reviewCount: reviews.length,
      },
      statusCounts,
      monthlyRevenue,
      topParts,
    })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
