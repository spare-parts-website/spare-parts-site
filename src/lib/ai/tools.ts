import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { prepareActionProposal } from '@/lib/ai/actions'
import { planDeterministicRequest } from '@/lib/ai/deterministic'
import { presentSellerInventory } from '@/lib/ai/deterministic-presenters'
import { presentAIResponse } from '@/lib/ai/presentation'
import { resolutionCard, resolveAdminEntity, resolveOrder, resolvePart, resolveSellerCoupon, resolveSellerMessage, resolveStore } from '@/lib/ai/resolver'
import { allowedToolNamesForRole } from '@/lib/ai/capabilities'
import { getPublicPartsList, getPublicStoresList } from '@/lib/public-marketplace'
import { deliveryQuote } from '@/lib/delivery'
import { buildGroupedOrderDrafts } from '@/lib/grouped-orders'
import { AI_ACTIONS, type AIClientContext, type AIRole, type AIToolCard, type AIToolName } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

const navigationDestinations = z.enum([
  'home', 'parts', 'stores', 'cart', 'orders', 'wishlist', 'profile', 'login',
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
  message: z.string().max(5000).optional(),
  messageKind: z.enum(['part', 'order']).optional(),
  subject: z.string().max(160).optional(),
  ticketCategory: z.string().max(40).optional(),
  reviewType: z.enum(['product', 'store']).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  sellerRating: z.number().int().min(1).max(5).optional(),
  packagingRating: z.number().int().min(1).max(5).optional(),
  deliveryRating: z.number().int().min(1).max(5).optional(),
  reason: z.string().max(2000).optional(),
  disputeType: z.enum(['RETURN', 'WRONG_ITEM', 'DAMAGED', 'DELIVERY', 'OTHER']).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(40).optional(),
  avatar: z.string().max(500).optional(),
  verified: z.boolean().optional(),
  image: z.string().max(500).optional(),
  images: z.array(z.string().max(500)).max(4).optional(),
  universal: z.boolean().optional(),
  fitmentNotes: z.string().max(1000).optional(),
  email: z.string().email().max(254).optional(),
  emailNotifications: z.boolean().optional(),
  emailDeliveryStatus: z.enum(['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED']).optional(),
  stockDelta: z.number().int().min(-1000000).max(1000000).optional(),
  pricePercent: z.number().finite().min(-100).max(1000).optional(),
  targetIds: z.array(z.string().max(100)).max(200).optional(),
})

