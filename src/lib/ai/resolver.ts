import { db } from '@/lib/db'
import { maskEmail, maskPhone } from '@/lib/ai/policy'
import { fuzzyPartScore } from '@/lib/ai/fuzzy-match'
import type { AIEntityKind, AIProposalInput, AISelectedEntity, AIToolCard } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

export type ResolvedEntity = { id: string; label: string; subtitle?: string }
export type EntityResolution =
  | { status: 'resolved'; entity: ResolvedEntity }
  | { status: 'choices'; card: AIToolCard }
  | { status: 'missing'; card: AIToolCard }

type NaturalReference = Pick<AIProposalInput, 'targetId' | 'name' | 'entityName' | 'storeName' | 'partNumber' | 'oemNumber' | 'orderDescription' | 'recency' | 'date'>

function text(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(' ').slice(0, 240)
}

function selectedId(selection: AISelectedEntity | undefined, kind: AIEntityKind) {
  return selection?.kind === kind ? selection.id : undefined
}

function groupedOrderLabel(order: { part: { name: string }; items: Array<{ productName: string }> }) {
  if (order.items.length > 1) return `${order.items[0].productName} و${order.items.length - 1} منتج آخر`
  return order.items[0]?.productName || order.part.name
}

function dateRange(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const start = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(start.getTime())) return undefined
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

function finish(kind: AIEntityKind, label: string, candidates: ResolvedEntity[]): EntityResolution {
  if (candidates.length === 1) return { status: 'resolved', entity: candidates[0] }
  if (!candidates.length) return {
    status: 'missing',
    card: { type: 'results', title: `لم أجد ${label}`, description: 'اكتب الاسم أو وصفاً قصيراً أو رقماً معروفاً، وسأبحث عنه لك دون الحاجة لأي معرّف تقني.' },
  }
  return {
    status: 'choices',
    card: {
      type: 'results',
      title: `اختر ${label} المقصود`,
      description: 'وجدت أكثر من نتيجة مناسبة. اختر واحدة وسأكمل نفس الطلب.',
      items: candidates.slice(0, 5).map((candidate) => ({
        id: `${kind}-${candidate.id}`,
        title: candidate.label,
        subtitle: candidate.subtitle,
        select: { kind, id: candidate.id, label: candidate.label },
      })),
    },
  }
}

