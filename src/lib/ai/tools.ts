import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { prepareActionProposal } from '@/lib/ai/actions'
import { planDeterministicRequest } from '@/lib/ai/deterministic'
import { presentAIResponse } from '@/lib/ai/presentation'
import { resolutionCard, resolveAdminEntity, resolveCar, resolveOrder, resolvePart, resolveSellerCoupon, resolveSellerMessage, resolveStore } from '@/lib/ai/resolver'
import { AI_ACTIONS, type AIClientContext, type AIRole, type AIToolCard, type AIToolName } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

const navigationDestinations = z.enum([
  'home', 'parts', 'stores', 'cart', 'orders', 'wishlist', 'cars', 'profile',
  'seller_parts', 'seller_orders', 'seller_analytics', 'seller_coupons', 'seller_messages',
  'admin_users', 'admin_parts', 'admin_orders', 'admin_stores', 'admin_reports',
])
type NavigationDestination = z.infer<typeof navigationDestinations>

const actionSchema = z.object({
  action: z.enum(AI_ACTIONS),
  targetId: z.string().max(100).optional().describe('داخلي فقط؛ لا تطلبه من المستخدم'),
  name: z.string().max(160).optional().describe('اسم طبيعي للقطعة أو السجل'),
  entityName: z.string().max(160).optional().describe('الاسم أو الوصف الذي قاله المستخدم'),
  storeName: z.string().max(160).optional().describe('اسم المتجر كما قاله المستخدم'),
  orderDescription: z.string().max(240).optional().describe('وصف الطلب مثل أحدث طلب فرامل من متجر كذا'),
  recency: z.enum(['latest', 'oldest']).optional(),
  date: z.string().max(30).optional().describe('تاريخ YYYY-MM-DD مستخرج من كلام المستخدم عند ذكر يوم محدد'),
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
  status: z.string().max(50).optional().describe('حوّل نية المستخدم إلى الحالة الداخلية بنفسك ولا تطلب كوداً منه'),
  role: z.enum(['BUYER', 'SHOP_OWNER', 'ADMIN']).optional(),
  trackingNumber: z.string().max(100).optional(),
  brand: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  year: z.number().optional(),
  engine: z.string().max(80).optional(),
  nickname: z.string().max(80).optional(),
  isPrimary: z.boolean().optional(),
})

