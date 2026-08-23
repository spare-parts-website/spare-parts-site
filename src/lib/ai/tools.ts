import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { prepareActionProposal } from '@/lib/ai/actions'
import { resolutionCard, resolveAdminEntity, resolveCar, resolveOrder, resolvePart, resolveSellerCoupon, resolveSellerMessage, resolveStore } from '@/lib/ai/resolver'
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

export function createAITools(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext }) {
  let internetSearches = 0
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
            ...parts.filter((part) => !isBlockedStoreName(part.store.name)).map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.store.name}${part.brand ? ` • ${part.brand}` : ''} • متاح ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })),
            ...stores.filter((store) => !isBlockedStoreName(store.name)).map((store) => ({ id: `store-${store.id}`, title: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر', select: { kind: 'store' as const, id: store.id, label: store.name } })),
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
    searchInternet: tool({
      description: 'ابحث في الويب عن معلومات حديثة خارج غيار ماركت، مثل سعر سيارة أو قطعة في السوق أو مواصفات أو أخبار جديدة. استخدمه فقط للمعلومات التي قد تتغير مع الوقت. النتائج تقديرية وروابطها تظهر للمستخدم.',
      inputSchema: z.object({ query: z.string().min(2).max(180).describe('عبارة بحث واضحة تشمل الموديل والسنة والبلد عند الحاجة') }),
      execute: async ({ query }): Promise<AIToolCard> => {
        if (internetSearches >= 1) return { type: 'insight', title: 'تم استخدام بحث الإنترنت لهذه الرسالة', description: 'استخدم النتائج المتاحة للإجابة ولا تكرر البحث.' }
        internetSearches += 1
        return searchInternet(query)
      },
    }),
  }

  const buyerTools = input.user && input.user.role !== 'ADMIN' ? {
    getAccountContext: tool({
      description: 'اعرض ملخص حساب المشتري الحالي: السيارات والمفضلة والطلبات الأخيرة فقط.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const [cars, favorites, orders] = await Promise.all([
          db.userCar.findMany({ where: { userId: input.user!.id }, select: { id: true, brand: true, model: true, year: true, engine: true, nickname: true, isPrimary: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }], take: 5 }),
          db.storeWishlist.findMany({ where: { userId: input.user!.id }, include: { store: { select: { id: true, name: true } } }, take: 10 }),
          db.order.findMany({ where: { buyerId: input.user!.id }, include: { part: { select: { name: true } }, store: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
        ])
        return { type: 'insight', title: 'ملخص حسابك', description: `${cars.length} سيارة محفوظة • ${favorites.length} متجر مفضل • ${orders.length} طلبات حديثة • ${input.clientContext.cart.length} عناصر في السلة`, items: [...input.clientContext.cart.map((item) => ({ id: `cart-${item.partId}`, title: item.name, subtitle: `في السلة • الكمية ${item.quantity}`, value: `${item.price * item.quantity} ج.م`, select: { kind: 'part' as const, id: item.partId, label: item.name } })), ...cars.map((car) => ({ id: `car-${car.id}`, title: car.nickname || `${car.brand} ${car.model}`, subtitle: `${car.brand} ${car.model} ${car.year || ''}${car.engine ? ` • ${car.engine}` : ''}${car.isPrimary ? ' • الأساسية' : ''}`, select: { kind: 'car' as const, id: car.id, label: car.nickname || `${car.brand} ${car.model}` } })), ...favorites.map((favorite) => ({ id: `store-${favorite.store.id}`, title: favorite.store.name, subtitle: 'متجر في المفضلة', select: { kind: 'store' as const, id: favorite.store.id, label: favorite.store.name } })), ...orders.map((order) => ({ id: `order-${order.id}`, title: order.part.name, subtitle: `${order.store.name} • ${humanStatus(order.status)}`, value: `${order.totalPrice} ج.م`, select: { kind: 'order' as const, id: order.id, label: order.part.name } }))] }
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
        return { type: 'insight', title: `أداء ${store.name}`, description: `${parts.length} قطعة • ${orders.length} طلب • ${revenue.toFixed(0)} ج.م مبيعات مكتملة • تقييم ${rating.toFixed(1)}`, items: lowStock.slice(0, 8).map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `مخزون منخفض: ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
      },
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

function humanStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'قيد الانتظار', APPROVED: 'تمت الموافقة', REJECTED: 'مرفوض', PAID: 'مدفوع', SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', RETURNED: 'مرتجع', CANCELLED: 'ملغي', UNPAID: 'غير مدفوع', REFUNDED: 'تم رد المبلغ', OPEN: 'مفتوح', REVIEWED: 'تمت المراجعة', DISMISSED: 'مرفوض', BLOCKED: 'محظور', ACTIVE: 'نشط', VERIFIED: 'معتمد', UNVERIFIED: 'غير معتمد', RESOLVED_BUYER: 'حُسم للمشتري', RESOLVED_SELLER: 'حُسم للبائع',
  }
  return labels[status] || status
}

export async function searchInternet(query: string): Promise<AIToolCard> {
  const normalizedQuery = query.trim().slice(0, 180)
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?kl=eg-ar&q=${encodeURIComponent(normalizedQuery)}`, {
      headers: { 'User-Agent': 'GhyarMarket/1.0 (+https://ghyarmarket-eg.com)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`SEARCH_HTTP_${response.status}`)
    const results = parseSearchResults(await response.text())
    if (!results.length) return { type: 'insight', title: 'لم أجد نتائج ويب مناسبة', description: 'جرّب ذكر موديل السيارة أو سنة الصنع أو رقم القطعة أو البلد.' }
    return {
      type: 'results',
      title: `نتائج ويب حديثة عن «${normalizedQuery}»`,
      description: 'نتائج خارج غيار ماركت وقد تتغير الأسعار. راجع الرابط والتوافق قبل الشراء.',
      items: results.map((result, index) => ({ id: `web-${index}`, title: result.title, subtitle: result.snippet, href: result.url })),
    }
  } catch (error) {
    console.error('Internet search failed:', { message: error instanceof Error ? error.message : 'UnknownError' })
    return { type: 'insight', title: 'تعذر الوصول إلى نتائج الإنترنت الآن', description: 'يمكنني مساعدتك بسعر تقريبي من عروض غيار ماركت أو حاول مرة أخرى بعد قليل.' }
  }
}

function parseSearchResults(html: string) {
  const results: Array<{ title: string; snippet: string; url: string }> = []
  const matcher = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(matcher)) {
    const url = unwrapSearchUrl(match[1])
    const title = cleanSearchText(match[2])
    const snippet = cleanSearchText(match[3])
    if (url && title && !results.some((result) => result.url === url)) results.push({ url, title, snippet: snippet.slice(0, 300) })
    if (results.length === 5) break
  }
  return results
}

function unwrapSearchUrl(value: string) {
  try {
    const parsed = new URL(value, 'https://duckduckgo.com')
    const target = parsed.searchParams.get('uddg') || parsed.href
    return /^https?:\/\//i.test(target) ? target : undefined
  } catch {
    return undefined
  }
}

function cleanSearchText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