export async function resolvePart(input: { user?: SessionUser | null; scope: 'public' | 'seller' | 'admin'; reference: NaturalReference; selection?: AISelectedEntity; requireStock?: boolean }): Promise<EntityResolution> {
  const id = selectedId(input.selection, 'part') || input.reference.targetId
  const store = input.scope === 'seller' && input.user ? await db.store.findUnique({ where: { ownerId: input.user.id }, select: { id: true } }) : null
  if (input.scope === 'seller' && !store) return finish('part', 'القطعة', [])
  const scope = { ...(input.scope === 'seller' ? { storeId: store!.id } : {}), ...(input.scope === 'public' ? { blocked: false } : {}), ...(input.requireStock ? { stock: { gt: 0 } } : {}) }
  if (id) {
    const part = await db.part.findFirst({ where: { ...scope, id }, select: { id: true, name: true, partNumber: true, store: { select: { name: true } } } })
    return finish('part', 'القطعة', part ? [{ id: part.id, label: part.name, subtitle: `${part.store.name}${part.partNumber ? ` • ${part.partNumber}` : ''}` }] : [])
  }
  const query = input.reference.partNumber?.trim() || input.reference.oemNumber?.trim() || input.reference.entityName?.trim() || input.reference.name?.trim() || ''
  if (!query) return finish('part', 'القطعة', [])
  const select = { id: true, name: true, partNumber: true, oemNumber: true, searchAliases: true, store: { select: { name: true } } } as const
  const exact = await db.part.findMany({ where: { ...scope, OR: [{ name: { equals: query, mode: 'insensitive' } }, { partNumber: { equals: query, mode: 'insensitive' } }, { oemNumber: { equals: query, mode: 'insensitive' } }] }, select, take: 6 })
  const contained = exact.length ? [] : await db.part.findMany({ where: { ...scope, OR: [{ name: { contains: query, mode: 'insensitive' } }, { partNumber: { contains: query, mode: 'insensitive' } }, { oemNumber: { contains: query, mode: 'insensitive' } }, { searchAliases: { contains: query, mode: 'insensitive' } }] }, select, orderBy: { updatedAt: 'desc' }, take: 6 })
  const fuzzy = exact.length || contained.length ? [] : (await db.part.findMany({ where: scope, select, orderBy: { updatedAt: 'desc' }, take: 500 }))
    .map((part) => ({ part, score: fuzzyPartScore(query, [part.name, part.partNumber, part.oemNumber, part.searchAliases].filter(Boolean).join(' ')) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.part)
  const rows = exact.length ? exact : contained.length ? contained : fuzzy
  return finish('part', 'القطعة', rows.map((part) => ({ id: part.id, label: part.name, subtitle: `${part.store.name}${part.partNumber ? ` • ${part.partNumber}` : ''}` })))
}

export async function resolveStore(reference: NaturalReference, selection?: AISelectedEntity): Promise<EntityResolution> {
  const id = selectedId(selection, 'store') || reference.targetId
  if (id) {
    const store = await db.store.findUnique({ where: { id }, select: { id: true, name: true, verified: true } })
    return finish('store', 'المتجر', store ? [{ id: store.id, label: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر غير معتمد' }] : [])
  }
  const query = text(reference.storeName, reference.entityName, reference.name)
  if (!query) return finish('store', 'المتجر', [])
  const exact = await db.store.findMany({ where: { name: { equals: query, mode: 'insensitive' } }, select: { id: true, name: true, verified: true }, take: 6 })
  const rows = exact.length ? exact : await db.store.findMany({ where: { name: { contains: query, mode: 'insensitive' } }, select: { id: true, name: true, verified: true }, take: 6 })
  return finish('store', 'المتجر', rows.map((store) => ({ id: store.id, label: store.name, subtitle: store.verified ? 'متجر معتمد' : 'متجر غير معتمد' })))
}

export async function resolveCar(user: SessionUser, description?: string, targetId?: string, selection?: AISelectedEntity): Promise<EntityResolution> {
  const id = selectedId(selection, 'car') || targetId
  if (id) {
    const car = await db.userCar.findFirst({ where: { id, userId: user.id } })
    return finish('car', 'السيارة', car ? [{ id: car.id, label: car.nickname || `${car.brand} ${car.model}`, subtitle: `${car.brand} ${car.model}${car.year ? ` • ${car.year}` : ''}` }] : [])
  }
  const query = description?.trim()
  if (!query || ['الأساسية', 'الرئيسية', 'عربيتي', 'سيارتي', 'main', 'primary'].some((word) => query.toLowerCase().includes(word))) {
    const car = await db.userCar.findFirst({ where: { userId: user.id }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] })
    return finish('car', 'السيارة', car ? [{ id: car.id, label: car.nickname || `${car.brand} ${car.model}`, subtitle: `${car.brand} ${car.model}${car.year ? ` • ${car.year}` : ''}` }] : [])
  }
  const rows = await db.userCar.findMany({ where: { userId: user.id, OR: [{ nickname: { contains: query, mode: 'insensitive' } }, { brand: { contains: query, mode: 'insensitive' } }, { model: { contains: query, mode: 'insensitive' } }] }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }], take: 6 })
  return finish('car', 'السيارة', rows.map((car) => ({ id: car.id, label: car.nickname || `${car.brand} ${car.model}`, subtitle: `${car.brand} ${car.model}${car.year ? ` • ${car.year}` : ''}` })))
}

export async function resolveOrder(user: SessionUser, reference: NaturalReference, selection?: AISelectedEntity, adminScope = false): Promise<EntityResolution> {
  const id = selectedId(selection, 'order') || reference.targetId
  const owned = adminScope && user.role === 'ADMIN' ? {} : user.role === 'SHOP_OWNER' ? { store: { ownerId: user.id } } : { buyerId: user.id }
  if (id) {
    const order = await db.order.findFirst({ where: { id, ...owned }, include: { part: true, items: true, store: true } })
    return finish('order', 'الطلب', order ? [{ id: order.id, label: groupedOrderLabel(order), subtitle: `${order.store.name} • ${order.status} • ${order.createdAt.toLocaleDateString('ar-EG')}` }] : [])
  }
  const partQuery = reference.entityName?.trim() || reference.name?.trim()
  const storeQuery = reference.storeName?.trim()
  const description = reference.orderDescription?.replace(/(أحدث|احدث|آخر|اخر|أقدم|اقدم|طلب|الطلب|بتاع|خاص)/g, ' ').replace(/\s+/g, ' ').trim()
  const hasQuery = Boolean(partQuery || storeQuery || description)
  const range = dateRange(reference.date)
  const rows = await db.order.findMany({ where: { ...owned, ...(range ? { createdAt: range } : {}), ...(partQuery ? { OR: [{ part: { name: { contains: partQuery, mode: 'insensitive' } } }, { items: { some: { productName: { contains: partQuery, mode: 'insensitive' } } } }] } : {}), ...(storeQuery ? { store: { name: { contains: storeQuery, mode: 'insensitive' } } } : {}), ...(!partQuery && !storeQuery && description ? { OR: [{ part: { name: { contains: description, mode: 'insensitive' } } }, { items: { some: { productName: { contains: description, mode: 'insensitive' } } } }, { store: { name: { contains: description, mode: 'insensitive' } } }, { status: { equals: description, mode: 'insensitive' } }] } : {}) }, include: { part: true, items: true, store: true }, orderBy: { createdAt: reference.recency === 'oldest' ? 'asc' : 'desc' }, take: hasQuery || range ? 6 : 1 })
  return finish('order', 'الطلب', rows.map((order) => ({ id: order.id, label: groupedOrderLabel(order), subtitle: `${order.store.name} • ${order.status} • ${order.createdAt.toLocaleDateString('ar-EG')}` })))
}

export async function resolveSellerCoupon(user: SessionUser, query?: string, recency: 'latest' | 'oldest' = 'latest', selection?: AISelectedEntity): Promise<EntityResolution> {
  const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
  if (!store) return finish('coupon', 'الكوبون', [])
  const id = selectedId(selection, 'coupon')
  const rows = await db.coupon.findMany({ where: { storeId: store.id, ...(id ? { id } : query ? { code: { contains: query, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: recency === 'oldest' ? 'asc' : 'desc' }, take: id || !query ? 1 : 6 })
  return finish('coupon', 'الكوبون', rows.map((coupon) => ({ id: coupon.id, label: coupon.code, subtitle: `${coupon.active ? 'فعال' : 'متوقف'} • خصم ${coupon.discountPercent}% • ${coupon.usedCount}/${coupon.maxUses}` })))
}

export async function resolveSellerMessage(user: SessionUser, query?: string, recency: 'latest' | 'oldest' = 'latest', selection?: AISelectedEntity): Promise<EntityResolution> {
  const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
  if (!store) return finish('message', 'الرسالة', [])
  const id = selectedId(selection, 'message')
  const rows = await db.productMessage.findMany({ where: { part: { storeId: store.id }, ...(id ? { id } : query ? { OR: [{ message: { contains: query, mode: 'insensitive' } }, { part: { name: { contains: query, mode: 'insensitive' } } }, { sender: { name: { contains: query, mode: 'insensitive' } } }] } : {}) }, include: { part: true, sender: true }, orderBy: { createdAt: recency === 'oldest' ? 'asc' : 'desc' }, take: id || !query ? 1 : 6 })
  return finish('message', 'الرسالة', rows.map((message) => ({ id: message.id, label: `${message.part.name} — ${message.sender.name}`, subtitle: `${message.message.slice(0, 140)} • ${message.createdAt.toLocaleDateString('ar-EG')}` })))
}

export async function resolveAdminEntity(kind: Extract<AIEntityKind, 'user' | 'report' | 'verification' | 'dispute'>, reference: NaturalReference, selection?: AISelectedEntity): Promise<EntityResolution> {
  const id = selectedId(selection, kind) || reference.targetId
  const query = text(reference.entityName, reference.name, reference.storeName, reference.orderDescription)
  if (kind === 'user') {
    const rows = id
      ? await db.user.findMany({ where: { id }, select: { id: true, name: true, role: true, email: true, phone: true }, take: 1 })
      : query ? await db.user.findMany({ where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }] }, select: { id: true, name: true, role: true, email: true, phone: true }, take: 6 }) : []
    return finish('user', 'المستخدم', rows.map((item) => ({ id: item.id, label: item.name, subtitle: `${item.role} • ${maskEmail(item.email) || 'بدون بريد'} • ${maskPhone(item.phone) || 'بدون هاتف'}` })))
  }
  if (kind === 'verification') {
    const range = dateRange(reference.date)
    const rows = await db.sellerVerification.findMany({ where: { ...(id ? { id } : { status: 'PENDING', ...(range ? { submittedAt: range } : {}), ...(query ? { OR: [{ businessName: { contains: query, mode: 'insensitive' } }, { store: { name: { contains: query, mode: 'insensitive' } } }] } : {}) }) }, include: { store: true }, orderBy: { submittedAt: reference.recency === 'oldest' ? 'asc' : 'desc' }, take: query || id || range ? 6 : 1 })
    return finish('verification', 'طلب التوثيق', rows.map((item) => ({ id: item.id, label: item.businessName || item.store.name, subtitle: `${item.store.name} • ${item.status} • ${item.submittedAt.toLocaleDateString('ar-EG')}` })))
  }
  if (kind === 'dispute') {
    const range = dateRange(reference.date)
    const rows = await db.dispute.findMany({ where: { ...(id ? { id } : { status: 'OPEN', ...(range ? { createdAt: range } : {}), ...(query ? { OR: [{ reason: { contains: query, mode: 'insensitive' } }, { order: { OR: [{ part: { name: { contains: query, mode: 'insensitive' } } }, { items: { some: { productName: { contains: query, mode: 'insensitive' } } } }] } }, { store: { name: { contains: query, mode: 'insensitive' } } }] } : {}) }) }, include: { order: { include: { part: true, items: true } }, store: true }, orderBy: { createdAt: reference.recency === 'oldest' ? 'asc' : 'desc' }, take: query || id || range ? 6 : 1 })
    return finish('dispute', 'النزاع', rows.map((item) => ({ id: item.id, label: groupedOrderLabel(item.order), subtitle: `${item.store.name} • ${item.reason.slice(0, 80)} • ${item.createdAt.toLocaleDateString('ar-EG')}` })))
  }
  const range = dateRange(reference.date)
  const recent = await db.report.findMany({ where: id ? { id } : { status: 'OPEN', ...(range ? { createdAt: range } : {}) }, orderBy: { createdAt: reference.recency === 'oldest' ? 'asc' : 'desc' }, take: id ? 1 : query ? 30 : range ? 6 : 1 })
  const [parts, stores, users] = query ? await Promise.all([
    db.part.findMany({ where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { partNumber: { contains: query, mode: 'insensitive' } }, { oemNumber: { contains: query, mode: 'insensitive' } }] }, select: { id: true, name: true }, take: 20 }),
    db.store.findMany({ where: { name: { contains: query, mode: 'insensitive' } }, select: { id: true, name: true }, take: 20 }),
    db.user.findMany({ where: { name: { contains: query, mode: 'insensitive' } }, select: { id: true, name: true }, take: 20 }),
  ]) : [[], [], []]
  const targetNames = new Map<string, string>([...parts, ...stores, ...users].map((item) => [item.id, item.name]))
  const lowered = query.toLocaleLowerCase()
  const rows = query ? recent.filter((item) => targetNames.has(item.targetId) || item.reason.toLocaleLowerCase().includes(lowered) || item.details?.toLocaleLowerCase().includes(lowered) || item.targetType.toLocaleLowerCase() === lowered).slice(0, 6) : recent
  return finish('report', 'البلاغ', rows.map((item) => ({ id: item.id, label: targetNames.get(item.targetId) || item.reason, subtitle: `${item.reason} • ${item.status} • ${item.createdAt.toLocaleDateString('ar-EG')}` })))
}

export function resolutionEntity(result: EntityResolution) {
  return result.status === 'resolved' ? result.entity : null
}

export function resolutionCard(result: EntityResolution, kind: AIEntityKind, title: string): AIToolCard {
  if (result.status !== 'resolved') return result.card
  return {
    type: 'results',
    title,
    items: [{ id: `${kind}-${result.entity.id}`, title: result.entity.label, subtitle: result.entity.subtitle, select: { kind, id: result.entity.id, label: result.entity.label } }],
  }
}