async function marketplaceCard(query: string, limit: number, compare = false): Promise<AIToolCard> {
  const boundedQuery = query.trim().slice(0, 160)
  const [partsResult, storesResult] = await Promise.all([
    getPublicPartsList({ search: boundedQuery, sort: compare ? 'price-asc' : 'newest', page: 1 }),
    compare ? Promise.resolve({ stores: [] as Array<never> }) : getPublicStoresList(boundedQuery, 1),
  ])
  const parts = partsResult.parts.slice(0, Math.max(1, Math.min(limit, 10)))
  const stores = storesResult.stores.slice(0, Math.min(4, limit))
  if (compare) {
    const comparisonItems = parts.map((part, index) => {
      const fitment = part.universal ? 'توافق عام' : part.compatibilities.length ? `${part.compatibilities.length} توافقات مسجلة` : 'لا توجد بيانات توافق'
      return {
        id: `compare-part-${part.id}`,
        title: `${index + 1}. ${part.name}`,
        subtitle: `${part.store.name} • ${part.stock > 0 ? `متاح ${part.stock}` : 'غير متاح'} • ${part.condition || 'الحالة غير محددة'} • ${fitment}`,
        value: `${part.price.toLocaleString('ar-EG')} ج.م`,
        href: `/parts/${encodeURIComponent(part.id)}`,
        select: { kind: 'part' as const, id: part.id, label: part.name },
      }
    })
    return { type: 'results', title: `مقارنة ${comparisonItems.length} عروض حقيقية`, description: comparisonItems.length ? 'المقارنة مرتبة من الأقل سعراً، وكل البيانات من العروض العامة الحالية. لم أضف مواصفات غير موجودة.' : 'لم أجد عروضاً كافية للمقارنة حالياً.', items: comparisonItems }
  }
  const prices = parts.map((part) => part.price).filter((price) => Number.isFinite(price))
  const priceSummary = prices.length ? ` • الأسعار من ${Math.min(...prices).toLocaleString('ar-EG')} إلى ${Math.max(...prices).toLocaleString('ar-EG')} ج.م` : ''
  return {
    type: 'results',
    title: `نتائج البحث عن «${boundedQuery}»`,
    description: parts.length || stores.length ? `${parts.length} قطع و${stores.length} متاجر من البحث العام الرسمي${priceSummary}. تحقق من التوافق والمخزون قبل الشراء.` : 'لم نجد نتائج مطابقة حالياً. جرّب اسم القطعة أو الماركة أو رقم OEM أو موديل السيارة.',
    items: [
      ...parts.map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.store.name}${part.brand ? ` • ${part.brand}` : ''} • ${part.stock > 0 ? `متاح ${part.stock}` : 'غير متاح حالياً'}`, value: `${part.price.toLocaleString('ar-EG')} ج.م`, href: `/parts/${encodeURIComponent(part.id)}`, select: { kind: 'part' as const, id: part.id, label: part.name } })),
      ...stores.map((store) => ({ id: `store-${store.id}`, title: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر غير معتمد بعد', value: store.avgRating ? `${store.avgRating.toFixed(1)}/5` : undefined, href: `/stores/${encodeURIComponent(store.id)}`, select: { kind: 'store' as const, id: store.id, label: store.name } })),
    ],
  }
}

export function createAITools(input: { role: AIRole; user: SessionUser | null; conversationId?: string; clientContext: AIClientContext; internetSearchEnabled?: boolean; allowedTools?: AIToolName[] }) {
  let internetSearches = 0
  const compatibilityTool = {
    findCompatibleParts: tool<{ carDescription?: string; query?: string }, AIToolCard, Record<string, never>>({
      description: 'ابحث عن قطع متوافقة باستخدام ماركة وموديل مكتوبين مباشرة، مثل BMW 320i 2020. لا توجد سيارات محفوظة داخل المساعد.',
      inputSchema: z.object({ carDescription: z.string().max(160).optional(), query: z.string().max(120).optional() }),
      execute: async ({ carDescription, query }): Promise<AIToolCard> => {
        const vehicle = extractVehicleDescription(carDescription || '')
        if (!vehicle) return { type: 'insight', title: 'اذكر ماركة وموديل السيارة', description: 'اكتب ماركة السيارة وموديلها وسنة الصنع اختيارياً، وسأطابقها مع بيانات التوافق المسجلة في العروض.' }
        const parts = await db.part.findMany({
          where: {
            blocked: false,
            ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { brand: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] } : {}),
            compatibilities: {
              some: {
                make: { contains: vehicle.make, mode: 'insensitive' },
                model: { contains: vehicle.model, mode: 'insensitive' },
                ...(vehicle.year ? { AND: [{ OR: [{ yearFrom: null }, { yearFrom: { lte: vehicle.year } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: vehicle.year } }] }] } : {}),
              },
            },
          },
          select: { id: true, name: true, price: true, stock: true, store: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }, take: 10,
        })
        const visible = parts.filter((part) => !isBlockedStoreName(part.store.name))
        return { type: 'results', title: `قطع متوافقة مع ${vehicle.make} ${vehicle.model}`, description: `التوافق مبني على بيانات البائع المسجلة${vehicle.year ? ` لسنة ${vehicle.year}` : ''}. راجع رقم القطعة قبل الشراء.`, items: visible.map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.store.name} • مخزون ${part.stock}`, value: `${part.price} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
      },
    }),
  }
  const commonTools = {
    ...compatibilityTool,
    searchMarketplace: tool({
      description: 'ابحث في قطع الغيار والمتاجر العامة. استخدمها قبل اقتراح منتجات أو متاجر.',
      inputSchema: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(10).default(6) }),
      execute: async ({ query, limit }): Promise<AIToolCard> => marketplaceCard(query, limit),
    }),
    compareMarketplace: tool({
      description: 'قارن عروض قطع حقيقية من البحث الحالي أو الاستعلام المقدم، بدون اختلاق مواصفات.',
      inputSchema: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(2).max(8).default(3) }),
      execute: async ({ query, limit }): Promise<AIToolCard> => marketplaceCard(query, limit, true),
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
      inputSchema: z.object({ target: z.enum(['search', 'message', 'listing', 'coupon', 'moderation_note']), fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }),
      execute: async ({ target, fields }): Promise<AIToolCard> => {
        assertDraftAllowed(target, input.role)
        return { type: 'draft', title: 'تم تجهيز المسودة', description: 'راجعها قبل الحفظ أو الإرسال.', clientAction: { type: 'draft', target, fields } }
      },
    }),
  }

  const buyerTools = input.user ? {
    getAccountContext: tool<{ focus: 'overview' | 'orders' | 'cart' | 'favorites'; orderStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' }, AIToolCard, Record<string, never>>({
      description: 'اعرض الجزء المطلوب فقط من حساب المشتري: ملخص أو متاجر مفضلة أو طلبات أو سلة.',
      inputSchema: z.object({ focus: z.enum(['overview', 'orders', 'cart', 'favorites']).default('overview'), orderStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED']).optional() }),
      execute: async ({ focus, orderStatus }): Promise<AIToolCard> => {
        const [favorites, orders, favoriteCount, orderCount, wishlistCount] = await Promise.all([
          db.storeWishlist.findMany({ where: { userId: input.user!.id }, include: { store: { select: { id: true, name: true } } }, take: 10 }),
          db.order.findMany({ where: { buyerId: input.user!.id, ...(orderStatus ? { status: orderStatus } : {}) }, include: { part: { select: { name: true } }, items: { select: { productName: true, quantity: true } }, store: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
          db.storeWishlist.count({ where: { userId: input.user!.id } }),
          db.order.count({ where: { buyerId: input.user!.id, ...(orderStatus ? { status: orderStatus } : {}) } }),
          db.wishlist.count({ where: { userId: input.user!.id } }),
        ])
        const cartTotal = input.clientContext.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
        const cartItems = input.clientContext.cart.map((item) => ({ id: `cart-${item.partId}`, title: item.name, subtitle: `الكمية ${item.quantity} • سعر الوحدة ${item.price.toLocaleString('ar-EG')} ج.م`, value: `${(item.price * item.quantity).toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: item.partId, label: item.name } }))
        const favoriteItems = favorites.map((favorite) => ({ id: `store-${favorite.store.id}`, title: favorite.store.name, subtitle: 'متجر محفوظ في المفضلة', select: { kind: 'store' as const, id: favorite.store.id, label: favorite.store.name } }))
        const orderItems = orders.map((order) => { const label = order.items.length > 1 ? `${order.items.length} منتجات` : order.items[0]?.productName || order.part.name; return { id: `order-${order.id}`, title: label, subtitle: `${order.store.name} • ${humanStatus(order.status)} • الكمية ${order.quantity} • ${order.createdAt.toLocaleDateString('ar-EG')}${order.trackingNumber ? ` • رقم التتبع ${order.trackingNumber}` : ''}`, value: `${order.totalPrice.toLocaleString('ar-EG')} ج.م`, select: { kind: 'order' as const, id: order.id, label } } })
        if (focus === 'cart') return { type: 'insight', title: 'سلة مشترياتك', description: cartItems.length ? `${cartItems.length} عناصر بقيمة إجمالية ${cartTotal.toLocaleString('ar-EG')} ج.م. الأسعار والمخزون قد يتغيران حتى إتمام الطلب.` : 'سلة مشترياتك فارغة حالياً.', items: cartItems }
        if (focus === 'favorites') return { type: 'insight', title: 'المفضلة', description: favoriteCount || wishlistCount ? `${favoriteCount} متجر مفضل${wishlistCount ? ` • ${wishlistCount} قطعة محفوظة في البيانات القديمة` : ''}. أعرض أحدث المتاجر المحفوظة.` : 'لا توجد متاجر محفوظة في المفضلة حالياً.', items: favoriteItems }
        if (focus === 'orders') return { type: 'insight', title: orderStatus ? `طلباتك — ${humanStatus(orderStatus)}` : 'طلباتك', description: orderCount ? `لديك ${orderCount} ${orderStatus ? `طلبات بحالة «${humanStatus(orderStatus)}»` : 'طلب إجمالاً'}. أعرض أحدث ${orders.length} مع الحالة والكمية والتاريخ والسعر.` : `لا توجد طلبات ${orderStatus ? `بحالة «${humanStatus(orderStatus)}»` : 'في حسابك'} حالياً.`, items: orderItems }
        return { type: 'insight', title: 'ملخص حسابك', description: `${orderCount} طلب إجمالي • ${favoriteCount} متجر مفضل • ${input.clientContext.cart.length} عناصر في السلة بقيمة ${cartTotal.toLocaleString('ar-EG')} ج.م.`, items: [...orderItems.slice(0, 2), ...cartItems.slice(0, 2)] }
      },
    }),
    getSupportTickets: tool<{ ticketId?: string; status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'WAITING_FOR_SUPPORT' | 'RESOLVED' | 'CLOSED'; limit: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض تذاكر الدعم الخاصة بالحساب ورسائلها الأخيرة دون كشف بيانات خاصة لجهة أخرى.',
      inputSchema: z.object({ ticketId: z.string().max(100).optional(), status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED']).optional(), limit: z.number().int().min(1).max(10).default(5) }),
      execute: async ({ ticketId, status, limit }): Promise<AIToolCard> => {
        const tickets = await db.supportTicket.findMany({
          where: { userId: input.user!.id, ...(ticketId ? { id: ticketId } : {}), ...(status ? { status } : {}) },
          select: { id: true, subject: true, category: true, status: true, orderId: true, updatedAt: true, messages: { orderBy: { createdAt: 'desc' }, take: 2, select: { body: true, authorRole: true, createdAt: true } } },
          orderBy: { updatedAt: 'desc' }, take: limit,
        })
        return { type: 'results', title: 'تذاكر الدعم الخاصة بك', description: tickets.length ? `عرضت ${tickets.length} تذاكر مع آخر رد متاح لكل تذكرة.` : 'لا توجد تذاكر دعم مطابقة حالياً.', items: tickets.map((ticket) => ({ id: `support-${ticket.id}`, title: ticket.subject, subtitle: `${ticket.category} • ${ticket.status}${ticket.orderId ? ` • طلب مرتبط` : ''}${ticket.messages[0] ? ` • ${ticket.messages[0].authorRole === 'ADMIN' ? 'آخر رد من الدعم' : 'بانتظار الدعم'}: ${ticket.messages[0].body.slice(0, 110)}` : ''}`, select: { kind: 'support_ticket' as const, id: ticket.id, label: ticket.subject } })) }
      },
    }),
    getBuyerDisputes: tool<{ status?: 'OPEN' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER' | 'REJECTED'; limit: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض نزاعات المشتري الخاصة به مع حالة الطلب والقرار، دون إظهار أدلة أو بيانات مشاركين غير لازمة.',
      inputSchema: z.object({ status: z.enum(['OPEN', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'REJECTED']).optional(), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ status, limit }): Promise<AIToolCard> => {
        const disputes = await db.dispute.findMany({
          where: { buyerId: input.user!.id, ...(status ? { status } : {}) },
          select: { id: true, type: true, reason: true, status: true, resolution: true, createdAt: true, order: { select: { part: { select: { name: true } }, items: { select: { productName: true } }, store: { select: { name: true } } } } },
          orderBy: { createdAt: 'desc' }, take: limit,
        })
        return { type: 'results', title: 'نزاعاتك', description: disputes.length ? `${disputes.length} نزاعات معروضة بالحالة والقرار المتاح.` : 'لا توجد نزاعات مطابقة حالياً.', items: disputes.map((dispute) => { const label = dispute.order.items.length > 1 ? `${dispute.order.items.length} منتجات` : dispute.order.items[0]?.productName || dispute.order.part.name; return { id: `dispute-${dispute.id}`, title: label, subtitle: `${dispute.order.store.name} • ${humanStatus(dispute.status)} • ${dispute.type} • ${dispute.reason.slice(0, 100)}${dispute.resolution ? ` • القرار: ${dispute.resolution.slice(0, 90)}` : ''}`, select: { kind: 'dispute' as const, id: dispute.id, label } } }) }
      },
    }),
    getCheckoutPreview: tool<{ couponCode?: string; governorate?: string; deliveryAddress?: string }, AIToolCard, Record<string, never>>({
      description: 'جهّز ملخصاً حقيقياً للسلة قبل إتمام الطلب: يعيد فحص السعر والمخزون، يجمع المنتجات حسب المتجر، ويعرض الشحن إن عُرفت المحافظة. لا ينشئ طلباً.',
      inputSchema: z.object({ couponCode: z.string().max(40).optional(), governorate: z.string().max(40).optional(), deliveryAddress: z.string().max(500).optional() }),
      execute: async ({ couponCode, governorate, deliveryAddress }): Promise<AIToolCard> => {
        const cart = input.clientContext.cart.slice(0, 50)
        if (!cart.length) return { type: 'insight', title: 'السلة فارغة', description: 'أضف قطعة واحدة على الأقل قبل تجهيز الطلب.', items: [{ id: 'cart', title: 'فتح السلة', href: '/cart' }] }
        const ids = [...new Set(cart.map((item) => item.partId))]
        const parts = await db.part.findMany({ where: { id: { in: ids }, blocked: false }, select: { id: true, name: true, price: true, stock: true, image: true, store: { select: { id: true, name: true, ownerId: true } } } })
        const byId = new Map(parts.map((part) => [part.id, part]))
        const missing = cart.filter((item) => !byId.has(item.partId))
        if (missing.length) return { type: 'results', title: 'السلة تحتاج تحديثاً', description: `لم تعد ${missing.length} ${missing.length === 1 ? 'قطعة' : 'قطع'} متاحة بالسعر والمخزون الحاليين. افتح السلة لمراجعة العناصر قبل الطلب.`, items: missing.map((item) => ({ id: `missing-${item.partId}`, title: item.name, subtitle: 'لم تعد متاحة حالياً', href: '/cart' })) }
        if (input.user?.role === 'SHOP_OWNER' && parts.some((part) => part.store.ownerId === input.user!.id)) return { type: 'insight', title: 'لا يمكن شراء عرض من متجرك', description: 'أزل عروض متجرك من السلة أو استخدم حساب مشتري لإكمال الطلب.' }
        const stale = cart.filter((item) => { const part = byId.get(item.partId)!; return item.quantity > part.stock || item.price !== part.price })
        if (stale.length) return { type: 'results', title: 'السلة تغيّرت', description: 'أعدت فحص السعر والمخزون ووجدت عناصر تحتاج مراجعة قبل إتمام الطلب.', items: stale.map((item) => { const part = byId.get(item.partId)!; return { id: `stale-${part.id}`, title: part.name, subtitle: `${item.price !== part.price ? `السعر الآن ${part.price.toLocaleString('ar-EG')} ج.م` : ''}${item.quantity > part.stock ? ` • المتاح ${part.stock}` : ''}`, value: `${part.price.toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } } }) }
        const lines = cart.map((item) => { const part = byId.get(item.partId)!; return { partId: part.id, storeId: part.store.id, ownerId: part.store.ownerId, storeName: part.store.name, productName: part.name, productImage: part.image, unitPrice: part.price, quantity: item.quantity } })
        const coupon = couponCode ? await db.coupon.findUnique({ where: { code: couponCode.trim().toUpperCase() }, select: { code: true, storeId: true, discountPercent: true, active: true, usedCount: true, maxUses: true, expiresAt: true } }) : null
        const couponValid = coupon && coupon.active && coupon.usedCount < coupon.maxUses && (!coupon.expiresAt || coupon.expiresAt > new Date())
        if (couponCode && !couponValid) return { type: 'insight', title: 'الكوبون غير صالح', description: 'لم أطبّق الكوبون لأن الكود غير موجود أو منتهي أو استُنفدت استخداماته. يمكنك إتمام الطلب بدونه.', items: [{ id: 'checkout', title: 'فتح صفحة إتمام الطلب', href: '/checkout' }] }
        const quote = deliveryQuote(governorate)
        const drafts = buildGroupedOrderDrafts(lines, quote?.fee || 0, couponValid ? { code: coupon.code, storeId: coupon.storeId, discountPercent: coupon.discountPercent } : null)
        const subtotal = drafts.reduce((sum, draft) => sum + draft.itemsTotal, 0)
        const shipping = quote ? drafts.reduce((sum, draft) => sum + draft.shippingFee, 0) : undefined
        const total = subtotal + (shipping || 0)
        const items = lines.map((line) => ({ id: `checkout-${line.partId}`, title: line.productName, subtitle: `${line.storeName} • ${line.quantity} × ${line.unitPrice.toLocaleString('ar-EG')} ج.م`, value: `${(line.quantity * line.unitPrice).toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: line.partId, label: line.productName } }))
        const addressHint = deliveryAddress?.trim() ? 'العنوان موجود في المسودة فقط وسيعاد التحقق منه في صفحة الإتمام.' : 'أدخل عنوان التوصيل في صفحة الإتمام.'
        return { type: 'results', title: 'ملخص الطلب قبل الدفع', description: `${drafts.length} ${drafts.length === 1 ? 'متجر' : 'متاجر'} • المنتجات ${subtotal.toLocaleString('ar-EG')} ج.م${shipping === undefined ? ' • اختر المحافظة لحساب الشحن' : ` • الشحن ${shipping.toLocaleString('ar-EG')} ج.م (${quote!.ar})`} • الإجمالي${shipping === undefined ? ' قبل الشحن' : ''} ${total.toLocaleString('ar-EG')} ج.م. ${addressHint} لا ينشئ هذا الملخص طلباً أو يحجز مخزوناً.`, items: [...items, { id: 'checkout', title: 'فتح صفحة إتمام الطلب', subtitle: 'إعادة فحص نهائية، تجميع حسب المتجر، ودفع عند الاستلام', href: '/checkout' }] }
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
      description: 'اعرض الجزء المطلوب فقط من أداء متجر البائع: نظرة عامة أو المخزون المنخفض أو المبيعات أو الطلبات أو التقييم.',
      inputSchema: z.object({ focus: z.enum(['overview', 'low_stock', 'out_of_stock', 'sales', 'orders', 'rating']).default('overview') }),
      execute: async ({ focus }): Promise<AIToolCard> => getSellerInsightsCard(input.user!, focus),
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
    getSellerWorkspace: tool<{ section: 'listings' | 'orders' | 'coupons' | 'messages' | 'reviews'; query?: string; recency?: 'latest' | 'oldest'; limit?: number; listingState?: 'all' | 'active' | 'blocked' | 'low_stock' | 'out_of_stock'; orderStatus?: string; couponState?: 'all' | 'active' | 'inactive' | 'expired'; messageState?: 'all' | 'unread' | 'read' | 'incoming'; rating?: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض أو ابحث في سجلات متجر البائع: القطع أو الطلبات أو الكوبونات أو الرسائل أو التقييمات. يقبل الاسم والوصف الطبيعي وكلمات مثل الأحدث، ولا يحتاج أي معرّف.',
      inputSchema: z.object({ section: z.enum(['listings', 'orders', 'coupons', 'messages', 'reviews']), query: z.string().max(160).optional(), recency: z.enum(['latest', 'oldest']).default('latest'), limit: z.number().int().min(1).max(20).default(10), listingState: z.enum(['all', 'active', 'blocked', 'low_stock', 'out_of_stock']).default('all'), orderStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED']).optional(), couponState: z.enum(['all', 'active', 'inactive', 'expired']).default('all'), messageState: z.enum(['all', 'unread', 'read', 'incoming']).default('all'), rating: z.number().int().min(1).max(5).optional() }),
      execute: async ({ section, query, recency = 'latest', limit = 10, listingState = 'all', orderStatus, couponState = 'all', messageState = 'all', rating }): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true, name: true } })
        if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط بالحساب' }
        const orderBy = { createdAt: recency === 'oldest' ? 'asc' as const : 'desc' as const }
        if (section === 'listings') {
          const selectedId = input.clientContext.selection?.kind === 'part' ? input.clientContext.selection.id : undefined
          const parts = await db.part.findMany({ where: { storeId: store.id, ...(listingState === 'active' ? { blocked: false } : listingState === 'blocked' ? { blocked: true } : listingState === 'low_stock' ? { stock: { lte: 3 } } : listingState === 'out_of_stock' ? { stock: 0 } : {}), ...(selectedId ? { id: selectedId } : query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { partNumber: { contains: query, mode: 'insensitive' as const } }, { oemNumber: { contains: query, mode: 'insensitive' as const } }] } : {}) }, select: { id: true, name: true, price: true, stock: true, blocked: true, partNumber: true, oemNumber: true }, orderBy: listingState === 'low_stock' || listingState === 'out_of_stock' ? { stock: 'asc' } : { updatedAt: recency === 'oldest' ? 'asc' : 'desc' }, take: limit })
          const listingLabel = listingState === 'low_stock' ? 'منخفضة المخزون' : listingState === 'out_of_stock' ? 'نافدة المخزون' : listingState === 'blocked' ? 'المحظورة' : listingState === 'active' ? 'النشطة' : ''
          return { type: 'results', title: `قطع ${store.name}${listingLabel ? ` ${listingLabel}` : ''}`, description: parts.length ? `${parts.length} نتائج تخص متجرك فقط${listingState === 'low_stock' ? ' عند حد 3 قطع أو أقل' : ''}.` : `لا توجد قطع ${listingLabel || 'مطابقة'} في متجرك حالياً.`, items: parts.map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.blocked ? 'محظورة' : 'نشطة'} • ${part.stock === 0 ? 'نفد المخزون' : `المخزون ${part.stock}`}${part.partNumber ? ` • رقم ${part.partNumber}` : part.oemNumber ? ` • OEM ${part.oemNumber}` : ''}`, value: `${part.price.toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } })) }
        }
        if (section === 'orders') {
          const selectedId = input.clientContext.selection?.kind === 'order' ? input.clientContext.selection.id : undefined
          const orders = await db.order.findMany({ where: { storeId: store.id, ...(orderStatus ? { status: orderStatus } : {}), ...(selectedId ? { id: selectedId } : query ? { OR: [{ part: { name: { contains: query, mode: 'insensitive' as const } } }, { items: { some: { productName: { contains: query, mode: 'insensitive' as const } } } }] } : {}) }, select: { id: true, status: true, paymentStatus: true, trackingNumber: true, totalPrice: true, quantity: true, createdAt: true, part: { select: { name: true } }, items: { select: { productName: true } } }, orderBy, take: limit })
          return { type: 'results', title: orderStatus ? `طلبات ${humanStatus(orderStatus)}` : 'طلبات المتجر', description: orders.length ? `${orders.length} طلبات تخص متجرك. لا يعرض المساعد بيانات اتصال المشترين.` : `لا توجد طلبات ${orderStatus ? `بحالة «${humanStatus(orderStatus)}»` : 'مطابقة'} حالياً.`, items: orders.map((order) => { const label = order.items.length > 1 ? `${order.items.length} منتجات` : order.items[0]?.productName || order.part.name; return { id: `order-${order.id}`, title: label, subtitle: `${humanStatus(order.status)} • الدفع ${humanStatus(order.paymentStatus)} • الكمية ${order.quantity} • ${order.createdAt.toLocaleDateString('ar-EG')}${order.trackingNumber ? ` • رقم التتبع ${order.trackingNumber}` : ''}`, value: `${order.totalPrice.toLocaleString('ar-EG')} ج.م`, select: { kind: 'order' as const, id: order.id, label } } }) }
        }
        if (section === 'coupons') {
          const selectedId = input.clientContext.selection?.kind === 'coupon' ? input.clientContext.selection.id : undefined
          const now = new Date()
          const coupons = await db.coupon.findMany({ where: { storeId: store.id, ...(couponState === 'active' ? { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : couponState === 'inactive' ? { active: false } : couponState === 'expired' ? { expiresAt: { lte: now } } : {}), ...(selectedId ? { id: selectedId } : query ? { code: { contains: query, mode: 'insensitive' as const } } : {}) }, select: { id: true, code: true, discountPercent: true, active: true, usedCount: true, maxUses: true, expiresAt: true }, orderBy, take: limit })
          return { type: 'results', title: couponState === 'active' ? 'الكوبونات الفعالة' : couponState === 'inactive' ? 'الكوبونات المتوقفة' : couponState === 'expired' ? 'الكوبونات المنتهية' : 'كوبونات المتجر', description: coupons.length ? `${coupons.length} كوبونات مطابقة مع نسبة الخصم والاستخدام والانتهاء.` : 'لا توجد كوبونات مطابقة حالياً.', items: coupons.map((coupon) => ({ id: `coupon-${coupon.id}`, title: coupon.code, subtitle: `${coupon.active ? 'فعال' : 'متوقف'} • استُخدم ${coupon.usedCount} من ${coupon.maxUses}${coupon.expiresAt ? ` • ينتهي ${coupon.expiresAt.toLocaleDateString('ar-EG')}` : ' • دون تاريخ انتهاء'}`, value: `${coupon.discountPercent}%`, select: { kind: 'coupon' as const, id: coupon.id, label: coupon.code } })) }
        }
        if (section === 'messages') {
          const selectedId = input.clientContext.selection?.kind === 'message' ? input.clientContext.selection.id : undefined
          const messages = await db.productMessage.findMany({ where: { part: { storeId: store.id }, ...(messageState === 'unread' ? { receiverId: input.user!.id, read: false } : messageState === 'read' ? { receiverId: input.user!.id, read: true } : messageState === 'incoming' ? { receiverId: input.user!.id } : {}), ...(selectedId ? { id: selectedId } : query ? { OR: [{ message: { contains: query, mode: 'insensitive' as const } }, { part: { name: { contains: query, mode: 'insensitive' as const } } }, { sender: { name: { contains: query, mode: 'insensitive' as const } } }] } : {}) }, select: { id: true, message: true, read: true, createdAt: true, senderId: true, part: { select: { name: true } }, sender: { select: { name: true } } }, orderBy, take: limit })
          return { type: 'results', title: messageState === 'unread' ? 'رسائل العملاء غير المقروءة' : messageState === 'read' ? 'رسائل العملاء المقروءة' : 'أحدث رسائل العملاء', description: messages.length ? `${messages.length} رسائل مطابقة. يمكنني تجهيز رد كمسودة فقط؛ الإرسال يتم من صفحة الرسائل.` : 'لا توجد رسائل مطابقة حالياً.', items: messages.map((message) => ({ id: `message-${message.id}`, title: `${message.part.name} — ${message.sender.name}`, subtitle: `${message.senderId === input.user!.id ? 'ردك' : message.read ? 'مقروءة' : 'غير مقروءة'} • ${message.createdAt.toLocaleDateString('ar-EG')} • ${message.message.slice(0, 140)}`, select: { kind: 'message' as const, id: message.id, label: `${message.part.name} — ${message.sender.name}` } })) }
        }
        const [productReviews, storeReviews] = await Promise.all([
          db.productReview.findMany({ where: { part: { storeId: store.id, ...(query ? { name: { contains: query, mode: 'insensitive' as const } } : {}) }, blocked: false, ...(rating ? { rating } : {}) }, select: { id: true, rating: true, comment: true, part: { select: { name: true } } }, orderBy, take: limit }),
          db.storeReview.findMany({ where: { storeId: store.id, blocked: false, ...(rating ? { rating } : {}), ...(query ? { comment: { contains: query, mode: 'insensitive' as const } } : {}) }, select: { id: true, rating: true, comment: true }, orderBy, take: limit }),
        ])
        const reviewItems = [...productReviews.map((review) => ({ id: review.id, title: `تقييم قطعة — ${review.part.name} — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics', select: { kind: 'review' as const, id: review.id, label: `تقييم قطعة — ${review.part.name}` } })), ...storeReviews.map((review) => ({ id: review.id, title: `تقييم متجر — ${review.rating}/5`, subtitle: review.comment?.slice(0, 160) || 'بدون تعليق', href: '/seller/analytics', select: { kind: 'review' as const, id: review.id, label: 'تقييم متجر' } }))]
        return { type: 'results', title: rating ? `تقييمات ${rating}/5` : 'أحدث التقييمات', description: reviewItems.length ? `${reviewItems.length} تقييمات مطابقة. استخدمها لتحسين الخدمة؛ أي تحليل هو توصية تحتاج مراجعتك.` : 'لا توجد تقييمات مطابقة حالياً.', items: reviewItems }
      },
    }),
    resolveSellerRecord: tool<{ kind: 'coupon' | 'message'; query?: string; recency?: 'latest' | 'oldest' }, AIToolCard, Record<string, never>>({
      description: 'حدد كوبوناً أو رسالة باسمها أو وصفها أو بعبارة الأحدث/الأقدم داخل متجر البائع. استخدم هذه الأداة قبل تجهيز رد أو العمل على سجل محدد، ولا تطلب معرّفاً.',
      inputSchema: z.object({ kind: z.enum(['coupon', 'message']), query: z.string().max(160).optional(), recency: z.enum(['latest', 'oldest']).default('latest') }),
      execute: async ({ kind, query, recency = 'latest' }) => kind === 'coupon'
        ? resolutionCard(await resolveSellerCoupon(input.user!, query, recency, input.clientContext.selection), 'coupon', 'الكوبون المقصود')
        : resolutionCard(await resolveSellerMessage(input.user!, query, recency, input.clientContext.selection), 'message', 'الرسالة المقصودة'),
    }),
    getSellerVerification: tool({
      description: 'اعرض حالة طلب توثيق متجرك فقط. لا تعرض روابط المستندات الخاصة داخل المساعد.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const store = await db.store.findUnique({ where: { ownerId: input.user!.id }, select: { id: true, name: true, verificationStatus: true, verification: { select: { businessName: true, status: true, adminNote: true, submittedAt: true, reviewedAt: true } } } })
        if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط', description: 'أنشئ متجراً أولاً من صفحة البائع.' }
        const verification = store.verification
        return { type: 'results', title: `توثيق ${store.name}`, description: verification ? `الحالة الحالية: ${humanStatus(verification.status)}${verification.businessName ? ` • النشاط: ${verification.businessName}` : ''}${verification.adminNote ? ` • ملاحظة الإدارة: ${verification.adminNote.slice(0, 240)}` : ''}` : `المتجر غير موثق حالياً (${humanStatus(store.verificationStatus)}). ارفع المستندات من صفحة التوثيق لإرسال الطلب.`, items: [{ id: `store-${store.id}`, title: store.name, subtitle: verification ? `${humanStatus(verification.status)} • آخر إرسال ${verification.submittedAt.toLocaleDateString('ar-EG')}` : humanStatus(store.verificationStatus), href: '/seller/verification', select: { kind: 'store' as const, id: store.id, label: store.name } }] }
      },
    }),
  } : {}

  const adminTools = input.user?.role === 'ADMIN' ? {
    getAdminReviews: tool<{ query?: string; state?: 'all' | 'active' | 'blocked'; rating?: number; limit: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض تقييمات المنتجات والمتاجر للمراجعة الإدارية دون تمرير البريد أو الأدلة الخاصة.',
      inputSchema: z.object({ query: z.string().max(120).optional(), state: z.enum(['all', 'active', 'blocked']).default('all'), rating: z.number().int().min(1).max(5).optional(), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, state = 'all', rating, limit }): Promise<AIToolCard> => {
        const blocked = state === 'all' ? undefined : state === 'blocked'
        const productWhere = { ...(blocked === undefined ? {} : { blocked }), ...(rating ? { rating } : {}), ...(query ? { OR: [{ comment: { contains: query, mode: 'insensitive' as const } }, { part: { name: { contains: query, mode: 'insensitive' as const } } }, { user: { name: { contains: query, mode: 'insensitive' as const } } }] } : {}) }
        const storeWhere = { ...(blocked === undefined ? {} : { blocked }), ...(rating ? { rating } : {}), ...(query ? { OR: [{ comment: { contains: query, mode: 'insensitive' as const } }, { store: { name: { contains: query, mode: 'insensitive' as const } } }, { user: { name: { contains: query, mode: 'insensitive' as const } } }] } : {}) }
        const [products, stores] = await Promise.all([
          db.productReview.findMany({ where: productWhere, select: { id: true, rating: true, comment: true, blocked: true, createdAt: true, part: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit }),
          db.storeReview.findMany({ where: storeWhere, select: { id: true, rating: true, comment: true, blocked: true, createdAt: true, store: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit }),
        ])
        const items = [...products.map((review) => ({ id: `review-${review.id}`, title: `تقييم قطعة — ${review.part.name}`, subtitle: `${review.rating}/5 • ${review.user.name} • ${review.blocked ? 'محظور' : 'نشط'}${review.comment ? ` • ${review.comment.slice(0, 120)}` : ''}`, select: { kind: 'review' as const, id: review.id, label: `تقييم قطعة — ${review.part.name}` } })), ...stores.map((review) => ({ id: `review-${review.id}`, title: `تقييم متجر — ${review.store.name}`, subtitle: `${review.rating}/5 • ${review.user.name} • ${review.blocked ? 'محظور' : 'نشط'}${review.comment ? ` • ${review.comment.slice(0, 120)}` : ''}`, select: { kind: 'review' as const, id: review.id, label: `تقييم متجر — ${review.store.name}` } }))].slice(0, limit)
        return { type: 'results', title: state === 'blocked' ? 'التقييمات المحظورة' : state === 'active' ? 'التقييمات النشطة' : 'تقييمات المنصة', description: items.length ? `${items.length} تقييمات مطابقة. اختر تقييماً ثم اطلب حظره أو إلغاء حظره.` : 'لا توجد تقييمات مطابقة حالياً.', items }
      },
    }),
    getAdminEmailDeliverability: tool<{ days: 7 | 30 | 90 }, AIToolCard, Record<string, never>>({
      description: 'اعرض مؤشرات تسليم البريد مجمعة فقط. لا تعرض عناوين البريد أو محتوى الرسائل أو مفاتيح مزودي الخدمة.',
      inputSchema: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }),
      execute: async ({ days = 30 }): Promise<AIToolCard> => {
        const to = new Date()
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
        const statuses = ['SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'] as const
        const [grouped, suppressedRecipients] = await Promise.all([
          db.emailDeliveryAttempt.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
          db.user.count({ where: { emailDeliveryStatus: { in: ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'] } } }),
        ])
        const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<(typeof statuses)[number], number>
        for (const row of grouped) if (row.status in counts) counts[row.status as (typeof statuses)[number]] = row._count._all
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
        const resolved = counts.DELIVERED + counts.BOUNCED + counts.FAILED + counts.COMPLAINED + counts.SUPPRESSED
        const rate = resolved ? Math.round((counts.DELIVERED / resolved) * 1000) / 10 : 0
        return {
          type: 'insight',
          title: `تسليم البريد — آخر ${days} يوماً`,
          description: `${total} محاولة إرسال مسجلة • معدل التسليم ${rate}% • ${suppressedRecipients} حساباً في حالة ارتداد/شكوى/كتم. المؤشرات مجمعة ولا تكشف أي عنوان بريد.`,
          items: statuses.map((status) => ({ id: `email-${status.toLowerCase()}`, title: humanStatus(status), value: counts[status], href: '/admin/email-deliverability' })),
        }
      },
    }),
    getAdminModeration: tool<Record<string, never>, AIToolCard, Record<string, never>>({
      description: 'اعرض ملخص مركز المراجعة والإشراف الإداري بأرقام مجمعة فقط، دون مستندات أو أدلة أو بيانات اتصال خاصة.',
      inputSchema: z.object({}),
      execute: async (): Promise<AIToolCard> => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const [openReports, pendingVerifications, openDisputes, duplicateParts, suspiciousAccounts, recentAuditEvents] = await Promise.all([
          db.report.count({ where: { status: 'OPEN' } }),
          db.sellerVerification.count({ where: { status: 'PENDING' } }),
          db.dispute.count({ where: { status: 'OPEN' } }),
          db.part.groupBy({ by: ['name', 'storeId'], where: { blocked: false }, _count: { _all: true }, having: { id: { _count: { gt: 1 } } }, orderBy: { _count: { id: 'desc' } }, take: 100 }),
          db.report.groupBy({ by: ['targetId'], where: { targetType: 'user', status: 'OPEN' }, _count: { _all: true }, having: { id: { _count: { gte: 2 } } }, orderBy: { _count: { id: 'desc' } }, take: 100 }),
          db.auditLog.count({ where: { createdAt: { gte: since } } }),
        ])
        const items = [
          { id: 'moderation-reports', title: 'بلاغات مفتوحة', value: openReports, href: '/admin/reports' },
          { id: 'moderation-verifications', title: 'توثيقات معلقة', value: pendingVerifications, href: '/admin/stores' },
          { id: 'moderation-disputes', title: 'نزاعات مفتوحة', value: openDisputes, href: '/admin/reports' },
          { id: 'moderation-duplicates', title: 'مجموعات قطع مكررة', value: duplicateParts.length, href: '/admin/parts' },
          { id: 'moderation-accounts', title: 'حسابات بها بلاغات متكررة', value: suspiciousAccounts.length, href: '/admin/reports' },
          { id: 'moderation-audit', title: 'أحداث تدقيق آخر 24 ساعة', value: recentAuditEvents, href: '/admin/reports' },
        ]
        const attention = openReports + pendingVerifications + openDisputes + duplicateParts.length + suspiciousAccounts.length
        return { type: 'insight', title: 'مركز المراجعة والإشراف', description: attention ? `${attention} مؤشرات تحتاج مراجعة أو متابعة. هذه أرقام مجمعة فقط؛ افتح الصفحة المصرح بها لمراجعة التفاصيل.` : 'لا توجد مؤشرات مفتوحة أو مكررة تحتاج متابعة حالياً.', items }
      },
    }),
    getAdminSupportTickets: tool<{ ticketId?: string; status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'WAITING_FOR_SUPPORT' | 'RESOLVED' | 'CLOSED'; search?: string; limit: number }, AIToolCard, Record<string, never>>({
      description: 'اعرض تذاكر الدعم الإدارية مع ملخص الرسائل فقط، دون تمرير البريد أو الأدلة الخاصة للنموذج.',
      inputSchema: z.object({ ticketId: z.string().max(100).optional(), status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED']).optional(), search: z.string().max(120).optional(), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ ticketId, status, search, limit }): Promise<AIToolCard> => {
        const tickets = await db.supportTicket.findMany({
          where: { ...(ticketId ? { id: ticketId } : {}), ...(status ? { status } : {}), ...(search ? { OR: [{ subject: { contains: search, mode: 'insensitive' } }, { user: { name: { contains: search, mode: 'insensitive' } } }] } : {}) },
          select: { id: true, subject: true, category: true, status: true, orderId: true, updatedAt: true, user: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 2, select: { body: true, authorRole: true, createdAt: true } } },
          orderBy: { updatedAt: 'desc' }, take: limit,
        })
        return { type: 'results', title: 'تذاكر الدعم', description: tickets.length ? `${tickets.length} تذاكر مطابقة. بيانات الهوية معروضة بالاسم فقط؛ افتح التذكرة المصرح بها للمزيد.` : 'لا توجد تذاكر دعم مطابقة حالياً.', items: tickets.map((ticket) => ({ id: `support-${ticket.id}`, title: ticket.subject, subtitle: `${ticket.user.name} • ${ticket.category} • ${ticket.status}${ticket.orderId ? ' • طلب مرتبط' : ''}${ticket.messages[0] ? ` • ${ticket.messages[0].body.slice(0, 110)}` : ''}`, select: { kind: 'support_ticket' as const, id: ticket.id, label: ticket.subject } })) }
      },
    }),
    getAdminInsights: tool({
      description: 'اعرض الإحصاء المطلوب فقط من المنصة دون بيانات شخصية خام: مستخدمون أو متاجر أو قطع أو طلبات أو بلاغات أو نزاعات أو إيراد.',
      inputSchema: z.object({ focus: z.enum(['overview', 'users', 'stores', 'parts', 'orders', 'reports', 'disputes', 'revenue']).default('overview') }),
      execute: async ({ focus }): Promise<AIToolCard> => {
        const [users, stores, verifiedStores, activeParts, blockedParts, orders, deliveredOrders, openReports, openDisputes, pendingVerifications, revenue] = await Promise.all([
          db.user.count(), db.store.count(), db.store.count({ where: { verified: true } }), db.part.count({ where: { blocked: false } }), db.part.count({ where: { blocked: true } }), db.order.count(), db.order.count({ where: { status: 'DELIVERED' } }), db.report.count({ where: { status: 'OPEN' } }), db.dispute.count({ where: { status: 'OPEN' } }), db.sellerVerification.count({ where: { status: 'PENDING' } }), db.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { totalPrice: true } }),
        ])
        const deliveredValue = revenue._sum.totalPrice || 0
        if (focus === 'users') return { type: 'insight', title: 'المستخدمون', description: `يوجد ${users} حساب مسجل على غيار ماركت. هذه إحصائية مجمعة ولا تعرض أي بريد أو هاتف أو بيانات شخصية.`, items: [{ id: 'users', title: 'كل المستخدمين', value: users, href: '/admin/users' }] }
        if (focus === 'stores') return { type: 'insight', title: 'المتاجر', description: `${stores} متجر إجمالي • ${verifiedStores} متجر معتمد • ${Math.max(0, stores - verifiedStores)} غير معتمد • ${pendingVerifications} طلب توثيق قيد الانتظار.`, items: [{ id: 'stores', title: 'كل المتاجر', value: stores, href: '/admin/stores' }, { id: 'verified-stores', title: 'المتاجر المعتمدة', value: verifiedStores, href: '/admin/stores' }, { id: 'pending-verifications', title: 'طلبات توثيق معلقة', value: pendingVerifications, href: '/admin/stores' }] }
        if (focus === 'parts') return { type: 'insight', title: 'قطع المنصة', description: `${activeParts} قطعة نشطة قابلة للعرض • ${blockedParts} قطعة محظورة • ${activeParts + blockedParts} قطعة إجمالي.`, items: [{ id: 'active-parts', title: 'قطع نشطة', value: activeParts, href: '/admin/parts' }, { id: 'blocked-parts', title: 'قطع محظورة', value: blockedParts, href: '/admin/parts' }] }
        if (focus === 'orders') return { type: 'insight', title: 'طلبات المنصة', description: `${orders} طلب إجمالي • ${deliveredOrders} مكتمل • ${Math.max(0, orders - deliveredOrders)} في حالات أخرى. قيمة الطلبات المكتملة ${deliveredValue.toLocaleString('ar-EG')} ج.م.`, items: [{ id: 'all-orders', title: 'كل الطلبات', value: orders, href: '/admin/orders' }, { id: 'delivered-orders', title: 'طلبات مكتملة', value: deliveredOrders, href: '/admin/orders' }] }
        if (focus === 'reports') return { type: 'insight', title: 'البلاغات المفتوحة', description: openReports ? `${openReports} بلاغات ما زالت مفتوحة وتحتاج مراجعة إدارية.` : 'لا توجد بلاغات مفتوحة حالياً.', items: [{ id: 'reports', title: 'بلاغات مفتوحة', value: openReports, href: '/admin/reports' }] }
        if (focus === 'disputes') return { type: 'insight', title: 'النزاعات المفتوحة', description: openDisputes ? `${openDisputes} نزاعات مفتوحة تحتاج قراراً بعد مراجعة الطلب والأدلة.` : 'لا توجد نزاعات مفتوحة حالياً.', items: [{ id: 'disputes', title: 'نزاعات مفتوحة', value: openDisputes, href: '/admin/reports' }] }
        if (focus === 'revenue') return { type: 'insight', title: 'قيمة الطلبات المكتملة', description: `${deliveredValue.toLocaleString('ar-EG')} ج.م عبر ${deliveredOrders} طلبات مكتملة. هذه قيمة إجمالية للطلبات وليست صافي ربح المنصة.`, items: [{ id: 'revenue', title: 'قيمة الطلبات المكتملة', value: `${deliveredValue.toLocaleString('ar-EG')} ج.م` }] }
        return { type: 'insight', title: 'حالة غيار ماركت', description: `${users} مستخدم • ${stores} متجر (${verifiedStores} معتمد) • ${activeParts} قطعة نشطة • ${orders} طلب (${deliveredOrders} مكتمل)`, items: [{ id: 'revenue', title: 'قيمة الطلبات المكتملة', value: `${deliveredValue.toLocaleString('ar-EG')} ج.م` }, { id: 'reports', title: 'بلاغات مفتوحة', value: openReports, href: '/admin/reports' }, { id: 'disputes', title: 'نزاعات مفتوحة', value: openDisputes, href: '/admin/reports' }, { id: 'verifications', title: 'طلبات توثيق معلقة', value: pendingVerifications, href: '/admin/stores' }] }
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
  // A model-supplied allowlist is only an upper bound. The registry-derived
  // role allowlist is the server authority, even if a caller accidentally
  // requests a tool that was not exposed for the current session.
  const roleTools = new Set(allowedToolNamesForRole(input.role))
  const requestedTools = input.allowedTools ? new Set(input.allowedTools) : null
  return Object.fromEntries(Object.entries(tools).filter(([name]) => roleTools.has(name as AIToolName) && (!requestedTools || requestedTools.has(name as AIToolName)))) as ToolSet
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
    db.order.findMany({ where: { storeId: store.id, createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'REJECTED', 'RETURNED'] } }, select: { partId: true, quantity: true, totalPrice: true, paymentStatus: true, items: { select: { partId: true, quantity: true, itemTotal: true } } } }),
  ])
  if (!parts.length) return { answer: `تحليل آخر 30 يوماً لمتجر ${store.name}: لا توجد منتجات نشطة لتحليلها حالياً.`, cards: [] }
  const sales = new Map<string, { quantity: number; revenue: number }>()
  for (const order of orders) {
    const lines = order.items.length ? order.items : [{ partId: order.partId, quantity: order.quantity, itemTotal: order.totalPrice }]
    for (const line of lines) {
      if (!line.partId) continue
      const current = sales.get(line.partId) || { quantity: 0, revenue: 0 }
      current.quantity += line.quantity
      if (order.paymentStatus === 'PAID') current.revenue += line.itemTotal
      sales.set(line.partId, current)
    }
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

export async function getSellerInsightsCard(user: SessionUser, focus: 'overview' | 'low_stock' | 'out_of_stock' | 'sales' | 'orders' | 'rating' = 'overview'): Promise<AIToolCard> {
  if (user.role !== 'SHOP_OWNER') throw new Error('ACTION_FORBIDDEN')
  const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true, name: true } })
  if (!store) return { type: 'insight', title: 'لا يوجد متجر مرتبط بالحساب' }
  const [parts, partCount, activePartCount, lowStockCount, orders, reviews] = await Promise.all([
    db.part.findMany({ where: { storeId: store.id }, select: { id: true, name: true, price: true, stock: true, blocked: true }, orderBy: { stock: 'asc' }, take: 500 }),
    db.part.count({ where: { storeId: store.id } }),
    db.part.count({ where: { storeId: store.id, blocked: false } }),
    db.part.count({ where: { storeId: store.id, stock: { lte: 3 } } }),
    db.order.findMany({ where: { storeId: store.id }, select: { status: true, paymentStatus: true, totalPrice: true, quantity: true, createdAt: true } }),
    db.productReview.findMany({ where: { part: { storeId: store.id }, blocked: false }, select: { rating: true } }),
  ])
  const completed = orders.filter((order) => order.status === 'DELIVERED')
  const revenue = completed.reduce((sum, order) => sum + order.totalPrice, 0)
  const rating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0
  const lowStock = parts.filter((part) => part.stock <= 3)
  const pendingOrders = orders.filter((order) => !['DELIVERED', 'RETURNED', 'CANCELLED', 'REJECTED'].includes(order.status))
  const paidRevenue = orders.filter((order) => order.paymentStatus === 'PAID').reduce((sum, order) => sum + order.totalPrice, 0)
  const statusCounts: Array<{ status: string; count: number }> = [...new Set(orders.map((order) => String(order.status)))].map((status) => ({ status, count: orders.filter((order) => String(order.status) === status).length }))
  const lowStockItems = lowStock.slice(0, 20).map((part) => ({ id: `part-${part.id}`, title: part.name, subtitle: `${part.stock === 0 ? 'نفد من المخزون' : `متبقي ${part.stock}`} • ${part.blocked ? 'محظورة' : 'نشطة'}`, value: `${part.price.toLocaleString('ar-EG')} ج.م`, select: { kind: 'part' as const, id: part.id, label: part.name } }))
  if (focus === 'out_of_stock' || focus === 'low_stock') return presentSellerInventory({ storeName: store.name, totalParts: partCount, lowStockCount, parts, focus })
  if (focus === 'sales') return {
    type: 'insight', title: `مبيعات ${store.name}`,
    description: `${completed.length} طلبات مكتملة بقيمة ${revenue.toLocaleString('ar-EG')} ج.م • إجمالي المدفوع عبر كل الحالات ${paidRevenue.toLocaleString('ar-EG')} ج.م • متوسط الطلب المكتمل ${completed.length ? (revenue / completed.length).toLocaleString('ar-EG', { maximumFractionDigits: 0 }) : '0'} ج.م. المرتجعات والطلبات الملغاة لا تدخل في المبيعات المكتملة.`,
  }
  if (focus === 'orders') return {
    type: 'insight', title: `طلبات ${store.name}`,
    description: `${orders.length} طلب إجمالي • ${pendingOrders.length} تحتاج متابعة • ${completed.length} مكتملة.`,
    items: statusCounts.map(({ status, count }) => ({ id: `status-${status}`, title: humanStatus(status), value: count, href: '/seller/orders' })),
  }
  if (focus === 'rating') return {
    type: 'insight', title: `تقييم منتجات ${store.name}`,
    description: reviews.length ? `متوسط تقييم المنتجات ${rating.toFixed(1)} من 5 بناءً على ${reviews.length} تقييم ظاهر وغير محظور.` : 'لا توجد تقييمات منتجات ظاهرة يمكن حساب متوسط موثوق منها حالياً.',
    items: reviews.length ? [1, 2, 3, 4, 5].reverse().map((score) => ({ id: `rating-${score}`, title: `${score} نجوم`, value: reviews.filter((review) => review.rating === score).length, href: '/seller/analytics' })) : [],
  }
  return {
    type: 'insight', title: `أداء ${store.name}`,
    description: `${activePartCount} قطعة نشطة من ${partCount} • ${orders.length} طلب • ${revenue.toLocaleString('ar-EG')} ج.م مبيعات مكتملة • تقييم ${reviews.length ? `${rating.toFixed(1)}/5 من ${reviews.length} تقييم` : 'لا يوجد بعد'} • ${lowStockCount} منخفضة المخزون.`,
    items: lowStockItems.slice(0, 5),
  }
}

function navigationHref(destination: NavigationDestination, role: AIRole, query?: string) {
  const publicPaths: Partial<Record<NavigationDestination, string>> = { home: '/', parts: query ? `/parts?search=${encodeURIComponent(query)}` : '/parts', stores: '/stores', cart: '/cart', login: '/login' }
  if (destination in publicPaths) return publicPaths[destination]!
  const accountPaths: Partial<Record<NavigationDestination, string>> = { orders: '/account/orders', wishlist: '/account/wishlist', profile: '/account/profile' }
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
  if (target === 'message' && role !== 'ADMIN') return
  if (['listing', 'coupon'].includes(target) && role === 'SHOP_OWNER') return
  if (target === 'moderation_note' && role === 'ADMIN') return
  throw new Error('DRAFT_FORBIDDEN')
}

function extractVehicleDescription(value: string) {
  const tokens = value.match(/[\p{L}\p{N}-]+/gu) || []
  const knownMakes = new Set([
    'bmw', 'مرسيدس', 'mercedes', 'mercedes-benz', 'toyota', 'تويوتا', 'hyundai', 'هيونداي', 'nissan', 'نيسان',
    'kia', 'كيا', 'honda', 'هوندا', 'ford', 'فورد', 'volkswagen', 'volkswagen', 'vw', 'فولكس', 'chevrolet', 'شيفروليه',
    'mitsubishi', 'ميتسوبيشي', 'audi', 'اودي', 'أودي', 'volvo', 'فولفو', 'skoda', 'سكودا', 'peugeot', 'بيجو', 'renault', 'رينو',
  ])
  const makeIndex = tokens.findIndex((token) => knownMakes.has(token.toLocaleLowerCase('ar')))
  if (makeIndex < 0) return null
  const ignored = new Set(['car', 'سيارة', 'السيارة', 'compatible', 'fit', 'fits', 'متوافق', 'ينفع', 'يركب', 'مع', 'for', 'with', 'موديل', 'model'])
  const model = tokens.slice(makeIndex + 1).find((token) => !/^\d{4}$/.test(token) && !ignored.has(token.toLocaleLowerCase('ar')))
  if (!model) return null
  const yearValue = tokens.find((token) => /^\d{4}$/.test(token))
  const year = yearValue ? Number(yearValue) : undefined
  return { make: tokens[makeIndex], model, ...(year && year >= 1950 && year <= new Date().getFullYear() + 2 ? { year } : {}) }
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
