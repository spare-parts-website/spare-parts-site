import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') || 'buyer' // buyer | shop | admin

    let where: any = {}

    if (scope === 'buyer') {
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role)) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      where.buyerId = session.id
    } else if (scope === 'shop') {
      if (session.role !== 'SHOP_OWNER') {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      const store = await db.store.findUnique({ where: { ownerId: session.id } })
      if (!store) return NextResponse.json({ orders: [] })
      where.storeId = store.id
    } else if (scope === 'admin') {
      if (session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
    }

    const orders = await db.order.findMany({
      where,
      include: {
        part: { select: { id: true, name: true, image: true, price: true } },
        store: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true, phone: true, email: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ orders })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const limit = rateLimit(`orders:${session.id}:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'طلبات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const { partId, quantity, deliveryAddress, notes } = body
    const clientOrderId = typeof body.clientOrderId === 'string' && body.clientOrderId.length <= 100 ? body.clientOrderId : null
    const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : null

    if (!partId || typeof deliveryAddress !== 'string' || !deliveryAddress.trim()) {
      return NextResponse.json({ error: 'قطعة الغيار وعنوان التوصيل مطلوبان' }, { status: 400 })
    }
    if (deliveryAddress.trim().length > 500) {
      return NextResponse.json({ error: 'عنوان التوصيل طويل جداً' }, { status: 400 })
    }
    if (typeof notes === 'string' && notes.trim().length > 1000) {
      return NextResponse.json({ error: 'الملاحظات طويلة جداً' }, { status: 400 })
    }

    if (!['BUYER', 'SHOP_OWNER'].includes(session.role)) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لإنشاء الطلبات' }, { status: 403 })
    }

    const part = await db.part.findUnique({
      where: { id: partId },
      include: { store: true },
    })
    if (!part || part.blocked) {
      return NextResponse.json({ error: 'قطعة الغيار غير متوفرة' }, { status: 404 })
    }
    if (session.role === 'SHOP_OWNER' && part.store.ownerId === session.id) {
      return NextResponse.json({ error: 'لا يمكنك طلب قطعة من متجرك' }, { status: 400 })
    }

    const qty = Math.max(1, Math.floor(Number(quantity) || 1))
    if (qty > 100) {
      return NextResponse.json({ error: 'الحد الأقصى للكمية في الطلب هو 100' }, { status: 400 })
    }
    const result = await db.$transaction(async (tx) => {
      if (clientOrderId) {
        const existing = await tx.order.findUnique({ where: { clientOrderId } })
        if (existing) return { order: existing, duplicate: true }
      }

      const coupon = couponCode ? await tx.coupon.findUnique({ where: { code: couponCode } }) : null
      if (couponCode && (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt < new Date()))) throw new Error('INVALID_COUPON')
      const appliesCoupon = coupon && coupon.storeId === part.store.id ? coupon : null

      // Reserve stock at checkout so concurrent buyers cannot oversell it.
      const reserved = await tx.part.updateMany({
        where: { id: part.id, blocked: false, stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      })
      if (reserved.count !== 1) throw new Error('OUT_OF_STOCK')

      const subtotal = part.price * qty
      const discount = appliesCoupon ? Math.round(subtotal * appliesCoupon.discountPercent) / 100 : 0
      if (appliesCoupon) {
        const used = await tx.coupon.updateMany({
          where: { id: appliesCoupon.id, active: true, usedCount: { lt: appliesCoupon.maxUses } },
          data: { usedCount: { increment: 1 } },
        })
        if (used.count !== 1) throw new Error('COUPON_EXHAUSTED')
      }

      const order = await tx.order.create({
        data: {
          partId: part.id,
          storeId: part.store.id,
          buyerId: session.id,
          quantity: qty,
          totalPrice: Math.max(0, subtotal - discount),
          deliveryAddress: deliveryAddress.trim(),
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          // Card data is intentionally not accepted. The beta uses cash on delivery.
          paymentMethod: 'cod',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          couponCode: appliesCoupon?.code ?? null,
          discount,
          clientOrderId,
          timeline: {
            create: { status: 'PENDING', note: 'تم إنشاء الطلب والدفع عند الاستلام' },
          },
        },
      })
      return { order, duplicate: false }
    })
    const order = result.order

    if (result.duplicate) return NextResponse.json({ order, duplicate: true })

    // Persist the notification directly so it works on serverless hosting.
    try {
      await createNotification({
        userId: part.store.ownerId,
        title: 'طلب جديد',
        message: `طلب جديد من ${session.name} على "${part.name}" بكمية ${qty}.`,
        type: 'NEW_ORDER',
        link: 'shop-dashboard',
      })

    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ order })
  } catch (e: any) {
    if (e.message === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: 'الكمية المطلوبة غير متوفرة' }, { status: 400 })
    }
    if (e.message === 'INVALID_COUPON') return NextResponse.json({ error: 'الكوبون غير صالح أو منتهي' }, { status: 400 })
    if (e.message === 'COUPON_EXHAUSTED') return NextResponse.json({ error: 'انتهت استخدامات الكوبون' }, { status: 400 })
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth()
    const limit = rateLimit(`order-action:${session.id}:${requestAddress(req)}`, 60, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const { id, action } = body
    if (typeof id !== 'string' || !['approve', 'reject', 'pay', 'deliver', 'return', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'بيانات الإجراء غير صالحة' }, { status: 400 })
    }

    // action: approve | reject | pay | deliver | return | cancel
    const order = await db.order.findUnique({
      where: { id },
      include: { part: true, store: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    let newStatus = order.status
    let newPaymentStatus = order.paymentStatus

    if (action === 'approve') {
      // Shop owner approves the order
      if (session.role !== 'SHOP_OWNER' || order.store.ownerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      if (order.status !== 'PENDING') {
        return NextResponse.json({ error: 'لا يمكن تعديل هذا الطلب الآن' }, { status: 400 })
      }
      newStatus = 'APPROVED'
    } else if (action === 'reject') {
      if (session.role !== 'SHOP_OWNER' || order.store.ownerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      if (order.status !== 'PENDING') {
        return NextResponse.json({ error: 'لا يمكن تعديل هذا الطلب الآن' }, { status: 400 })
      }
      newStatus = 'REJECTED'
    } else if (action === 'pay') {
      // Buyer pays
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role) || order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      if (order.status !== 'APPROVED') {
        return NextResponse.json({ error: 'لا يمكن الدفع قبل موافقة المحل' }, { status: 400 })
      }
      if (order.paymentMethod === 'cod') {
        return NextResponse.json({ error: 'هذا الطلب يُدفع عند الاستلام' }, { status: 400 })
      }
      newPaymentStatus = 'PAID'
      newStatus = 'PAID'
    } else if (action === 'deliver') {
      // The buyer confirms receipt and cash-on-delivery collection after receiving the order.
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role) || order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      const canDeliver = order.status === 'PAID' || (order.status === 'APPROVED' && order.paymentMethod === 'cod')
      if (!canDeliver) {
        return NextResponse.json({ error: 'لا يمكن تأكيد الاستلام قبل الموافقة على الطلب' }, { status: 400 })
      }
      newStatus = 'DELIVERED'
      if (order.paymentMethod === 'cod') newPaymentStatus = 'PAID'
    } else if (action === 'return') {
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role) || order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      if (order.status !== 'DELIVERED') {
        return NextResponse.json({ error: 'لا يمكن الاسترجاع قبل التوصيل' }, { status: 400 })
      }
      newStatus = 'RETURNED'
      newPaymentStatus = 'REFUNDED'
    } else if (action === 'cancel') {
      if (order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      if (!['PENDING', 'APPROVED'].includes(order.status) || order.paymentStatus !== 'UNPAID') {
        return NextResponse.json({ error: 'لا يمكن إلغاء هذا الطلب الآن' }, { status: 400 })
      }
      newStatus = 'CANCELLED'
    } else {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
    }

    // Timeline notes for each action
    const timelineNotes: Record<string, string> = {
      approve: 'وافق المحل على الطلب',
      reject: 'رفض المحل الطلب',
      pay: 'تم استلام الدفعة',
      deliver: 'أكد العميل استلام الطلب وتحصيل الدفع',
      return: 'تم استرجاع القطعة',
      cancel: 'ألغى العميل الطلب وتمت إعادة الكمية للمخزون',
    }

    const updated = await db.$transaction(async (tx) => {
      // Claim the current state atomically. This prevents double approval/rejection
      // and prevents restoring stock twice when two requests arrive together.
      const claimed = await tx.order.updateMany({
        where: { id, status: order.status, paymentStatus: order.paymentStatus },
        data: { status: newStatus, paymentStatus: newPaymentStatus },
      })
      if (claimed.count !== 1) throw new Error('ORDER_CHANGED')
      await tx.orderTimeline.create({ data: { orderId: id, status: newStatus, note: timelineNotes[action] || newStatus } })
      if (action === 'reject' || action === 'return' || action === 'cancel') {
        await tx.part.update({ where: { id: order.partId }, data: { stock: { increment: order.quantity } } })
      }
      return tx.order.findUnique({ where: { id }, include: { part: true, store: true, timeline: { orderBy: { createdAt: 'asc' } } } })
    })

    // Persist notifications directly so they work on serverless hosting.
    const notify = async (userId: string, title: string, message: string, type: string, link?: string) => {
      try {
        await createNotification({ userId, title, message, type, link })
      } catch (e) {
        console.error('Notify error:', e)
      }
    }

    if (action === 'approve') {
      await notify(order.buyerId, 'تمت الموافقة على طلبك', `وافق ${order.store.name} على طلب "${order.part.name}". يمكنك الدفع الآن.`, 'ORDER_STATUS', 'orders')
    } else if (action === 'reject') {
      await notify(order.buyerId, 'تم رفض طلبك', `اعتذر ${order.store.name} عن تنفيذ طلب "${order.part.name}".`, 'ORDER_STATUS', 'orders')
    } else if (action === 'pay') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'تم استلام دفعة', `دفع العميل ${order.totalPrice} ج.م لطلب "${order.part.name}".`, 'PAYMENT', 'shop-dashboard')
      }
    } else if (action === 'deliver') {
      await notify(
        order.store.ownerId,
        'تم تأكيد استلام الطلب',
        `أكد العميل استلام الطلب وتحصيل الدفع: ${order.part.name}، الكمية ${order.quantity}، الإجمالي ${order.totalPrice} ج.م، رقم الطلب ${order.id}.`,
        'ORDER_STATUS',
        'shop-dashboard',
      )
    } else if (action === 'return') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'طلب استرجاع', `طلب العميل استرجاع "${order.part.name}".`, 'ORDER_STATUS', 'shop-dashboard')
      }
    } else if (action === 'cancel') {
      await notify(order.store.ownerId, 'تم إلغاء طلب', `ألغى العميل طلب "${order.part.name}" قبل التنفيذ.`, 'ORDER_STATUS', 'shop-dashboard')
    }

    return NextResponse.json({ order: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (e.message === 'ORDER_CHANGED') return NextResponse.json({ error: 'تم تحديث الطلب من مستخدم آخر. أعد تحميل الصفحة.' }, { status: 409 })
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
