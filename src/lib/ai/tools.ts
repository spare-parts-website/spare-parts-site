import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { prepareActionProposal } from '@/lib/ai/actions'
import { maskEmail, maskPhone } from '@/lib/ai/policy'
import { AI_ACTIONS, type AIClientContext, type AIRole, type AIToolCard } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

const navigationDestinations = z.enum([
  'home', 'parts', 'stores', 'cart', 'orders', 'wishlist', 'cars', 'profile',
  'seller_parts', 'seller_orders', 'seller_analytics', 'seller_coupons', 'seller_messages',
  'admin_users', 'admin_parts', 'admin_orders', 'admin_stores', 'admin_reports',
])
type NavigationDestination = z.infer<typeof navigationDestinations>

const actionSchema = z.object({
  action: z.enum(AI_ACTIONS),
  targetId: z.string().max(100).optional(),
  name: z.string().max(160).optional(),
  quantity: z.number().optional(),
  price: z.number().optional(),
  stock: z.number().optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(120).optional(),
  condition: z.string().max(120).optional(),
  partNumber: z.string().max(100).optional(),
  oemNumber: z.string().max(100).optional(),
  searchAliases: z.string().max(500).optional(),
  carModels: z.string().max(1000).optional(),
  code: z.string().max(40).optional(),
  discountPercent: z.number().optional(),
  maxUses: z.number().optional(),
  expiresAt: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  role: z.enum(['BUYER', 'SHOP_OWNER', 'ADMIN']).optional(),
  trackingNumber: z.string().max(100).optional(),
  brand: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  year: z.number().optional(),
  engine: z.string().max(80).optional(),
  nickname: z.string().max(80).optional(),
  isPrimary: z.boolean().optional(),
})

