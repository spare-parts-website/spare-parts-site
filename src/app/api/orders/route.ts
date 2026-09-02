import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { calculateOrderLine, InvalidOrderTransition, isOrderAction, resolveOrderTransition } from '@/lib/order-state'
import { deliveryQuote } from '@/lib/delivery'
import type { Prisma } from '@prisma/client'
import { buildGroupedOrderDrafts } from '@/lib/grouped-orders'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'

type CheckoutItem = { partId: string; quantity: number }
type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>

async function createCartOrders(session: Awaited<ReturnType<typeof requireAuth>>, body: Record<string, unknown>) {
  const checkoutId = typeof body.checkoutId === 'string' ? body.checkoutId.trim() : ''
  const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : ''
  const quote = deliveryQuote(body.governorate)
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(checkoutId)) throw new Error('INVALID_CHECKOUT')
  if (!deliveryAddress || deliveryAddress.length > 500 || notes.length > 1000 || !quote) throw new Error('INVALID_CHECKOUT')
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new Error('INVALID_CHECKOUT')

  const items: CheckoutItem[] = body.items.map((value) => {
    const item = value as Partial<CheckoutItem>
    const quantity = Math.floor(Number(item.quantity))
    if (typeof item.partId !== 'string' || !item.partId || !Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
      throw new Error('INVALID_CHECKOUT')
    }
    return { partId: item.partId, quantity }
  })
  if (new Set(items.map((item) => item.partId)).size !== items.length) throw new Error('INVALID_CHECKOUT')

  try {
    return await db.$transaction(async (tx) => {
    const existingOrders = await tx.order.findMany({
      where: { buyerId: session.id, clientOrderId: { startsWith: `${checkoutId}:` } },
      include: { items: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
    if (existingOrders.length) {
      return {
        orders: existingOrders,
        duplicate: true,
        sellerSummaries: [] as Array<{ ownerId: string; storeName: string; itemCount: number; totalQuantity: number; totalPrice: number; orderId: string }>,
        stockSummaries: [] as Array<{ ownerId: string; partId: string; partName: string; remainingStock: number }>,
      }
    }

    const parts = await tx.part.findMany({
      where: { id: { in: items.map((item) => item.partId) }, blocked: false },
      include: { store: true },
    })
    if (parts.length !== items.length) throw new Error('PART_UNAVAILABLE')
    const partById = new Map(parts.map((part) => [part.id, part]))
    for (const item of items) {
      const part = partById.get(item.partId)!
      if (session.role === 'SHOP_OWNER' && part.store.ownerId === session.id) throw new Error('OWN_STORE')
    }

    const coupon = couponCode ? await tx.coupon.findUnique({ where: { code: couponCode } }) : null
    if (couponCode && (!coupon || !coupon.active || coupon.usedCount >= coupon.maxUses || (coupon.expiresAt && coupon.expiresAt < new Date()))) {
      throw new Error('INVALID_COUPON')
    }
    if (coupon) {
      const appliesToCart = parts.some((part) => part.storeId === coupon.storeId)
      if (!appliesToCart) throw new Error('INVALID_COUPON')
      const claimedCoupon = await tx.coupon.updateMany({
        where: { id: coupon.id, active: true, usedCount: { lt: coupon.maxUses } },
        data: { usedCount: { increment: 1 } },
      })
      if (claimedCoupon.count !== 1) throw new Error('COUPON_EXHAUSTED')
    }

    const reservedLines = new Map<string, { quantity: number; remainingStock: number }>()
    for (const item of items) {
      const part = partById.get(item.partId)!
      const reserved = await tx.part.updateMany({
        where: { id: part.id, blocked: false, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      })
      if (reserved.count !== 1) throw new Error('OUT_OF_STOCK')
      reservedLines.set(part.id, { quantity: item.quantity, remainingStock: part.stock - item.quantity })
    }

    const orders: OrderWithItems[] = []
    const sellerSummaries: Array<{ ownerId: string; storeName: string; itemCount: number; totalQuantity: number; totalPrice: number; orderId: string }> = []
    const stockSummaries: Array<{ ownerId: string; partId: string; partName: string; remainingStock: number }> = []
    const drafts = buildGroupedOrderDrafts(items.map((item) => {
      const part = partById.get(item.partId)!
      return {
        partId: part.id,
        storeId: part.storeId,
        ownerId: part.store.ownerId,
        storeName: part.store.name,
        productName: part.name,
        productImage: part.image,
        unitPrice: part.price,
        quantity: item.quantity,
      }
    }), quote.fee, coupon ? { storeId: coupon.storeId, code: coupon.code, discountPercent: coupon.discountPercent } : null)

    for (const draft of drafts) {
      const firstLine = draft.items[0]
      const order = await tx.order.create({
        data: {
          // Legacy summary fields remain populated while all new detail lives
          // in immutable OrderItem snapshots.
          partId: firstLine.partId,
          storeId: draft.storeId,
          buyerId: session.id,
          quantity: draft.totalQuantity,
          totalPrice: draft.totalPrice,
          governorate: quote.ar,
          shippingFee: draft.shippingFee,
          estimatedDeliveryAt: quote.estimatedAt,
          deliveryAddress,
          notes: notes || null,
          paymentMethod: 'cod',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          couponCode: draft.couponCode,
          discount: draft.discount,
          clientOrderId: `${checkoutId}:${draft.storeId}`,
          items: {
            create: draft.items.map((line) => ({
              partId: line.partId,
              productName: line.productName,
              productImage: line.productImage,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              discount: line.discount,
              itemTotal: line.itemTotal,
            })),
          },
          timeline: { create: { status: 'PENDING', note: 'تم إنشاء الطلب والدفع عند الاستلام' } },
        },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      })
      orders.push(order)
      sellerSummaries.push({
        ownerId: draft.ownerId,
        storeName: draft.storeName,
        itemCount: draft.items.length,
        totalQuantity: draft.totalQuantity,
        totalPrice: draft.totalPrice,
        orderId: order.id,
      })
      for (const line of draft.items) {
        stockSummaries.push({
          ownerId: line.ownerId,
          partId: line.partId,
          partName: line.productName,
          remainingStock: reservedLines.get(line.partId)!.remainingStock,
        })
      }
    }
    return { orders, duplicate: false, sellerSummaries, stockSummaries }
    })
  } catch (cause) {
    const code = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : null
    if (code === 'P2002') {
      const existingOrders = await db.order.findMany({
        where: { buyerId: session.id, clientOrderId: { startsWith: `${checkoutId}:` } },
        include: { items: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      })
      if (existingOrders.length) {
        return {
          orders: existingOrders,
          duplicate: true,
          sellerSummaries: [] as Array<{ ownerId: string; storeName: string; itemCount: number; totalQuantity: number; totalPrice: number; orderId: string }>,
          stockSummaries: [] as Array<{ ownerId: string; partId: string; partName: string; remainingStock: number }>,
        }
      }
    }
    throw cause
  }
}

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
    } else {
      return NextResponse.json({ error: 'نطاق الطلبات غير صالح' }, { status: 400 })
    }

    const orders = await db.order.findMany({
      where,
      include: {
        part: { select: { id: true, name: true, image: true, price: true } },
        items: { orderBy: { createdAt: 'asc' } },
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
    if (!['BUYER', 'SHOP_OWNER'].includes(session.role)) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول كمشترٍ لإنشاء الطلبات' }, { status: 403 })
    }
    if (!normalizeEgyptianMobile(session.phone)) {
      return NextResponse.json({ error: 'أضف رقم موبايل مصري صالح في ملفك الشخصي قبل إنشاء الطلب' }, { status: 400 })
    }
    const limit = await rateLimit(`orders:${session.id}:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'طلبات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    if (Array.isArray(body.items)) {
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role)) {
        return NextResponse.json({ error: 'يجب تسجيل الدخول لإنشاء الطلبات' }, { status: 403 })
      }
      const result = await createCartOrders(session, body)
      if (!result.duplicate) {
        await Promise.allSettled(result.sellerSummaries.map((summary) => createNotification({
          userId: summary.ownerId,
          title: 'طلب جديد',
          message: `طلب جديد من ${session.name} يضم ${summary.itemCount} منتج بإجمالي كمية ${summary.totalQuantity} وقيمة ${summary.totalPrice.toLocaleString('ar-EG')} ج.م.`,
          type: 'NEW_ORDER',
          link: 'shop-dashboard',
          dedupeKey: `order-created/${summary.orderId}/${summary.ownerId}`,
        })))
        await Promise.allSettled(result.stockSummaries.filter((summary) => summary.remainingStock <= 3).map((summary) => createNotification({ userId: summary.ownerId, title: 'تنبيه مخزون منخفض', message: `بقي ${summary.remainingStock} فقط من "${summary.partName}".`, type: 'LOW_STOCK', link: 'shop-dashboard', dedupeKey: `low-stock/${summary.partId}/${summary.remainingStock}` })))
      }
      return NextResponse.json({ orders: result.orders, duplicate: result.duplicate })
    }
    const { partId, quantity, deliveryAddress, notes } = body
    const quote = deliveryQuote(body.governorate)
    const clientOrderId = typeof body.clientOrderId === 'string' && body.clientOrderId.length <= 100 ? body.clientOrderId : null
    const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : null

    if (!partId || typeof deliveryAddress !== 'string' || !deliveryAddress.trim() || !quote) {
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
        const existing = await tx.order.findUnique({ where: { clientOrderId }, include: { items: true } })
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
          totalPrice: Math.max(0, subtotal - discount) + quote.fee,
          governorate: quote.ar,
          shippingFee: quote.fee,
          estimatedDeliveryAt: quote.estimatedAt,
          deliveryAddress: deliveryAddress.trim(),
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          // Card data is intentionally not accepted. The beta uses cash on delivery.
          paymentMethod: 'cod',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          couponCode: appliesCoupon?.code ?? null,
          discount,
          clientOrderId,
          items: {
            create: {
              partId: part.id,
              productName: part.name,
              productImage: part.image,
              unitPrice: part.price,
              quantity: qty,
              discount,
              itemTotal: Math.max(0, subtotal - discount),
            },
          },
          timeline: {
            create: { status: 'PENDING', note: 'تم إنشاء الطلب والدفع عند الاستلام' },
          },
        },
        include: { items: true },
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
        dedupeKey: `order-created/${order.id}/${part.store.ownerId}`,
      })
      if (part.stock - qty <= 3) await createNotification({ userId: part.store.ownerId, title: 'تنبيه مخزون منخفض', message: `بقي ${part.stock - qty} فقط من "${part.name}".`, type: 'LOW_STOCK', link: 'shop-dashboard', dedupeKey: `low-stock/${part.id}/${part.stock - qty}` })

    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ order })
  } catch (e: any) {
    if (e.message === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: 'الكمية المطلوبة غير متوفرة' }, { status: 400 })
    }
    if (e.message === 'INVALID_CHECKOUT') return NextResponse.json({ error: 'بيانات السلة أو عنوان التوصيل غير صالحة' }, { status: 400 })
    if (e.message === 'PART_UNAVAILABLE') return NextResponse.json({ error: 'إحدى القطع لم تعد متوفرة' }, { status: 409 })
    if (e.message === 'OWN_STORE') return NextResponse.json({ error: 'لا يمكنك طلب قطعة من متجرك' }, { status: 400 })
    if (e.message === 'CHECKOUT_CONFLICT') return NextResponse.json({ error: 'تعارض في محاولة الطلب. حدّث السلة وحاول مجدداً.' }, { status: 409 })
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
    const limit = await rateLimit(`order-action:${session.id}:${requestAddress(req)}`, 60, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const { id, action } = body
    if (typeof id !== 'string' || !isOrderAction(action)) {
      return NextResponse.json({ error: 'بيانات الإجراء غير صالحة' }, { status: 400 })
    }

    // action: approve | reject | pay | deliver | return | cancel
    const order = await db.order.findUnique({
      where: { id },
      include: { part: true, store: true, items: { orderBy: { createdAt: 'asc' } } },
    })
    if (!order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (action === 'approve' || action === 'reject' || action === 'ship') {
      if (session.role !== 'SHOP_OWNER' || order.store.ownerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
    } else if (action === 'pay' || action === 'deliver' || action === 'return') {
      if (!['BUYER', 'SHOP_OWNER'].includes(session.role) || order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
    } else if (action === 'cancel') {
      if (order.buyerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
    }

    const transition = resolveOrderTransition({ action, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod })
    const newStatus = transition.status
    const newPaymentStatus = transition.paymentStatus

    // Timeline notes for each action
    const timelineNotes: Record<string, string> = {
      approve: 'وافق المحل على الطلب',
      reject: 'رفض المحل الطلب',
      pay: 'تم استلام الدفعة',
      ship: 'خرج الطلب للتوصيل',
      deliver: 'أكد العميل استلام الطلب وتحصيل الدفع',
      return: 'تم استرجاع القطعة',
      cancel: 'ألغى العميل الطلب وتمت إعادة الكمية للمخزون',
    }

    const updated = await db.$transaction(async (tx) => {
      // Claim the current state atomically. This prevents double approval/rejection
      // and prevents restoring stock twice when two requests arrive together.
      const claimed = await tx.order.updateMany({
        where: { id, status: order.status, paymentStatus: order.paymentStatus },
        data: { status: newStatus, paymentStatus: newPaymentStatus, ...(action === 'ship' ? { trackingNumber: typeof body.trackingNumber === 'string' ? body.trackingNumber.trim().slice(0, 100) || null : null } : {}) },
      })
      if (claimed.count !== 1) throw new Error('ORDER_CHANGED')
      await tx.orderTimeline.create({ data: { orderId: id, status: newStatus, note: timelineNotes[action] || newStatus } })
      if (transition.restoreStock) {
        if (order.items.length) {
          for (const item of order.items) {
            if (item.partId) await tx.part.updateMany({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } })
          }
        } else {
          await tx.part.update({ where: { id: order.partId }, data: { stock: { increment: order.quantity } } })
        }
        if (order.couponCode) {
          await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
        }
      }
      return tx.order.findUnique({ where: { id }, include: { part: true, store: true, items: { orderBy: { createdAt: 'asc' } }, timeline: { orderBy: { createdAt: 'asc' } } } })
    })

    const itemNames = order.items.length ? order.items.map((item) => item.productName) : [order.part.name]
    const orderLabel = itemNames.length > 1 ? `${itemNames[0]} و${itemNames.length - 1} منتج آخر` : itemNames[0]

    // Persist notifications directly so they work on serverless hosting.
    const notify = async (userId: string, title: string, message: string, type: string, link?: string) => {
      try {
        await createNotification({ userId, title, message, type, link, dedupeKey: `order-status/${order.id}/${newStatus}/${userId}` })
      } catch (e) {
        console.error('Notify error:', e)
      }
    }

    if (action === 'approve') {
      await notify(order.buyerId, 'تمت الموافقة على طلبك', `وافق ${order.store.name} على طلب "${orderLabel}" ويجري الآن تجهيزه للدفع عند الاستلام.`, 'ORDER_STATUS', 'orders')
    } else if (action === 'reject') {
      await notify(order.buyerId, 'تم رفض طلبك', `اعتذر ${order.store.name} عن تنفيذ طلب "${orderLabel}".`, 'ORDER_STATUS', 'orders')
    } else if (action === 'pay') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'تم استلام دفعة', `دفع العميل ${order.totalPrice} ج.م لطلب "${orderLabel}".`, 'PAYMENT', 'shop-dashboard')
      }
    } else if (action === 'deliver') {
      await notify(
        order.store.ownerId,
        'تم تأكيد استلام الطلب',
        `أكد العميل استلام الطلب وتحصيل الدفع: ${orderLabel}، الكمية ${order.quantity}، الإجمالي ${order.totalPrice} ج.م، رقم الطلب ${order.id}.`,
        'ORDER_STATUS',
        'shop-dashboard',
      )
    } else if (action === 'ship') {
      await notify(order.buyerId, 'طلبك خرج للتوصيل', `خرج طلب "${orderLabel}" للتوصيل${typeof body.trackingNumber === 'string' && body.trackingNumber.trim() ? `، رقم التتبع: ${body.trackingNumber.trim()}` : ''}.`, 'ORDER_STATUS', 'orders')
    } else if (action === 'return') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'طلب استرجاع', `طلب العميل استرجاع "${orderLabel}".`, 'ORDER_STATUS', 'shop-dashboard')
      }
    } else if (action === 'cancel') {
      await notify(order.store.ownerId, 'تم إلغاء طلب', `ألغى العميل طلب "${orderLabel}" قبل التنفيذ.`, 'ORDER_STATUS', 'shop-dashboard')
    }

    return NextResponse.json({ order: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (e.message === 'ORDER_CHANGED') return NextResponse.json({ error: 'تم تحديث الطلب من مستخدم آخر. أعد تحميل الصفحة.' }, { status: 409 })
    if (e instanceof InvalidOrderTransition) return NextResponse.json({ error: e.userMessage }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
