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
        items: { select: { productName: true, quantity: true, itemTotal: true } },
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
      const lines = o.items.length ? o.items : [{ productName: o.part.name, quantity: o.quantity, itemTotal: o.totalPrice }]
      for (const line of lines) {
        const name = line.productName
        if (!partSales[name]) partSales[name] = { name, count: 0, revenue: 0 }
        partSales[name].count += line.quantity
        partSales[name].revenue += line.itemTotal
      }
    })
    const topParts = Object.values(partSales).sort((a, b) => b.count - a.count).slice(0, 5)

    // Average rating
    const reviews = await db.productReview.findMany({
      where: { part: { storeId: store.id }, blocked: false },
      select: { rating: true },
    })
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
    const messages = await db.productMessage.findMany({ where: { part: { storeId: store.id } }, select: { senderId: true, receiverId: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
    const waitingSince = new Map<string, Date>(); const responseMinutes: number[] = []
    for (const message of messages) {
      const customerId = message.senderId === session.id ? message.receiverId : message.senderId
      if (message.senderId !== session.id) waitingSince.set(customerId, message.createdAt)
      else { const waiting = waitingSince.get(customerId); if (waiting) { responseMinutes.push((message.createdAt.getTime() - waiting.getTime()) / 60000); waitingSince.delete(customerId) } }
    }
    const avgResponseMinutes = responseMinutes.length ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length) : null

    return NextResponse.json({
      stats: {
        totalOrders: orders.length,
        totalRevenue,
        paidOrders: paidOrders.length,
        avgRating,
        reviewCount: reviews.length,
        avgResponseMinutes,
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