export function createAITools(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext }) {
  const commonTools = {
    searchMarketplace: tool({
      description: 'ابحث في قطع الغيار والمتاجر العامة. استخدمها قبل اقتراح منتجات أو متاجر.',
      inputSchema: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(10).default(6) }),
      execute: async ({ query, limit }): Promise<AIToolCard> => {
        const [parts, stores] = await Promise.all([
          db.part.findMany({
            where: { blocked: false, OR: [{ name: { contains: query } }, { description: { contains: query } }, { brand: { contains: query } }, { partNumber: { contains: query } }, { oemNumber: { contains: query } }, { searchAliases: { contains: query } }, { compatibilities: { some: { OR: [{ make: { contains: query } }, { model: { contains: query } }] } } }] },
            select: { id: true, name: true, price: true, stock: true, brand: true, store: { select: { name: true } } },
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          db.store.findMany({ where: { OR: [{ name: { contains: query } }, { description: { contains: query } }] }, select: { id: true, name: true, verified: true }, take: Math.min(4, limit) }),
        ])
        return {
          type: 'results', title: `نتائج البحث عن «${query}»`,
          description: parts.length || stores.length ? 'نتائج حقيقية من غيار ماركت' : 'لم نجد نتائج مطابقة حالياً.',
          items: [
            ...parts.filter((part) => !isBlockedStoreName(part.store.name)).map((part) => ({ id: part.id, title: part.name, subtitle: `${part.store.name}${part.brand ? ` • ${part.brand}` : ''} • متاح ${part.stock}`, value: `${part.price} ج.م`, href: `/parts/${part.id}` })),
            ...stores.filter((store) => !isBlockedStoreName(store.name)).map((store) => ({ id: store.id, title: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر', href: `/stores/${store.id}` })),
          ],
        }
      },
    }),
    navigate: tool<{ destination: string; query?: string }, AIToolCard, Record<string, never>>({
      description: 'جهّز انتقالاً فورياً داخل الموقع. هذا لا يغيّر أي بيانات.',
      inputSchema: z.object({ destination: z.string().min(1).max(40), query: z.string().max(120).optional() }),
      execute: async ({ destination, query }) => {
        const parsedDestination = navigationDestinations.safeParse(destination)
        if (!parsedDestination.success) throw new Error('NAVIGATION_FORBIDDEN')
        const href = navigationHref(parsedDestination.data, input.role, query)
        return { type: 'navigation', title: 'الصفحة جاهزة', description: 'يمكن فتح الصفحة المطلوبة الآن.', clientAction: { type: 'navigate', href } } satisfies AIToolCard
      },
    }),
    prepareDraft: tool({
      description: 'حضّر مسودة فقط دون حفظها. استخدمها للوصف أو البحث أو الرسائل أو نماذج البائع.',
      inputSchema: z.object({ target: z.enum(['search', 'car', 'message', 'listing', 'coupon', 'moderation_note']), fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }),
      execute: async ({ target, fields }): Promise<AIToolCard> => {
        assertDraftAllowed(target, input.role)
        return { type: 'draft', title: 'تم تجهيز المسودة', description: 'راجعها قبل الحفظ أو الإرسال.', clientAction: { type: 'draft', target, fields } }
      },
    }),
  }

  const buyerTools = input.user && input.user.role !== 'ADMIN' ? {
    getAccountContext: tool({
      description: 'اعرض ملخص حساب المشتري الحالي: السيارات والمفضلة والطلبات الأخيرة فقط.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const [cars, favorites, orders] = await Promise.all([
          db.userCar.findMany({ where: { userId: input.user!.id }, select: { id: true, brand: true, model: true, year: true, engine: true, isPrimary: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }], take: 5 }),
          db.storeWishlist.findMany({ where: { userId: input.user!.id }, include: { store: { select: { id: true, name: true } } }, take: 10 }),
          db.order.findMany({ where: { buyerId: input.user!.id }, include: { part: { select: { name: true } }, store: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
        ])
        return { type: 'insight', title: 'ملخص حسابك', description: `${cars.length} سيارة محفوظة • ${favorites.length} متجر مفضل • ${orders.length} طلبات حديثة • ${input.clientContext.cart.length} عناصر في السلة`, items: [...input.clientContext.cart.map((item) => ({ id: `cart-${item.partId}`, title: item.name, subtitle: `في السلة • الكمية ${item.quantity}`, value: `${item.price * item.quantity} ج.م`, href: '/cart' })), ...cars.map((car) => ({ id: car.id, title: `${car.brand} ${car.model}`, subtitle: `${car.year || ''}${car.engine ? ` • ${car.engine}` : ''}${car.isPrimary ? ' • الأساسية' : ''}`, href: '/account/cars' })), ...orders.map((order) => ({ id: order.id, title: order.part.name, subtitle: `${order.store.name} • ${order.status}`, value: `${order.totalPrice} ج.م`, href: '/account/orders' }))] }
      },
    }),
    findCompatibleParts: tool<{ carId?: string; query?: string }, AIToolCard, Record<string, never>>({
      description: 'ابحث عن قطع متوافقة فعلياً مع سيارة محفوظة تخص المستخدم الحالي.',
      inputSchema: z.object({ carId: z.string().max(100).optional(), query: z.string().max(120).optional() }),
      execute: async ({ carId, query }): Promise<AIToolCard> => {
        const car = carId
          ? await db.userCar.findFirst({ where: { id: carId, userId: input.user!.id } })
          : await db.userCar.findFirst({ where: { userId: input.user!.id }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] })
        if (!car) return { type: 'insight', title: 'احفظ سيارتك أولاً', description: 'أضف بيانات السيارة لنبحث في التوافق المسجل للقطع.', clientAction: { type: 'navigate', href: '/account/cars' } }
        const parts = await db.part.findMany({
          where: {
            blocked: false,
            ...(query ? { OR: [{ name: { contains: query } }, { brand: { contains: query } }, { category: { contains: query } }] } : {}),
            compatibilities: { some: { make: { contains: car.brand }, model: { contains: car.model }, AND: car.year ? [{ OR: [{ yearFrom: null }, { yearFrom: { lte: car.year } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: car.year } }] }] : undefined } },
          },
          select: { id: true, name: true, price: true, stock: true, store: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }, take: 10,
        })
        return { type: 'results', title: `قطع متوافقة مع ${car.brand} ${car.model}`, description: `التوافق مبني على بيانات البائع المسجلة${car.year ? ` لسنة ${car.year}` : ''}. راجع رقم القطعة قبل الشراء.`, items: parts.filter((part) => !isBlockedStoreName(part.store.name)).map((part) => ({ id: part.id, title: part.name, subtitle: `${part.store.name} • مخزون ${part.stock}`, value: `${part.price} ج.م`, href: `/parts/${part.id}` })) }
      },
    }),
  } : {}

  const actionTools = input.user ? {
    prepareAction: tool({
      description: 'حضّر إجراءً حقيقياً للمراجعة. لا ينفّذ شيئاً؛ يعرض تحذيراً وزر تأكيد للمستخدم.',
      inputSchema: actionSchema,
      execute: async (proposal): Promise<AIToolCard> => {
        if (!input.conversationId) throw new Error('CONVERSATION_REQUIRED')
        return prepareActionProposal({ conversationId: input.conversationId, user: input.user!, proposal })
      },
    }),
  } : {}

  const sellerTools = input.user?.role === 'SHOP_OWNER' ? {
    getSellerInsights: tool({
      description: 'اعرض أداء متجر البائع الحالي ومخزونه وطلباته فقط.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true, name: true } })
        if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط بالحساب' }
        const [parts, orders, reviews] = await Promise.all([
          db.part.findMany({ where: { storeId: store.id }, select: { id: true, name: true, price: true, stock: true }, orderBy: { stock: 'asc' }, take: 100 }),
          db.order.findMany({ where: { storeId: store.id }, select: { status: true, paymentStatus: true, totalPrice: true, quantity: true } }),
          db.productReview.findMany({ where: { part: { storeId: store.id }, blocked: false }, select: { rating: true } }),
        ])
        const completed = orders.filter((order) => order.status === 'DELIVERED')
        const revenue = completed.reduce((sum, order) => sum + order.totalPrice, 0)
        const rating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0
        const lowStock = parts.filter((part) => part.stock <= 3)
        return { type: 'insight', title: `أداء ${store.name}`, description: `${parts.length} قطعة • ${orders.length} طلب • ${revenue.toFixed(0)} ج.م مبيعات مكتملة • تقييم ${rating.toFixed(1)}`, items: lowStock.slice(0, 8).map((part) => ({ id: part.id, title: part.name, subtitle: `مخزون منخفض: ${part.stock}`, value: `${part.price} ج.م`, href: '/seller/parts' })) }
      },
    }),
    suggestSellerPrice: tool({
      description: 'اقترح نطاق سعر لقطعة يملكها البائع اعتماداً على عروض غيار ماركت المشابهة وأداء القطعة. الاقتراح غير ملزم.',
      inputSchema: z.object({ partId: z.string().min(1) }),
      execute: async ({ partId }): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true } })
        const part = store ? await db.part.findFirst({ where: { id: partId, storeId: store.id }, select: { id: true, name: true, price: true, category: true, brand: true, stock: true } }) : null
        if (!part) throw new Error('PART_NOT_OWNED')
        const comparisons = await db.part.findMany({ where: { id: { not: part.id }, blocked: false, category: part.category || undefined, ...(part.brand ? { brand: part.brand } : {}) }, select: { price: true }, take: 20 })
        const prices = comparisons.map((item) => item.price).filter((price) => price > 0).sort((a, b) => a - b)
        const median = prices.length ? prices[Math.floor(prices.length / 2)] : part.price
        const low = Math.max(0, Math.round(median * 0.9))
        const high = Math.round(median * 1.1)
        return { type: 'insight', title: `اقتراح سعر: ${part.name}`, description: `النطاق المقترح ${low}–${high} ج.م بناءً على ${prices.length} عرض مشابه. السعر الحالي ${part.price} ج.م والمخزون ${part.stock}. راجع الاقتراح قبل التعديل.`, items: [{ id: part.id, title: part.name, subtitle: 'اقتراح تحليلي وليس سعراً مضموناً', value: `${median} ج.م`, href: '/seller/parts' }] }
      },
    }),
    getSellerWorkspace: tool({
      description: 'اعرض سجلات تشغيل متجر البائع الحالي فقط: القطع أو الطلبات أو الكوبونات أو الرسائل أو التقييمات.',
      inputSchema: z.object({ section: z.enum(['listings', 'orders', 'coupons', 'messages', 'reviews']) }),
      execute: async ({ section }): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true, name: true } })
        if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط بالحساب' }
        if (section === 'listings') {
          const parts = await db.part.findMany({ where: { storeId: store.id }, select: { id: true, name: true, price: true, stock: true, blocked: true }, orderBy: { updatedAt: 'desc' }, take: 20 })
          return { type: 'results', title: `قطع ${store.name}`, description: 'هذه النتائج تخص متجرك فقط.', items: parts.map((part) => ({ id: part.id, title: part.name, subtitle: `${part.blocked ? 'محظورة' : 'نشطة'} • مخزون ${part.stock}`, value: `${part.price} ج.م`, href: '/seller/parts' })) }
        }
        if (section === 'orders') {
          const orders = await db.order.findMany({ where: { storeId: store.id }, select: { id: true, status: true, totalPrice: true, quantity: true, part: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 })
          return { type: 'results', title: 'طلبات المتجر', description: 'لا يعرض المساعد بيانات اتصال المشترين.', items: orders.map((order) => ({ id: order.id, title: order.part.name, subtitle: `${order.status} • الكمية ${order.quantity}`, value: `${order.totalPrice} ج.م`, href: '/seller/orders' })) }
        }
        if (section === 'coupons') {
          const coupons = await db.coupon.findMany({ where: { storeId: store.id }, select: { id: true, code: true, discountPercent: true, active: true, usedCount: true, maxUses: true, expiresAt: true }, orderBy: { createdAt: 'desc' }, take: 20 })
          return { type: 'results', title: 'كوبونات المتجر', items: coupons.map((coupon) => ({ id: coupon.id, title: coupon.code, subtitle: `${coupon.active ? 'فعال' : 'متوقف'} • ${coupon.usedCount}/${coupon.maxUses}${coupon.expiresAt ? ` • ينتهي ${coupon.expiresAt.toLocaleDateString('ar-EG')}` : ''}`, value: `${coupon.discountPercent}%`, href: '/seller/coupons' })) }
        }
        if (section === 'messages') {
          const messages = await db.productMessage.findMany({ where: { part: { storeId: store.id } }, select: { id: true, message: true, read: true, createdAt: true, senderId: true, part: { select: { name: true } }, sender: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 15 })
          return { type: 'results', title: 'أحدث رسائل العملاء', description: 'يمكنني تجهيز رد كمسودة فقط؛ الإرسال يتم من صفحة الرسائل.', items: messages.map((message) => ({ id: message.id, title: `${message.part.name} — ${message.sender.name}`, subtitle: `${message.senderId === input.user!.id ? 'ردك' : message.read ? 'مقروءة' : 'غير مقروءة'} • ${message.message.slice(0, 140)}`, href: '/seller/messages' })) }
        }
        const [productReviews, storeReviews] = await Promise.all([
          db.productReview.findMany({ where: { part: { storeId: store.id }, blocked: false }, select: { id: true, rating: true, comment: true, part: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
          db.storeReview.findMany({ where: { storeId: store.id, blocked: false }, select: { id: true, rating: true, comment: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
        ])
        return { type: 'results', title: 'أحدث التقييمات', description: 'استخدمها لتحسين الخدمة؛ أي تحليل هو توصية تحتاج مراجعتك.', items: [...productReviews.map((review) => ({ id: review.id, title: `${review.part.name} — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics' })), ...storeReviews.map((review) => ({ id: review.id, title: `تقييم المتجر — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics' }))] }
      },
    }),
  } : {}

  const adminTools = input.user?.role === 'ADMIN' ? {
    getAdminInsights: tool({
      description: 'اعرض إحصاءات تشغيلية مجمعة للمنصة دون بيانات شخصية خام.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const [users, stores, parts, orders, openReports, openDisputes, revenue] = await Promise.all([
          db.user.count(), db.store.count(), db.part.count({ where: { blocked: false } }), db.order.count(), db.report.count({ where: { status: 'OPEN' } }), db.dispute.count({ where: { status: 'OPEN' } }), db.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { totalPrice: true } }),
        ])
        return { type: 'insight', title: 'حالة غيار ماركت', description: `${users} مستخدم • ${stores} متجر • ${parts} قطعة نشطة • ${orders} طلب`, items: [{ id: 'revenue', title: 'قيمة الطلبات المكتملة', value: `${revenue._sum.totalPrice || 0} ج.م` }, { id: 'reports', title: 'بلاغات مفتوحة', value: openReports, href: '/admin/reports' }, { id: 'disputes', title: 'نزاعات مفتوحة', value: openDisputes, href: '/admin/reports' }] }
      },
    }),
    lookupAdminRecords: tool({
      description: 'ابحث عن سجل إداري مع إخفاء البريد والهاتف. لا تعرض مستندات أو أدلة خاصة.',
      inputSchema: z.object({ kind: z.enum(['user', 'store', 'part', 'order']), query: z.string().min(1).max(120) }),
      execute: async ({ kind, query }): Promise<AIToolCard> => {
        const items = kind === 'user'
          ? (await db.user.findMany({ where: { OR: [{ name: { contains: query } }, { email: { contains: query } }, { phone: { contains: query } }] }, select: { id: true, name: true, email: true, phone: true, role: true }, take: 10 })).map((item) => ({ id: item.id, title: item.name, subtitle: `${item.role} • ${maskEmail(item.email) || 'بدون بريد'} • ${maskPhone(item.phone) || 'بدون هاتف'}`, href: '/admin/users' }))
          : kind === 'store'
            ? (await db.store.findMany({ where: { name: { contains: query } }, select: { id: true, name: true, verified: true }, take: 10 })).map((item) => ({ id: item.id, title: item.name, subtitle: item.verified ? 'معتمد' : 'غير معتمد', href: '/admin/stores' }))
            : kind === 'part'
              ? (await db.part.findMany({ where: { OR: [{ name: { contains: query } }, { partNumber: { contains: query } }, { oemNumber: { contains: query } }] }, select: { id: true, name: true, price: true, blocked: true }, take: 10 })).map((item) => ({ id: item.id, title: item.name, subtitle: item.blocked ? 'محظورة' : 'نشطة', value: `${item.price} ج.م`, href: '/admin/parts' }))
              : (await db.order.findMany({ where: { id: { contains: query } }, include: { part: { select: { name: true } } }, take: 10 })).map((item) => ({ id: item.id, title: item.part.name, subtitle: item.status, value: `${item.totalPrice} ج.م`, href: '/admin/orders' }))
        return { type: 'results', title: 'نتائج البحث الإداري', description: 'البيانات الشخصية مخفية داخل المساعد.', items }
      },
    }),
  } : {}

  const tools: ToolSet = { ...commonTools }
  Object.assign(tools, buyerTools, actionTools, sellerTools, adminTools)
  return tools
}

function navigationHref(destination: NavigationDestination, role: AIRole, query?: string) {
  const publicPaths: Partial<Record<NavigationDestination, string>> = { home: '/', parts: query ? `/parts?search=${encodeURIComponent(query)}` : '/parts', stores: '/stores', cart: '/cart' }
  if (destination in publicPaths) return publicPaths[destination]!
  const accountPaths: Partial<Record<NavigationDestination, string>> = { orders: '/account/orders', wishlist: '/account/wishlist', cars: '/account/cars', profile: '/account/profile' }
  if (destination in accountPaths && role !== 'GUEST' && role !== 'ADMIN') return accountPaths[destination]!
  const sellerPaths: Partial<Record<NavigationDestination, string>> = { seller_parts: '/seller/parts', seller_orders: '/seller/orders', seller_analytics: '/seller/analytics', seller_coupons: '/seller/coupons', seller_messages: '/seller/messages' }
  if (destination in sellerPaths && role === 'SHOP_OWNER') return sellerPaths[destination]!
  const adminPaths: Partial<Record<NavigationDestination, string>> = { admin_users: '/admin/users', admin_parts: '/admin/parts', admin_orders: '/admin/orders', admin_stores: '/admin/stores', admin_reports: '/admin/reports' }
  if (destination in adminPaths && role === 'ADMIN') return adminPaths[destination]!
  throw new Error('NAVIGATION_FORBIDDEN')
}

function assertDraftAllowed(target: string, role: AIRole) {
  if (target === 'search') return
  if (role === 'GUEST') throw new Error('DRAFT_FORBIDDEN')
  if (['car', 'message'].includes(target) && role !== 'ADMIN') return
  if (['listing', 'coupon'].includes(target) && role === 'SHOP_OWNER') return
  if (target === 'moderation_note' && role === 'ADMIN') return
  throw new Error('DRAFT_FORBIDDEN')
}
