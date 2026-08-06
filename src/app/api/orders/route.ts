import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { sendEmail, emailTemplates } from '@/lib/email'
import { createNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') || 'buyer' // buyer | shop | admin

    let where: any = {}

    if (scope === 'buyer') {
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
    const body = await req.json()
    const { partId, quantity, deliveryAddress, notes } = body

    if (!partId || typeof deliveryAddress !== 'string' || !deliveryAddress.trim()) {
      return NextResponse.json({ error: 'قطعة الغيار وعنوان التوصيل مطلوبان' }, { status: 400 })
    }
    if (deliveryAddress.trim().length > 500) {
      return NextResponse.json({ error: 'عنوان التوصيل طويل جداً' }, { status: 400 })
    }
    if (typeof notes === 'string' && notes.trim().length > 1000) {
      return NextResponse.json({ error: 'الملاحظات طويلة جداً' }, { status: 400 })
    }

    if (!['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لإنشاء الطلبات' }, { status: 403 })
    }

    const part = await db.part.findUnique({
      where: { id: partId },
      include: { store: true },
    })
    if (!part || part.blocked) {
      return NextResponse.json({ error: 'قطعة الغيار غير متوفرة' }, { status: 404 })
    }

    const qty = Math.max(1, Math.floor(Number(quantity) || 1))
    if (qty > 100) {
      return NextResponse.json({ error: 'الحد الأقصى للكمية في الطلب هو 100' }, { status: 400 })
    }
    const order = await db.$transaction(async (tx) => {
      // Reserve stock at checkout so concurrent buyers cannot oversell it.
      const reserved = await tx.part.updateMany({
        where: { id: part.id, blocked: false, stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      })
      if (reserved.count !== 1) throw new Error('OUT_OF_STOCK')

      return tx.order.create({
        data: {
          partId: part.id,
          storeId: part.store.id,
          buyerId: session.id,
          quantity: qty,
          totalPrice: part.price * qty,
          deliveryAddress: deliveryAddress.trim(),
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          // Card data is intentionally not accepted. The beta uses cash on delivery.
          paymentMethod: 'cod',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          timeline: {
            create: { status: 'PENDING', note: 'تم إنشاء الطلب والدفع عند الاستلام' },
          },
        },
      })
    })

    // Persist the notification directly so it works on serverless hosting.
    try {
      await createNotification({
        userId: part.store.ownerId,
        title: 'طلب جديد',
        message: `طلب جديد من ${session.name} على "${part.name}" بكمية ${qty}.`,
        type: 'NEW_ORDER',
        link: 'shop-dashboard',
      })

      // Send email to shop owner
      const owner = await db.user.findUnique({ where: { id: part.store.ownerId }, select: { email: true, name: true } })
      if (owner) {
        await sendEmail({
          to: owner.email,
          ...emailTemplates.newOrder(owner.name, session.name, part.name, qty, part.price * qty, order.id),
        })
      }
    } catch (e) {
      console.error('Notify error:', e)
    }

    return NextResponse.json({ order })
  } catch (e: any) {
    if (e.message === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: 'الكمية المطلوبة غير متوفرة' }, { status: 400 })
    }
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
    const body = await req.json()
    const { id, action } = body

    // action: approve | reject | pay | deliver | return
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
      if (session.role !== 'SHOP_OWNER' || order.store.ownerId !== session.id) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      const canDeliver = order.status === 'PAID' || (order.status === 'APPROVED' && order.paymentMethod === 'cod')
      if (!canDeliver) {
        return NextResponse.json({ error: 'لا يمكن تأكيد التوصيل قبل الموافقة على الطلب' }, { status: 400 })
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
    } else {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
    }

    // Timeline notes for each action
    const timelineNotes: Record<string, string> = {
      approve: 'وافق المحل على الطلب',
      reject: 'رفض المحل الطلب',
      pay: 'تم استلام الدفعة',
      deliver: 'تم تأكيد التوصيل',
      return: 'تم استرجاع القطعة',
    }

    const updated = await db.order.update({
      where: { id },
      data: {
        status: newStatus,
        paymentStatus: newPaymentStatus,
        timeline: {
          create: { status: newStatus, note: timelineNotes[action] || newStatus },
        },
      },
    })

    // Stock was reserved when the order was created. Release it if the order is rejected.
    if (action === 'reject') {
      await db.part.update({
        where: { id: order.partId },
        data: { stock: { increment: order.quantity } },
      })
    }
    // If returned, restore stock
    if (action === 'return') {
      await db.part.update({
        where: { id: order.partId },
        data: { stock: { increment: order.quantity } },
      })
    }

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
      // Email buyer
      const buyer = await db.user.findUnique({ where: { id: order.buyerId }, select: { email: true, name: true } })
      if (buyer) await sendEmail({ to: buyer.email, ...emailTemplates.orderApproved(buyer.name, order.part.name, order.store.name, order.id) })
    } else if (action === 'reject') {
      await notify(order.buyerId, 'تم رفض طلبك', `اعتذر ${order.store.name} عن تنفيذ طلب "${order.part.name}".`, 'ORDER_STATUS', 'orders')
    } else if (action === 'pay') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'تم استلام دفعة', `دفع العميل ${order.totalPrice} ج.م لطلب "${order.part.name}".`, 'PAYMENT', 'shop-dashboard')
        // Email store owner
        const owner = await db.user.findUnique({ where: { id: storeOwner.ownerId }, select: { email: true, name: true } })
        const buyer = await db.user.findUnique({ where: { id: order.buyerId }, select: { name: true } })
        if (owner && buyer) await sendEmail({ to: owner.email, ...emailTemplates.paymentReceived(owner.name, buyer.name, order.part.name, order.totalPrice, order.id) })
      }
    } else if (action === 'deliver') {
      await notify(order.buyerId, 'تم توصيل طلبك', `تم توصيل "${order.part.name}". يمكنك تقييم المنتج أو طلب الاسترجاع.`, 'ORDER_STATUS', 'orders')
      // Email buyer
      const buyer = await db.user.findUnique({ where: { id: order.buyerId }, select: { email: true, name: true } })
      if (buyer) await sendEmail({ to: buyer.email, ...emailTemplates.orderDelivered(buyer.name, order.part.name, order.id) })
    } else if (action === 'return') {
      const storeOwner = await db.store.findUnique({ where: { id: order.storeId }, select: { ownerId: true } })
      if (storeOwner) {
        await notify(storeOwner.ownerId, 'طلب استرجاع', `طلب العميل استرجاع "${order.part.name}".`, 'ORDER_STATUS', 'shop-dashboard')
      }
    }

    return NextResponse.json({ order: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
