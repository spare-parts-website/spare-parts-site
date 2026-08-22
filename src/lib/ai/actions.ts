import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { resolveOrderTransition, type OrderAction } from '@/lib/order-state'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '@/lib/vehicle-compatibility'
import { AI_PROPOSAL_TTL_MS } from '@/lib/ai/runtime'
import { roleCanPrepareAction } from '@/lib/ai/policy'
import type { AIClientAction, AIProposalInput } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function finite(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeInput(input: AIProposalInput): AIProposalInput {
  return {
    action: input.action,
    targetId: cleanText(input.targetId, 100) || undefined,
    name: cleanText(input.name, 160) || undefined,
    quantity: finite(input.quantity),
    price: finite(input.price),
    stock: finite(input.stock),
    description: cleanText(input.description, 2000) || undefined,
    category: cleanText(input.category, 120) || undefined,
    condition: cleanText(input.condition, 120) || undefined,
    partNumber: cleanText(input.partNumber, 100) || undefined,
    oemNumber: cleanText(input.oemNumber, 100) || undefined,
    searchAliases: cleanText(input.searchAliases, 500) || undefined,
    carModels: cleanText(input.carModels, 1000) || undefined,
    code: cleanText(input.code, 40).toUpperCase() || undefined,
    discountPercent: finite(input.discountPercent),
    maxUses: finite(input.maxUses),
    expiresAt: cleanText(input.expiresAt, 50) || undefined,
    status: cleanText(input.status, 50) || undefined,
    role: input.role,
    trackingNumber: cleanText(input.trackingNumber, 100) || undefined,
    brand: cleanText(input.brand, 80) || undefined,
    model: cleanText(input.model, 80) || undefined,
    year: finite(input.year),
    engine: cleanText(input.engine, 80) || undefined,
    nickname: cleanText(input.nickname, 80) || undefined,
    isPrimary: input.isPrimary === true,
  }
}

export async function prepareActionProposal(input: {
  conversationId: string
  user: SessionUser
  proposal: AIProposalInput
}) {
  const proposal = normalizeInput(input.proposal)
  if (!roleCanPrepareAction(input.user.role, proposal.action)) throw new Error('ACTION_FORBIDDEN')
  const summary = await validateAndDescribe(input.user, proposal)
  const expiresAt = new Date(Date.now() + AI_PROPOSAL_TTL_MS)
  const created = await db.aIActionProposal.create({
    data: {
      conversationId: input.conversationId,
      userId: input.user.id,
      role: input.user.role,
      action: proposal.action,
      payload: JSON.stringify(proposal),
      summary,
      idempotencyKey: randomUUID(),
      expiresAt,
    },
  })
  await audit({ actorId: input.user.id, action: 'AI_PROPOSAL_CREATED', targetType: proposal.action, targetId: proposal.targetId, metadata: { proposalId: created.id } })
  return {
    type: 'proposal' as const,
    title: 'إجراء يحتاج موافقتك',
    description: 'راجع التفاصيل جيداً. لن يتم أي تغيير قبل الضغط على تأكيد.',
    proposal: { id: created.id, action: proposal.action, summary, expiresAt: expiresAt.toISOString(), targetId: proposal.targetId },
  }
}

async function validateAndDescribe(user: SessionUser, input: AIProposalInput) {
  switch (input.action) {
    case 'cart_add': {
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false, stock: { gt: 0 } }, select: { name: true, stock: true } })
      const quantity = Math.floor(input.quantity || 1)
      if (!part || quantity < 1 || quantity > part.stock) throw new Error('INVALID_ACTION_INPUT')
      return `إضافة ${quantity} × ${part.name} إلى السلة`
    }
    case 'wishlist_store_add':
    case 'wishlist_store_remove': {
      const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true } })
      if (!store) throw new Error('INVALID_ACTION_INPUT')
      return `${input.action.endsWith('add') ? 'إضافة' : 'إزالة'} متجر ${store.name} ${input.action.endsWith('add') ? 'إلى' : 'من'} المفضلة`
    }
    case 'car_create': {
      if (!input.brand || !input.model || (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1950 || input.year > new Date().getFullYear() + 1))) throw new Error('INVALID_ACTION_INPUT')
      return `حفظ سيارة ${input.brand} ${input.model}${input.year ? ` ${input.year}` : ''}`
    }
    case 'order_action': {
      const order = await db.order.findUnique({ where: { id: input.targetId }, include: { part: { select: { name: true } }, store: { select: { ownerId: true } } } })
      if (!order || !input.status) throw new Error('INVALID_ACTION_INPUT')
      const buyerAllowed = ['cancel', 'deliver', 'return'].includes(input.status) && order.buyerId === user.id
      const sellerAllowed = ['approve', 'reject', 'ship'].includes(input.status) && order.store.ownerId === user.id
      if (!buyerAllowed && !sellerAllowed) throw new Error('ACTION_FORBIDDEN')
      resolveOrderTransition({ action: input.status as OrderAction, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod })
      return `تحديث طلب ${order.part.name}: ${input.status}`
    }
    case 'seller_part_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      const validPrice = input.price !== undefined && input.price >= 0 && input.price <= 100000000
      const validStock = input.stock !== undefined && Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000
      if (!store || !input.name || input.name.length < 2 || !input.condition || !validPrice || !validStock) throw new Error('INVALID_ACTION_INPUT')
      return `نشر قطعة ${input.name} بسعر ${input.price} ج.م ومخزون ${input.stock} دون صور. راجع بيانات التوافق وأضف الصور من لوحة المتجر عند الحاجة.`
    }
    case 'seller_part_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      const part = store ? await db.part.findFirst({ where: { id: input.targetId, storeId: store.id }, select: { name: true } }) : null
      const validPrice = input.price === undefined || (input.price >= 0 && input.price <= 100000000)
      const validStock = input.stock === undefined || (Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000)
      if (!part || (!validPrice || !validStock) || (input.price === undefined && input.stock === undefined && !input.description)) throw new Error('INVALID_ACTION_INPUT')
      return `تحديث ${part.name}${input.price !== undefined ? ` — السعر ${input.price} ج.م` : ''}${input.stock !== undefined ? ` — المخزون ${input.stock}` : ''}`
    }
    case 'seller_coupon_create': {
      if (!input.code || !/^[A-Z0-9_-]{3,40}$/.test(input.code) || !input.discountPercent || input.discountPercent <= 0 || input.discountPercent > 100 || !Number.isInteger(input.maxUses) || (input.maxUses || 0) < 1 || (input.maxUses || 0) > 100000) throw new Error('INVALID_ACTION_INPUT')
      if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt) <= new Date())) throw new Error('INVALID_ACTION_INPUT')
      if (await db.coupon.findUnique({ where: { code: input.code }, select: { id: true } })) throw new Error('COUPON_EXISTS')
      return `إنشاء كوبون ${input.code} بخصم ${input.discountPercent}% وحد استخدام ${input.maxUses}`
    }
    case 'admin_part_block': {
      const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true, blocked: true } })
      if (!part || !['BLOCKED', 'ACTIVE'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (part.blocked === (input.status === 'BLOCKED')) throw new Error('ACTION_STALE')
      return `${input.status === 'BLOCKED' ? 'حظر' : 'إلغاء حظر'} القطعة ${part.name}`
    }
    case 'admin_user_role': {
      const target = await db.user.findUnique({ where: { id: input.targetId }, select: { name: true, role: true } })
      if (!target || !input.role || input.targetId === user.id) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === input.role) throw new Error('ACTION_STALE')
      return `تغيير دور ${target.name} إلى ${input.role}`
    }
    case 'admin_store_verify': {
      const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true, verified: true } })
      if (!store || !['VERIFIED', 'UNVERIFIED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (store.verified === (input.status === 'VERIFIED')) throw new Error('ACTION_STALE')
      return `${input.status === 'VERIFIED' ? 'اعتماد' : 'إلغاء اعتماد'} متجر ${store.name}`
    }
    case 'admin_report_decision': {
      const report = await db.report.findUnique({ where: { id: input.targetId }, select: { id: true, status: true } })
      if (!report || !['REVIEWED', 'DISMISSED', 'BLOCKED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (report.status !== 'OPEN') throw new Error('ACTION_STALE')
      return `تحديث البلاغ إلى ${input.status}`
    }
    case 'admin_verification_decision': {
      const verification = await db.sellerVerification.findUnique({ where: { id: input.targetId }, include: { store: { select: { name: true } } } })
      if (!verification || !['APPROVED', 'REJECTED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (verification.status !== 'PENDING') throw new Error('ACTION_STALE')
      return `${input.status === 'APPROVED' ? 'اعتماد' : 'رفض'} طلب توثيق ${verification.store.name}`
    }
    case 'admin_dispute_decision': {
      const dispute = await db.dispute.findUnique({ where: { id: input.targetId }, include: { order: { include: { part: { select: { name: true } } } } } })
      if (!dispute || !['RESOLVED_BUYER', 'RESOLVED_SELLER', 'REJECTED'].includes(input.status || '') || !input.description || input.description.length < 3) throw new Error('INVALID_ACTION_INPUT')
      if (dispute.status !== 'OPEN') throw new Error('ACTION_STALE')
      return `حسم نزاع ${dispute.order.part.name}: ${input.status}`
    }
  }
}

export async function decideActionProposal(input: { proposalId: string; user: SessionUser; approved: boolean }) {
  const proposal = await db.aIActionProposal.findFirst({ where: { id: input.proposalId, userId: input.user.id } })
  if (!proposal) throw new Error('PROPOSAL_NOT_FOUND')
  if (proposal.status !== 'PENDING') throw new Error('PROPOSAL_ALREADY_DECIDED')
  if (proposal.expiresAt <= new Date()) throw new Error('PROPOSAL_EXPIRED')
  if (proposal.role !== input.user.role) throw new Error('ACTION_FORBIDDEN')

  if (!input.approved) {
    const rejected = await db.aIActionProposal.updateMany({ where: { id: proposal.id, userId: input.user.id, status: 'PENDING' }, data: { status: 'REJECTED' } })
    if (rejected.count !== 1) throw new Error('PROPOSAL_ALREADY_DECIDED')
    await audit({ actorId: input.user.id, action: 'AI_ACTION_REJECTED', targetType: proposal.action, metadata: { proposalId: proposal.id } })
    return { ok: true, status: 'REJECTED' as const }
  }

  const claimed = await db.aIActionProposal.updateMany({
    where: { id: proposal.id, userId: input.user.id, role: input.user.role, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'PROCESSING' },
  })
  if (claimed.count !== 1) throw new Error('PROPOSAL_ALREADY_DECIDED')

  try {
    const payload = JSON.parse(proposal.payload) as AIProposalInput
    if (!roleCanPrepareAction(input.user.role, payload.action)) throw new Error('ACTION_FORBIDDEN')
    await validateAndDescribe(input.user, payload)
    const result = await executeAction(input.user, payload)
    await db.aIActionProposal.update({ where: { id: proposal.id }, data: { status: 'EXECUTED', executedAt: new Date() } })
    await audit({ actorId: input.user.id, action: 'AI_ACTION_EXECUTED', targetType: payload.action, targetId: payload.targetId, metadata: { proposalId: proposal.id } })
    return { ok: true, status: 'EXECUTED' as const, ...result }
  } catch (error) {
    await db.aIActionProposal.updateMany({ where: { id: proposal.id, status: 'PROCESSING' }, data: { status: 'FAILED', executedAt: new Date() } })
    await audit({ actorId: input.user.id, action: 'AI_ACTION_FAILED', targetType: proposal.action, metadata: { proposalId: proposal.id } }).catch(() => undefined)
    throw error
  }
}

async function executeAction(user: SessionUser, input: AIProposalInput): Promise<{ clientAction?: AIClientAction }> {
  switch (input.action) {
    case 'cart_add': {
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false, stock: { gt: 0 } }, include: { store: { select: { id: true, name: true } } } })
      if (!part) throw new Error('INVALID_ACTION_INPUT')
      return { clientAction: { type: 'cart_add', cartItem: { partId: part.id, name: part.name, price: part.price, image: part.image, storeId: part.store.id, storeName: part.store.name, quantity: Math.floor(input.quantity || 1), stock: part.stock } } }
    }
    case 'wishlist_store_add':
      await db.storeWishlist.upsert({ where: { userId_storeId: { userId: user.id, storeId: input.targetId! } }, update: {}, create: { userId: user.id, storeId: input.targetId! } })
      return {}
    case 'wishlist_store_remove':
      await db.storeWishlist.deleteMany({ where: { userId: user.id, storeId: input.targetId! } })
      return {}
    case 'car_create':
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`select pg_advisory_xact_lock(hashtext(${`ai-car:${user.id}`}))`
        if (await tx.userCar.count({ where: { userId: user.id } }) >= 5) throw new Error('CAR_LIMIT')
        if (input.isPrimary) await tx.userCar.updateMany({ where: { userId: user.id }, data: { isPrimary: false } })
        await tx.userCar.create({ data: { userId: user.id, brand: input.brand!, model: input.model!, year: input.year ? Math.floor(input.year) : null, engine: input.engine || null, nickname: input.nickname || null, isPrimary: input.isPrimary === true } })
      })
      return {}
    case 'seller_part_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      const updated = await db.part.updateMany({ where: { id: input.targetId, storeId: store.id }, data: { ...(input.price !== undefined ? { price: input.price } : {}), ...(input.stock !== undefined ? { stock: Math.floor(input.stock) } : {}), ...(input.description ? { description: input.description } : {}) } })
      if (updated.count !== 1) throw new Error('ACTION_FORBIDDEN')
      return {}
    }
    case 'seller_part_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      const compatibilities = parseVehicleCompatibility(input.carModels)
      await db.part.create({ data: { storeId: store.id, name: input.name!, description: input.description || null, price: input.price!, stock: Math.floor(input.stock!), category: input.category || null, brand: input.brand || null, condition: input.condition!, partNumber: input.partNumber || null, oemNumber: input.oemNumber || null, searchAliases: input.searchAliases || null, carModels: serializeLegacyCompatibility(input.carModels), compatibilities: compatibilities.length ? { create: compatibilities } : undefined } })
      return {}
    }
    case 'seller_coupon_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      await db.coupon.create({ data: { storeId: store.id, code: input.code!, discountPercent: input.discountPercent!, maxUses: input.maxUses!, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } })
      return {}
    }
    case 'order_action':
      await executeOrderAction(user, input.targetId!, input.status as OrderAction, input.trackingNumber)
      return {}
    case 'admin_part_block': {
      const targetState = input.status === 'BLOCKED'
      const updated = await db.part.updateMany({ where: { id: input.targetId!, blocked: !targetState }, data: { blocked: targetState } })
      if (updated.count !== 1) throw new Error('ACTION_STALE')
      return {}
    }
    case 'admin_user_role': {
      if (input.targetId === user.id) throw new Error('ACTION_FORBIDDEN')
      const target = await db.user.findUnique({ where: { id: input.targetId! }, include: { store: { select: { id: true } } } })
      if (!target) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === 'ADMIN' && input.role !== 'ADMIN' && await db.user.count({ where: { role: 'ADMIN' } }) <= 1) throw new Error('LAST_ADMIN')
      if (target.role === 'SHOP_OWNER' && input.role !== 'SHOP_OWNER' && target.store) throw new Error('STORE_ROLE_CONFLICT')
      await db.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({ where: { id: target.id, role: target.role }, data: { role: input.role } })
        if (updated.count !== 1) throw new Error('ACTION_STALE')
        if (input.role === 'SHOP_OWNER' && !target.store) await tx.store.create({ data: { name: `متجر ${target.name}`, description: '', ownerId: target.id } })
      })
      return {}
    }
    case 'admin_store_verify': {
      const targetState = input.status === 'VERIFIED'
      const updated = await db.store.updateMany({ where: { id: input.targetId!, verified: !targetState }, data: { verified: targetState, verificationStatus: targetState ? 'APPROVED' : 'UNVERIFIED', verifiedAt: targetState ? new Date() : null } })
      if (updated.count !== 1) throw new Error('ACTION_STALE')
      return {}
    }
    case 'admin_report_decision': {
      const report = await db.report.findUnique({ where: { id: input.targetId! } })
      if (!report) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        const claimed = await tx.report.updateMany({ where: { id: report.id, status: 'OPEN' }, data: { status: input.status!, reviewedById: user.id } })
        if (claimed.count !== 1) throw new Error('ACTION_STALE')
        if (input.status === 'BLOCKED' && report.targetType === 'part') await tx.part.updateMany({ where: { id: report.targetId }, data: { blocked: true } })
      })
      return {}
    }
    case 'admin_verification_decision': {
      const verification = await db.sellerVerification.findUnique({ where: { id: input.targetId! }, include: { store: true } })
      if (!verification) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        const claimed = await tx.sellerVerification.updateMany({ where: { id: verification.id, status: 'PENDING' }, data: { status: input.status!, adminNote: input.description || null, reviewedAt: new Date() } })
        if (claimed.count !== 1) throw new Error('ACTION_STALE')
        await tx.store.update({ where: { id: verification.storeId }, data: { verificationStatus: input.status!, verified: input.status === 'APPROVED', verifiedAt: input.status === 'APPROVED' ? new Date() : null } })
      })
      return {}
    }
    case 'admin_dispute_decision': {
      const dispute = await db.dispute.findUnique({ where: { id: input.targetId! }, include: { order: { include: { store: true, part: true } } } })
      if (!dispute) throw new Error('INVALID_ACTION_INPUT')
      const claimed = await db.dispute.updateMany({ where: { id: dispute.id, status: 'OPEN' }, data: { status: input.status!, resolution: input.description!, reviewedById: user.id } })
      if (claimed.count !== 1) throw new Error('ACTION_STALE')
      await Promise.allSettled([
        createNotification({ userId: dispute.buyerId, title: 'تم تحديث النزاع', message: input.description!, type: 'DISPUTE', link: 'orders' }),
        createNotification({ userId: dispute.order.store.ownerId, title: 'تم تحديث النزاع', message: input.description!, type: 'DISPUTE', link: 'shop-dashboard' }),
      ])
      return {}
    }
  }
}