export function createAITools(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext; internetSearchEnabled?: boolean; allowedTools?: AIToolName[] }) {
  let internetSearches = 0
  const commonTools = {
    searchMarketplace: tool({
      description: 'ابحث في قطع الغيار والمتاجر العامة. استخدمها قبل اقتراح منتجات أو متاجر.',
      inputSchema: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(10).default(6) }),
      execute: async ({ query, limit }): Promise<AIToolCard> => {
        const terms = [...new Set(query.split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2))].slice(0, 6)
        const partSearch = (terms.length ? terms : [query]).flatMap((term) => [{ name: { contains: term } }, { description: { contains: term } }, { brand: { contains: term } }, { partNumber: { contains: term } }, { oemNumber: { contains: term } }, { searchAliases: { contains: term } }, { compatibilities: { some: { OR: [{ make: { contains: term } }, { model: { contains: term } }] } } }])
        const storeSearch = (terms.length ? terms : [query]).flatMap((term) => [{ name: { contains: term } }, { description: { contains: term } }])
        const [parts, stores] = await Promise.all([
          db.part.findMany({
            where: { blocked: false, OR: partSearch },
            select: { id: true, name: true, price: true, stock: true, brand: true, store: { select: { name: true } } },
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          db.store.findMany({ where: { OR: storeSearch }, select: { id: true, name: true, verified: true }, take: Math.min(4, limit) }),
        ])
        const visibleParts = parts.filter((part) => !isBlockedStoreName(part.store.name))
        const visibleStores = stores.filter((store) => !isBlockedStoreName(store.name))
        const prices = visibleParts.map((part) => part.price)
        const priceSummary = prices.length ? ` • الأسعار من ${Math.min(...prices).toLocaleString('ar-EG')} إلى ${Math.max(...prices).toLocaleString('ar-EG')} ج.م` : ''
        return {
          type: 'results', title: `نتائج البحث عن «${query}»`,
          description: visibleParts.length || visibleStores.length ? `${visibleParts.length} قطع و${visibleStores.length} متاجر من بيانات غيار ماركت الحالية${priceSummary}. تحقق من التوافق والمخزون قبل الشراء.` : 'لم نجد نتائج مطابقة حالياً. جرّب اسم القطعة أو الماركة أو رقم OEM أو موديل السيارة.',
          items: [
            ...visibleParts.map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.store.name}${part.brand ? ` • ${part.brand}` : ''} • ${part.stock > 0 ? `متاح ${part.stock}` : 'غير متاح حالياً'}`, value: `${part.price.toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })),
            ...visibleStores.map((store) => ({ id: `store-${store.id}`, title: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر غير معتمد بعد', select: { kind: 'store' as const, id: store.id, label: store.name } })),
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
        const [cars, favorites, orders, carCount, favoriteCount, orderCount, wishlistCount] = await Promise.all([
          db.userCar.findMany({ where: { userId: input.user!.id }, select: { id: true, brand: true, model: true, year: true, engine: true, nickname: true, isPrimary: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }], take: 5 }),
          db.storeWishlist.findMany({ where: { userId: input.user!.id }, include: { store: { select: { id: true, name: true } } }, take: 10 }),
          db.order.findMany({ where: { buyerId: input.user!.id }, include: { part: { select: { name: true } }, store: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
          db.userCar.count({ where: { userId: input.user!.id } }),
          db.storeWishlist.count({ where: { userId: input.user!.id } }),
          db.order.count({ where: { buyerId: input.user!.id } }),
          db.wishlist.count({ where: { userId: input.user!.id } }),
        ])
        const cartTotal = input.clientContext.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
        return { type: 'insight', title: 'ملخص حسابك', description: `${carCount} سيارة محفوظة • ${orderCount} طلب إجمالي • ${favoriteCount} متجر مفضل • ${wishlistCount} قطعة محفوظة • ${input.clientContext.cart.length} عناصر في السلة بقيمة ${cartTotal.toLocaleString('ar-EG')} ج.م. تظهر أدناه أحدث السجلات فقط.`, items: [...input.clientContext.cart.map((item) => ({ id: `cart-${item.partId}`, title: item.name, subtitle: `في السلة • الكمية ${item.quantity}`, value: `${(item.price * item.quantity).toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: item.partId, label: item.name } })), ...cars.map((car) => ({ id: `car-${car.id}`, title: car.nickname || `${car.brand} ${car.model}`, subtitle: `${car.brand} ${car.model} ${car.year || ''}${car.engine ? ` • ${car.engine}` : ''}${car.isPrimary ? ' • السيارة الأساسية' : ''}`, select: { kind: 'car' as const, id: car.id, label: car.nickname || `${car.brand} ${car.model}` } })), ...favorites.map((favorite) => ({ id: `store-${favorite.store.id}`, title: favorite.store.name, subtitle: 'متجر محفوظ في المفضلة', select: { kind: 'store' as const, id: favorite.store.id, label: favorite.store.name } })), ...orders.map((order) => ({ id: `order-${order.id}`, title: order.part.name, subtitle: `${order.store.name} • ${humanStatus(order.status)}`, value: `${order.totalPrice.toLocaleString('ar-EG')} ج.م`, select: { kind: 'order' as const, id: order.id, label: order.part.name } }))] }
      },
    }),
    findCompatibleParts: tool<{ carId?: string; carDescription?: string; query?: string }, AIToolCard, Record<string, never>>({
      description: 'ابحث عن قطع متوافقة مع سيارة محفوظة. استخدم وصفاً طبيعياً مثل عربيتي الأساسية أو تويوتا 2020، ولا تطلب معرّف السيارة.',
      inputSchema: z.object({ carId: z.string().max(100).optional(), carDescription: z.string().max(160).optional(), query: z.string().max(120).optional() }),
      execute: async ({ carId, carDescription, query }): Promise<AIToolCard> => {
        const resolution = await resolveCar(input.user!, carDescription, carId, input.clientContext.selection)
        if (resolution.status !== 'resolved') return resolution.card
        const car = await db.userCar.findFirst({ where: { id: resolution.entity.id, userId: input.user!.id } })
        if (!car) return { type: 'insight', title: 'السيارة لم تعد متاحة', description: 'اختر سيارة محفوظة أخرى أو أضف بيانات السيارة.' }
        const parts = await db.part.findMany({
          where: {
            blocked: false,
            ...(query ? { OR: [{ name: { contains: query } }, { brand: { contains: query } }, { category: { contains: query } }] } : {}),
            compatibilities: { some: { make: { contains: car.brand }, model: { contains: car.model }, AND: car.year ? [{ OR: [{ yearFrom: null }, { yearFrom: { lte: car.year } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: car.year } }] }] : undefined } },
          },
          select: { id: true, name: true, price: true, stock: true, store: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }, take: 10,
        })
        return { type: 'results', title: `قطع متوافقة مع ${car.brand} ${car.model}`, description: `التوافق مبني على بيانات البائع المسجلة${car.year ? ` لسنة ${car.year}` : ''}. راجع رقم القطعة قبل الشراء.`, items: parts.filter((part) => !isBlockedStoreName(part.store.name)).map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.store.name} • مخزون ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
      },
    }),
  } : {}

  const actionTools = input.user ? {
    prepareAction: tool({
      description: 'حضّر إجراءً حقيقياً للمراجعة. استخدم الاسم أو الوصف الطبيعي في entityName/name/storeName/orderDescription ولا تطلب أبداً معرّفاً أو حالة تقنية من المستخدم. الخادم يحل السجل داخل صلاحيات الحساب، ويعرض اختيارات قابلة للنقر عند تعدد النتائج. استخدم targetId فقط عندما توفره أداة أخرى داخلياً.',
      inputSchema: actionSchema,
      execute: async (proposal): Promise<AIToolCard> => {
        if (!input.conversationId) throw new Error('CONVERSATION_REQUIRED')
        return prepareActionProposal({ conversationId: input.conversationId, user: input.user!, proposal, selection: input.clientContext.selection })
      },
    }),
  } : {}

  const sellerTools = input.user?.role === 'SHOP_OWNER' ? {
    getSellerInsights: tool({
      description: 'اعرض أداء متجر البائع الحالي ومخزونه وطلباته فقط.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => getSellerInsightsCard(input.user!),
    }),
    suggestSellerPrice: tool<{ partId?: string; entityName?: string; partNumber?: string; oemNumber?: string }, AIToolCard, Record<string, never>>({
      description: 'اقترح نطاق سعر لقطعة يملكها البائع باستخدام اسمها أو رقمها، ولا تطلب معرّف القطعة. الاقتراح غير ملزم.',
      inputSchema: z.object({ partId: z.string().max(100).optional(), entityName: z.string().max(160).optional(), partNumber: z.string().max(100).optional(), oemNumber: z.string().max(100).optional() }),
      execute: async ({ partId, entityName, partNumber, oemNumber }): Promise<AIToolCard> => {
        const resolution = await resolvePart({ user: input.user!, scope: 'seller', reference: { targetId: partId, entityName, partNumber, oemNumber }, selection: input.clientContext.selection })
        if (resolution.status !== 'resolved') return resolution.card
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true } })
        const part = store ? await db.part.findFirst({ where: { id: resolution.entity.id, storeId: store.id }, select: { id: true, name: true, price: true, category: true, brand: true, stock: true } }) : null
        if (!part) return { type: 'results', title: 'القطعة لم تعد متاحة', description: 'اكتب اسم قطعة أخرى وسأبحث عنها داخل متجرك.' }
        const comparisons = await db.part.findMany({ where: { id: { not: part.id }, blocked: false, category: part.category || undefined, ...(part.brand ? { brand: part.brand } : {}) }, select: { price: true }, take: 20 })
        const prices = comparisons.map((item) => item.price).filter((price) => price > 0).sort((a, b) => a - b)
        const median = prices.length ? prices[Math.floor(prices.length / 2)] : part.price
        const low = Math.max(0, Math.round(median * 0.9))
        const high = Math.round(median * 1.1)
        return { type: 'insight', title: `اقتراح سعر: ${part.name}`, description: `النطاق المقترح ${low}–${high} ج.م بناءً على ${prices.length} عرض مشابه. السعر الحالي ${part.price} ج.م والمخزون ${part.stock}. راجع الاقتراح قبل التعديل.`, items: [{ id: `part-${part.id}`, title: part.name, subtitle: 'اقتراح تحليلي وليس سعراً مضموناً', value: `${median} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } }] }
      },
    }),
    getSellerWorkspace: tool<{ section: 'listings' | 'orders' | 'coupons' | 'messages' | 'reviews'; query?: string; recency?: 'latest' | 'oldest'; limit?: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض أو ابحث في سجلات متجر البائع: القطع أو الطلبات أو الكوبونات أو الرسائل أو التقييمات. يقبل الاسم والوصف الطبيعي وكلمات مثل الأحدث، ولا يحتاج أي معرّف.',
      inputSchema: z.object({ section: z.enum(['listings', 'orders', 'coupons', 'messages', 'reviews']), query: z.string().max(160).optional(), recency: z.enum(['latest', 'oldest']).default('latest'), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ section, query, recency = 'latest', limit = 10 }): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true, name: true } })
        if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط بالحساب' }
        const orderBy = { createdAt: recency === 'oldest' ? 'asc' as const : 'desc' as const }
        if (section === 'listings') {
          const selectedId = input.clientContext.selection?.kind === 'part' ? input.clientContext.selection.id : undefined
          const parts = await db.part.findMany({ where: { storeId: store.id, ...(selectedId ? { id: selectedId } : query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { partNumber: { contains: query, mode: 'insensitive' as const } }, { oemNumber: { contains: query, mode: 'insensitive' as const } }] } : {}) }, select: { id: true, name: true, price: true, stock: true, blocked: true }, orderBy: { updatedAt: recency === 'oldest' ? 'asc' : 'desc' }, take: limit })
          return { type: 'results', title: `قطع ${store.name}`, description: 'هذه النتائج تخص متجرك فقط.', items: parts.map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.blocked ? 'محظورة' : 'نشطة'} • مخزون ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
        }
        if (section === 'orders') {
          const selectedId = input.clientContext.selection?.kind === 'order' ? input.clientContext.selection.id : undefined
          const orders = await db.order.findMany({ where: { storeId: store.id, ...(selectedId ? { id: selectedId } : query ? { OR: [{ part: { name: { contains: query, mode: 'insensitive' as const } } }, { status: { equals: query, mode: 'insensitive' as const } }] } : {}) }, select: { id: true, status: true, totalPrice: true, quantity: true, createdAt: true, part: { select: { name: true } } }, orderBy, take: limit })
          return { type: 'results', title: 'طلبات المتجر', description: 'لا يعرض المساعد بيانات اتصال المشترين.', items: orders.map((order) => ({ id: `order-${order.id}`, title: order.part.name, subtitle: `${humanStatus(order.status)} • الكمية ${order.quantity} • ${order.createdAt.toLocaleDateString('ar-EG')}`, value: `${order.totalPrice} ج.م`, select: { kind: 'order' as const, id: order.id, label: order.part.name } })) }
        }
        if (section === 'coupons') {
          const selectedId = input.clientContext.selection?.kind === 'coupon' ? input.clientContext.selection.id : undefined
          const coupons = await db.coupon.findMany({ where: { storeId: store.id, ...(selectedId ? { id: selectedId } : query ? { code: { contains: query, mode: 'insensitive' as const } } : {}) }, select: { id: true, code: true, discountPercent: true, active: true, usedCount: true, maxUses: true, expiresAt: true }, orderBy, take: limit })
          return { type: 'results', title: 'كوبونات المتجر', items: coupons.map((coupon) => ({ id: `coupon-${coupon.id}`, title: coupon.code, subtitle: `${coupon.active ? 'فعال' : 'متوقف'} • ${coupon.usedCount}/${coupon.maxUses}${coupon.expiresAt ? ` • ينتهي ${coupon.expiresAt.toLocaleDateString('ar-EG')}` : ''}`, value: `${coupon.discountPercent}%`, select: { kind: 'coupon' as const, id: coupon.id, label: coupon.code } })) }
        }
        if (section === 'messages') {
          const selectedId = input.clientContext.selection?.kind === 'message' ? input.clientContext.selection.id : undefined
          const messages = await db.productMessage.findMany({ where: { part: { storeId: store.id }, ...(selectedId ? { id: selectedId } : query ? { OR: [{ message: { contains: query, mode: 'insensitive' as const } }, { part: { name: { contains: query, mode: 'insensitive' as const } } }, { sender: { name: { contains: query, mode: 'insensitive' as const } } }] } : {}) }, select: { id: true, message: true, read: true, createdAt: true, senderId: true, part: { select: { name: true } }, sender: { select: { name: true } } }, orderBy, take: limit })
          return { type: 'results', title: 'أحدث رسائل العملاء', description: 'يمكنني تجهيز رد كمسودة فقط؛ الإرسال يتم من صفحة الرسائل.', items: messages.map((message) => ({ id: `message-${message.id}`, title: `${message.part.name} — ${message.sender.name}`, subtitle: `${message.senderId === input.user!.id ? 'ردك' : message.read ? 'مقروءة' : 'غير مقروءة'} • ${message.message.slice(0, 140)}`, select: { kind: 'message' as const, id: message.id, label: `${message.part.name} — ${message.sender.name}` } })) }
        }
        const [productReviews, storeReviews] = await Promise.all([
          db.productReview.findMany({ where: { part: { storeId: store.id, ...(query ? { name: { contains: query, mode: 'insensitive' as const } } : {}) }, blocked: false }, select: { id: true, rating: true, comment: true, part: { select: { name: true } } }, orderBy, take: limit }),
          db.storeReview.findMany({ where: { storeId: store.id, blocked: false, ...(query ? { comment: { contains: query, mode: 'insensitive' as const } } : {}) }, select: { id: true, rating: true, comment: true }, orderBy, take: limit }),
        ])
        return { type: 'results', title: 'أحدث التقييمات', description: 'استخدمها لتحسين الخدمة؛ أي تحليل هو توصية تحتاج مراجعتك.', items: [...productReviews.map((review) => ({ id: review.id, title: `${review.part.name} — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics' })), ...storeReviews.map((review) => ({ id: review.id, title: `تقييم المتجر — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics' }))] }
      },
    }),
    resolveSellerRecord: tool<{ kind: 'coupon' | 'message'; query?: string; recency?: 'latest' | 'oldest' }, AIToolCard, Record<string, never>>({
      description: 'حدد كوبوناً أو رسالة باسمها أو وصفها أو بعبارة الأحدث/الأقدم داخل متجر البائع. استخدم هذه الأداة قبل تجهيز رد أو العمل على سجل محدد، ولا تطلب معرّفاً.',
      inputSchema: z.object({ kind: z.enum(['coupon', 'message']), query: z.string().max(160).optional(), recency: z.enum(['latest', 'oldest']).default('latest') }),
      execute: async ({ kind, query, recency = 'latest' }) => kind === 'coupon'
        ? resolutionCard(await resolveSellerCoupon(input.user!, query, recency, input.clientContext.selection), 'coupon', 'الكوبون المقصود')
        : resolutionCard(await resolveSellerMessage(input.user!, query, recency, input.clientContext.selection), 'message', 'الرسالة المقصودة'),
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
    lookupAdminRecords: tool<{ kind: 'user' | 'store' | 'part' | 'order' | 'report' | 'verification' | 'dispute'; query?: string; recency?: 'latest' | 'oldest'; date?: string }, AIToolCard, Record<string, never>>({
      description: 'ابحث بالسجل الإداري بالاسم أو الوصف أو التاريخ دون طلب معرّف. البريد والهاتف يظلان مخفيين، ولا تعرض مستندات أو أدلة خاصة.',
      inputSchema: z.object({ kind: z.enum(['user', 'store', 'part', 'order', 'report', 'verification', 'dispute']), query: z.string().max(160).optional(), recency: z.enum(['latest', 'oldest']).default('latest'), date: z.string().max(30).optional() }),
      execute: async ({ kind, query, recency = 'latest', date }): Promise<AIToolCard> => {
        const reference = { entityName: query, orderDescription: query, recency, date }
        if (kind === 'user') return resolutionCard(await resolveAdminEntity('user', reference, input.clientContext.selection), 'user', 'نتائج المستخدمين')
        if (kind === 'store') return resolutionCard(await resolveStore(reference, input.clientContext.selection), 'store', 'نتائج المتاجر')
        if (kind === 'part') return resolutionCard(await resolvePart({ user: input.user!, scope: 'admin', reference, selection: input.clientContext.selection }), 'part', 'نتائج القطع')
        if (kind === 'report' || kind === 'verification' || kind === 'dispute') return resolutionCard(await resolveAdminEntity(kind, reference, input.clientContext.selection), kind, 'نتائج البحث الإداري')
        return resolutionCard(await resolveOrder(input.user!, reference, input.clientContext.selection, true), 'order', 'نتائج الطلبات')
      },
    }),
  } : {}

  const tools: ToolSet = { ...commonTools }
  if (input.internetSearchEnabled !== false) Object.assign(tools, {
    searchInternet: tool({
      description: 'ابحث في الويب عن معلومات حديثة خارج غيار ماركت، مثل سعر سيارة أو قطعة في السوق أو مواصفات أو أخبار جديدة. استخدمه فقط للمعلومات التي قد تتغير مع الوقت. النتائج تقديرية وروابطها تظهر للمستخدم.',
      inputSchema: z.object({ query: z.string().min(2).max(180).describe('عبارة بحث واضحة تشمل الموديل والسنة والبلد عند الحاجة') }),
      execute: async ({ query }): Promise<AIToolCard> => {
        if (internetSearches >= 1) return { type: 'insight', title: 'تم استخدام بحث الإنترنت لهذه الرسالة', description: 'استخدم النتائج المتاحة للإجابة ولا تكرر البحث.' }
        internetSearches += 1
        return searchInternet(query)
      },
    }),
  })
  Object.assign(tools, buyerTools, actionTools, sellerTools, adminTools)
  if (!input.allowedTools) return tools
  return Object.fromEntries(Object.entries(tools).filter(([name]) => input.allowedTools!.includes(name as AIToolName))) as ToolSet
}

export async function executeDeterministicAIRequest(input: { toolName?: AIToolName; role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext; message: string }): Promise<{ answer: string; cards: AIToolCard[] } | undefined> {
  const request = planDeterministicRequest({ message: input.message, role: input.role, forcedTool: input.toolName, clientContext: input.clientContext })
  if (!request) return undefined
  if (request.kind === 'answer') return { answer: request.answer, cards: [] }
  const requests = request.kind === 'tools' ? request.requests : [request]
  const tools = createAITools({ ...input, allowedTools: [...new Set(requests.map((item) => item.toolName))] })
  const cards: AIToolCard[] = []
  for (const item of requests) {
    const selected = tools[item.toolName] as { execute?: (value: Record<string, unknown>, options: { toolCallId: string; messages: []; abortSignal: AbortSignal }) => PromiseLike<unknown> | unknown } | undefined
    if (!selected?.execute) continue
    const result = await selected.execute(item.input, { toolCallId: `direct-${item.toolName}`, messages: [], abortSignal: new AbortController().signal })
    if (result && typeof result === 'object') cards.push(result as AIToolCard)
  }
  return cards.length ? presentAIResponse('', cards) : undefined
}

export async function buildSellerPerformancePlan(input: { user: SessionUser; conversationId: string }): Promise<{ answer: string; cards: AIToolCard[] }> {
  if (input.user.role !== 'SHOP_OWNER') throw new Error('ACTION_FORBIDDEN')
  const store = await db.store.findUnique({ where: { ownerId: input.user.id }, select: { id: true, name: true } })
  if (!store) return { answer: 'لا يوجد متجر مرتبط بهذا الحساب.', cards: [] }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [parts, orders] = await Promise.all([
    db.part.findMany({ where: { storeId: store.id, blocked: false }, select: { id: true, name: true, price: true, stock: true, category: true, brand: true } }),
    db.order.findMany({ where: { storeId: store.id, createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'REJECTED', 'RETURNED'] } }, select: { partId: true, quantity: true, totalPrice: true, paymentStatus: true } }),
  ])
  if (!parts.length) return { answer: `تحليل آخر 30 يوماً لمتجر ${store.name}: لا توجد منتجات نشطة لتحليلها حالياً.`, cards: [] }
  const sales = new Map<string, { quantity: number; revenue: number }>()
  for (const order of orders) {
    const current = sales.get(order.partId) || { quantity: 0, revenue: 0 }
    current.quantity += order.quantity
    if (order.paymentStatus === 'PAID') current.revenue += order.totalPrice
    sales.set(order.partId, current)
  }
  const ranked = parts.map((part) => ({ ...part, sold: sales.get(part.id)?.quantity || 0, revenue: sales.get(part.id)?.revenue || 0 })).sort((a, b) => a.sold - b.sold || a.stock - b.stock)
  const weakest = ranked[0]
  const lowStock = ranked.filter((part) => part.stock <= 3)
  const comparisons = await db.part.findMany({
    where: { id: { not: weakest.id }, blocked: false, category: weakest.category || undefined, ...(weakest.brand ? { brand: weakest.brand } : {}) },
    select: { price: true }, take: 30,
  })
  const comparisonPrices = comparisons.map((part) => part.price).filter((price) => price > 0).sort((a, b) => a - b)
  const median = comparisonPrices.length ? comparisonPrices[Math.floor(comparisonPrices.length / 2)] : undefined
  const suggestedPrice = median === undefined ? undefined : Math.max(1, Math.round(median))
  const discountPercent = 10
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const code = `AI10-${Date.now().toString(36).slice(-6).toUpperCase()}`
  const cards: AIToolCard[] = []
  if (suggestedPrice !== undefined && suggestedPrice !== Math.round(weakest.price)) {
    cards.push(await prepareActionProposal({ conversationId: input.conversationId, user: input.user, proposal: { action: 'seller_part_update', targetId: weakest.id, price: suggestedPrice } }))
  }
  cards.push(await prepareActionProposal({ conversationId: input.conversationId, user: input.user, proposal: { action: 'seller_coupon_create', code, discountPercent, maxUses: 20, expiresAt: expiresAt.toISOString() } }))
  const totalRevenue = ranked.reduce((sum, part) => sum + part.revenue, 0)
  const weakLines = ranked.slice(0, 5).map((part) => `- ${part.name}: بيع ${part.sold}، مخزون ${part.stock}، السعر ${part.price.toLocaleString('ar-EG')} ج.م`).join('\n')
  const stockLine = lowStock.length ? lowStock.map((part) => `${part.name} (${part.stock})`).join('، ') : 'لا يوجد مخزون عند 3 قطع أو أقل.'
  const priceLine = suggestedPrice === undefined
    ? `لم أجد عروضاً مشابهة كافية لـ${weakest.name}، لذلك لم أقترح تغيير سعر غير موثوق.`
    : `السعر المقترح لـ${weakest.name}: ${suggestedPrice.toLocaleString('ar-EG')} ج.م مقابل ${weakest.price.toLocaleString('ar-EG')} ج.م حالياً، بناءً على وسيط ${comparisonPrices.length} عرض مشابه.`
  const answer = `**تحليل ${store.name} — آخر 30 يوماً**\n${orders.length} طلبات محتسبة، ومبيعات مدفوعة ${totalRevenue.toLocaleString('ar-EG')} ج.م.\n\n**الأضعف مبيعاً**\n${weakLines}\n\n**المخزون المنخفض**\n${stockLine}\n\n**التسعير**\n${priceLine}\n\n**العرض المقترح**\nكوبون ${code} بخصم ${discountPercent}% لمدة 7 أيام وبحد 20 استخداماً. الكوبون يطبق على المتجر كله لأن نظام الكوبونات الحالي لا يربطه بمنتج واحد. راجع كل اقتراح بالأسفل؛ لم يُنفذ أي تغيير.`
  return { answer, cards }
}

export async function buildSellerMessagePlan(input: { user: SessionUser; conversationId: string; selection?: AIClientContext['selection'] }): Promise<{ answer: string; cards: AIToolCard[] }> {
  if (input.user.role !== 'SHOP_OWNER') throw new Error('ACTION_FORBIDDEN')
  const store = await db.store.findUnique({ where: { ownerId: input.user.id }, select: { id: true, name: true } })
  if (!store) return { answer: 'لا يوجد متجر مرتبط بهذا الحساب.', cards: [] }
  const selectedId = input.selection?.kind === 'message' ? input.selection.id : undefined
  const message = await db.productMessage.findFirst({
    where: { part: { storeId: store.id }, receiverId: input.user.id, ...(selectedId ? { id: selectedId } : {}) },
    include: { sender: { select: { name: true } }, part: { select: { id: true, name: true, price: true, stock: true, category: true, brand: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (!message) return { answer: 'لم أجد رسالة واردة من عميل داخل متجرك حالياً.', cards: [] }
  const comparisons = await db.part.findMany({
    where: { id: { not: message.part.id }, blocked: false, category: message.part.category || undefined, ...(message.part.brand ? { brand: message.part.brand } : {}) },
    select: { price: true }, take: 30,
  })
  const prices = comparisons.map((part) => part.price).filter((price) => price > 0).sort((a, b) => a - b)
  const suggestedPrice = prices.length ? Math.max(1, Math.round(prices[Math.floor(prices.length / 2)])) : undefined
  const suggestedStock = message.part.stock <= 3 ? Math.max(5, message.part.stock + 5) : undefined
  const changePrice = suggestedPrice !== undefined && suggestedPrice !== Math.round(message.part.price)
  const cards: AIToolCard[] = []
  if (changePrice || suggestedStock !== undefined) {
    cards.push(await prepareActionProposal({
      conversationId: input.conversationId,
      user: input.user,
      proposal: { action: 'seller_part_update', targetId: message.part.id, ...(changePrice ? { price: suggestedPrice } : {}), ...(suggestedStock !== undefined ? { stock: suggestedStock } : {}) },
    }))
  }
  const compatibilityRequest = /(?:ينفع|يركب|متوافق|موديل|سيارة|عربي|fit|compatible|car|model)/i.test(message.message)
  const reply = compatibilityRequest
    ? `أهلاً ${message.sender.name}، شكراً لسؤالك عن ${message.part.name}. السعر الحالي ${message.part.price.toLocaleString('ar-EG')} ج.م والمتاح ${message.part.stock}. للتأكد من التوافق أرسل ماركة السيارة والموديل وسنة الصنع أو رقم الشاسيه/القطعة، وسأراجعها لك قبل الشراء.`
    : `أهلاً ${message.sender.name}، شكراً لتواصلك بخصوص ${message.part.name}. السعر الحالي ${message.part.price.toLocaleString('ar-EG')} ج.م والمتاح ${message.part.stock}. أخبرني بموديل السيارة وسنة الصنع إن كان سؤالك عن التوافق، وسأساعدك قبل الشراء.`
  const comparison = suggestedPrice === undefined
    ? 'لم أجد عروضاً مشابهة كافية، لذلك لم أخترع سعراً بديلاً.'
    : `وسيط ${prices.length} عرض مشابه هو ${suggestedPrice.toLocaleString('ar-EG')} ج.م، مقابل ${message.part.price.toLocaleString('ar-EG')} ج.م حالياً.`
  const stock = suggestedStock === undefined ? `المخزون الحالي ${message.part.stock} ولا يحتاج تنبيه نقص آلياً.` : `المخزون منخفض (${message.part.stock})؛ المقترح رفعه إلى ${suggestedStock}.`
  return {
    answer: `**أحدث رسالة واردة**\n${message.sender.name} عن ${message.part.name}: «${message.message.slice(0, 500)}»\n\n**مسودة الرد**\n${reply}\n\n**مقارنة السعر**\n${comparison}\n\n**المخزون**\n${stock}\n\n${cards.length ? 'جهزت التغيير المقترح بالأسفل. لن يتغير السعر أو المخزون إلا بعد مراجعتك والضغط على التأكيد.' : 'لا يوجد تغيير موثوق يحتاج تأكيداً حالياً.'}`,
    cards,
  }
}

export async function getSellerInsightsCard(user: SessionUser): Promise<AIToolCard> {
  if (user.role !== 'SHOP_OWNER') throw new Error('ACTION_FORBIDDEN')
  const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true, name: true } })
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
  return { type: 'insight', title: `أداء ${store.name}`, description: `${parts.length} قطعة • ${orders.length} طلب • ${revenue.toFixed(0)} ج.م مبيعات مكتملة • تقييم ${rating.toFixed(1)}`, items: lowStock.slice(0, 8).map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `مخزون منخفض: ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
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

function humanStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'قيد الانتظار', APPROVED: 'تمت الموافقة', REJECTED: 'مرفوض', PAID: 'مدفوع', SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', RETURNED: 'مرتجع', CANCELLED: 'ملغي', UNPAID: 'غير مدفوع', REFUNDED: 'تم رد المبلغ', OPEN: 'مفتوح', REVIEWED: 'تمت المراجعة', DISMISSED: 'مرفوض', BLOCKED: 'محظور', ACTIVE: 'نشط', VERIFIED: 'معتمد', UNVERIFIED: 'غير معتمد', RESOLVED_BUYER: 'حُسم للمشتري', RESOLVED_SELLER: 'حُسم للبائع',
  }
  return labels[status] || status
}

export async function searchInternet(query: string): Promise<AIToolCard> {
  const normalizedQuery = query.trim().slice(0, 180)
  try {
    const wantsEgypt = /(?:\bEgypt\b|\bEGP\b|مصر|مصري)/i.test(normalizedQuery)
    const subject = searchSubject(normalizedQuery)
    let ranked: SearchResult[] = []
    let searchedGlobally = !wantsEgypt

    if (wantsEgypt) {
      const localResults = await searchAcrossProviders([`${subject} price Egypt EGP`, `"${subject}" مصر سعر`])
      ranked = rankSearchResults(subject, localResults).filter(isCredibleEgyptPrice)
    }

    if (!ranked.length) {
      searchedGlobally = true
      const worldwideQueries = globalSearchQueries(subject)
      const [searxResults, duckResults] = await Promise.all([
        searchAcrossProviders(worldwideQueries),
        searchDuckDuckGo(worldwideQueries),
      ])
      ranked = rankSearchResults(subject, [...duckResults, ...searxResults]).filter(isLikelyProductResult)
    }

    if (!ranked.length) return { type: 'insight', title: 'لم أجد نتائج ويب مناسبة', description: 'جرّب ذكر موديل السيارة أو سنة الصنع أو رقم القطعة أو البلد.' }
    return {
      type: 'results',
      title: `${searchedGlobally && wantsEgypt ? 'لم أجد سعراً مصرياً موثوقاً؛ وسّعت البحث عالمياً' : searchedGlobally ? 'أسعار ونتائج عالمية' : 'أسعار متاحة في مصر'} عن «${subject}»`,
      description: searchedGlobally
        ? 'نتائج من متاجر ومصادر عالمية. حوّل العملة وأضف الشحن والجمارك، وتحقق من رقم القطعة والتوافق.'
        : 'نتائج مصرية تتضمن إشارة سعر فعلية. راجع المتجر والتوافق قبل الشراء.',
      items: ranked.map((result, index) => {
        const price = extractPrice(result)
        const condition = extractCondition(result)
        return { id: `web-${index}`, title: result.title, subtitle: [condition, result.snippet].filter(Boolean).join(' • '), href: result.url, ...(price ? { value: price } : {}) }
      }),
    }
  } catch (error) {
    console.error('Internet search failed:', { message: error instanceof Error ? error.message : 'UnknownError' })
    return { type: 'insight', title: 'تعذر الوصول إلى نتائج الإنترنت الآن', description: 'يمكنني مساعدتك بسعر تقريبي من عروض غيار ماركت أو حاول مرة أخرى بعد قليل.' }
  }
}

type SearchResult = { title: string; snippet: string; url: string }

const SEARCH_ENDPOINTS = ['https://baresearch.org/', 'https://search.mectov.my.id/', 'https://search.hbubli.cc/']

function searchSubject(query: string) {
  return query.replace(/\b(?:price|egypt|egp)\b/gi, ' ').replace(/(?:سعر|مصر|مصري)/g, ' ').replace(/\s+/g, ' ').trim()
}

function globalSearchQueries(subject: string) {
  return [...new Set([
    `"${subject}" price`,
    `${subject} buy OEM aftermarket price`,
    `${subject} price ebay amazon autodoc`,
  ])].filter(Boolean)
}

async function searchAcrossProviders(queries: string[]) {
  const responses = await Promise.allSettled(SEARCH_ENDPOINTS.flatMap((endpoint) => queries.map((searchQuery) => searchSearx(endpoint, searchQuery))))
  return responses.flatMap((response) => response.status === 'fulfilled' ? response.value : [])
}

function rankSearchResults(query: string, results: SearchResult[]) {
  const tokens = query.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2)
  const automotive = /(?:bmw|toyota|hyundai|kia|nissan|مرسيدس|بي ام|تويوتا|هيونداي|كيا|نيسان|سيارة|موتور|محرك|belt|brake|engine|car|part)/i.test(query)
  const blocked = automotive ? /(?:microsoft|windows|onedrive|office|support\.apple|stackoverflow|dictionary|wikipedia|cambridge|definition|banking|cryptocurrency)/i : /$a/
  const priceSignal = /(?:\$|€|£|USD|EUR|GBP|EGP|ج\.?م|price|buy|shop|sale|amazon|ebay|aliexpress|autodoc|rockauto|carparts|partsgeek)/i
  return results
    .filter((result) => !blocked.test(`${result.title} ${result.url}`))
    .map((result) => {
      const searchable = `${result.title} ${result.snippet} ${result.url}`.toLocaleLowerCase()
      const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token) ? 2 : 0), 0)
      const exactScore = result.title.toLocaleLowerCase().includes(query.replace(/\b(?:price|egypt|egp)\b/gi, '').trim().toLocaleLowerCase()) ? 6 : 0
      return { result, score: tokenScore + exactScore + (priceSignal.test(searchable) ? 4 : 0) }
    })
    .filter(({ score }) => score >= Math.max(4, Math.min(tokens.length, 3) * 2))
    .sort((a, b) => b.score - a.score)
    .map(({ result }) => result)
    .filter((result, index, all) => all.findIndex((candidate) => new URL(candidate.url).hostname === new URL(result.url).hostname) === index)
    .slice(0, 8)
}

function isCredibleEgyptPrice(result: SearchResult) {
  const text = `${result.title} ${result.snippet} ${result.url}`
  const egyptian = /(?:\.eg(?:\/|$)|\.com\.eg|\bEgypt\b|\bEGP\b|مصر|مصري|ج\.?م|جنيه)/i.test(text)
  const actualPrice = /(?:EGP|ج\.?م|جنيه|L\.?E\.?)\s*\d|\d[\d,.]*\s*(?:EGP|ج\.?م|جنيه|L\.?E\.?)/i.test(text)
  return egyptian && actualPrice
}

function isLikelyProductResult(result: SearchResult) {
  const text = `${result.title} ${result.snippet} ${result.url}`
  return /(?:belt|brake|engine|motor|filter|pump|sensor|bearing|alternator|starter|سيور|حزام|فرامل|محرك|فلتر|طرمبة|حساس|\$|€|£|USD|EUR|GBP|price|buy|ebay|amazon|autodoc|rockauto|parts)/i.test(text)
}

function extractPrice(result: SearchResult) {
  const text = `${result.title} ${result.snippet}`.replace(/\s+/g, ' ')
  const patterns = [
    /(?:EGP|ج\.?م|جنيه|L\.?E\.?)\s*([\d,.]{2,})/i,
    /([\d,.]{2,})\s*(?:EGP|ج\.?م|جنيه|L\.?E\.?)/i,
    /([$€£])\s*([\d,.]{2,})/,
    /([\d,.]{2,})\s*(USD|EUR|GBP)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    if (match[1] && /^[\d,.]+$/.test(match[1])) return `${match[1]} ج.م`
    if (match[1] === '$' || match[1] === '€' || match[1] === '£') return `${match[1]}${match[2]}`
    if (match[1] && match[2]) return `${match[1]} ${match[2].toUpperCase()}`
  }
  return undefined
}

function extractCondition(result: SearchResult) {
  const text = `${result.title} ${result.snippet}`
  if (/(?:used|pre-owned|second hand|مستعمل)/i.test(text)) return 'مستعمل'
  if (/(?:new|brand new|جديد)/i.test(text)) return 'جديد'
  if (/(?:remanufactured|refurbished|مجدد)/i.test(text)) return 'مجدّد'
  return undefined
}

async function searchDuckDuckGo(queries: string[]): Promise<SearchResult[]> {
  const responses = await Promise.allSettled(queries.slice(0, 2).map(async (query) => {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; GhyarMarket/1.0; +https://ghyarmarket-eg.com)' },
      signal: AbortSignal.timeout(7_000),
    })
    if (!response.ok) throw new Error(`DUCK_HTTP_${response.status}`)
    return parseDuckDuckGo(await response.text())
  }))
  return responses.flatMap((response) => response.status === 'fulfilled' ? response.value : [])
}

function parseDuckDuckGo(html: string): SearchResult[] {
  const links = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  const snippets = [...html.matchAll(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)]
  return links.slice(0, 10).flatMap((match, index) => {
    const url = unwrapDuckUrl(decodeHtml(match[1]))
    if (!/^https?:\/\//i.test(url)) return []
    return [{ title: plainText(match[2]).slice(0, 180), snippet: plainText(snippets[index]?.[1] || '').slice(0, 300), url }]
  })
}

function unwrapDuckUrl(value: string) {
  try {
    const url = new URL(value, 'https://duckduckgo.com')
    return url.searchParams.get('uddg') || url.href
  } catch { return value }
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

async function searchSearx(baseUrl: string, query: string) {
  const response = await fetch(`${baseUrl}search?q=${encodeURIComponent(query)}&format=json&language=all&safesearch=1`, {
    headers: { Accept: 'application/json', 'User-Agent': 'GhyarMarket/1.0 (+https://ghyarmarket-eg.com)' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) throw new Error(`SEARCH_HTTP_${response.status}`)
  const payload = await response.json() as { results?: Array<{ title?: unknown; content?: unknown; url?: unknown }> }
  const results = (payload.results || []).flatMap((result) => {
    if (typeof result.title !== 'string' || typeof result.url !== 'string' || !/^https?:\/\//i.test(result.url)) return []
    return [{ title: result.title.trim().slice(0, 180), snippet: typeof result.content === 'string' ? result.content.replace(/\s+/g, ' ').trim().slice(0, 300) : '', url: result.url }]
  }).filter((result, index, all) => result.title && all.findIndex((candidate) => candidate.url === result.url) === index).slice(0, 8)
  if (!results.length) throw new Error('SEARCH_EMPTY')
  return results
}