async function executeOrderAction(user: SessionUser, orderId: string, action: OrderAction, trackingNumber?: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { part: true, store: true } })
  if (!order) throw new Error('INVALID_ACTION_INPUT')
  const buyerAllowed = ['cancel', 'deliver', 'return'].includes(action) && order.buyerId === user.id
  const sellerAllowed = ['approve', 'reject', 'ship'].includes(action) && order.store.ownerId === user.id
  if (!buyerAllowed && !sellerAllowed) throw new Error('ACTION_FORBIDDEN')
  const transition = resolveOrderTransition({ action, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod })
  await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({ where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus }, data: { status: transition.status, paymentStatus: transition.paymentStatus, ...(action === 'ship' ? { trackingNumber: trackingNumber || null } : {}) } })
    if (claimed.count !== 1) throw new Error('ORDER_CHANGED')
    await tx.orderTimeline.create({ data: { orderId: order.id, status: transition.status, note: 'تم تنفيذ الإجراء بعد تأكيد اقتراح مساعد غيار ماركت' } })
    if (transition.restoreStock) await tx.part.update({ where: { id: order.partId }, data: { stock: { increment: order.quantity } } })
  })
  const recipient = order.buyerId === user.id ? order.store.ownerId : order.buyerId
  await createNotification({ userId: recipient, title: 'تم تحديث الطلب', message: `تم تحديث طلب ${order.part.name} إلى ${transition.status}.`, type: 'ORDER_STATUS', link: order.buyerId === recipient ? 'orders' : 'shop-dashboard' }).catch((error) => console.error('AI order notification failed:', error))
}
