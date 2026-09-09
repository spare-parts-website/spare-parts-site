import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminStepUp, requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeMarketplaceBrand, normalizeMarketplaceCategory, normalizeMarketplaceCondition } from '@/lib/marketplace-taxonomy'
import { parseVehicleCompatibility } from '@/lib/vehicle-compatibility'
import { isPublicUploadUrl } from '@/lib/storage-url'
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
function validGallery(value: unknown) { return Array.isArray(value) && value.length <= 4 && new Set(value).size === value.length && value.every(isPublicUploadUrl) }

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN'); const url = new URL(req.url); const id = url.searchParams.get('id')?.trim()
    if (id) { const part = await db.part.findUnique({ where: { id }, include: { store: { select: { id: true, name: true } }, images: { orderBy: { position: 'asc' } }, compatibilities: { orderBy: [{ make: 'asc' }, { model: 'asc' }] } } }); return part ? NextResponse.json({ part }, { headers: PRIVATE_HEADERS }) : NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404, headers: PRIVATE_HEADERS }) }
    const limit = parseLimit(url.searchParams.get('limit'), 25, 100); const cursor = decodeCursor(url.searchParams.get('cursor')); const search = (url.searchParams.get('search') || '').trim().slice(0, 120); const blocked = url.searchParams.get('blocked'); const moderationStatus = (url.searchParams.get('status') || '').trim().toUpperCase()
    const base: Prisma.PartWhereInput = {}; if (search) base.OR = [{ name: { contains: search, mode: 'insensitive' } }, { partNumber: { contains: search, mode: 'insensitive' } }, { oemNumber: { contains: search, mode: 'insensitive' } }, { store: { name: { contains: search, mode: 'insensitive' } } }]; if (['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'BLOCKED'].includes(moderationStatus)) base.moderationStatus = moderationStatus; else if (blocked === 'true') base.moderationStatus = 'BLOCKED'; else if (blocked === 'false') base.moderationStatus = 'ACTIVE'
    const where: Prisma.PartWhereInput = { ...base }; const before = keysetBefore(cursor); if (before) where.AND = [before]
    const [rows,total] = await Promise.all([db.part.findMany({ where, select: { id: true, name: true, price: true, stock: true, category: true, brand: true, condition: true, image: true, blocked: true, moderationStatus: true, moderationReason: true, moderatedAt: true, createdAt: true, store: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }), db.part.count({ where: base })]); const parts = rows.slice(0, limit)
    return NextResponse.json({ parts, total, nextCursor: rows.length > limit && parts.length ? encodeCursor(parts[parts.length - 1]) : null }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json(); const { id, blocked } = body
    const requestedStatus = typeof body.moderationStatus === 'string' ? body.moderationStatus.trim().toUpperCase() : blocked ? 'BLOCKED' : 'ACTIVE'
    if (!['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'BLOCKED'].includes(requestedStatus)) return NextResponse.json({ error: 'حالة مراجعة القطعة غير صالحة' }, { status: 400 })
    const target = await db.part.findUnique({ where: { id }, select: { id: true, storeId: true, store: { select: { ownerId: true } } } })
    if (!target) return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : undefined
    const part = await db.part.update({ where: { id }, data: { moderationStatus: requestedStatus, blocked: requestedStatus === 'BLOCKED', moderationReason: reason, moderatedAt: new Date(), moderatedById: session.id } })
    const action = requestedStatus === 'BLOCKED' ? 'ADMIN_PART_BLOCKED' : requestedStatus === 'ACTIVE' ? 'ADMIN_PART_UNBLOCKED' : 'ADMIN_PART_MODERATED'
    await audit({ actorId: session.id, action, targetType: 'part', targetId: id, metadata: { storeId: target.storeId, sellerId: target.store.ownerId, moderationStatus: requestedStatus, reason: reason ?? null } })
    return NextResponse.json({ part })
  }
  catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل تعديل حالة قطعة.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json(); const sellerId = typeof body.sellerId === 'string' ? body.sellerId.trim() : ''; const requestedStoreId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    const store = requestedStoreId ? await db.store.findUnique({ where: { id: requestedStoreId }, select: { id: true, ownerId: true, owner: { select: { role: true } } } }) : sellerId ? await db.store.findUnique({ where: { ownerId: sellerId }, select: { id: true, ownerId: true, owner: { select: { role: true } } } }) : null
    if (!store || store.owner.role !== 'SHOP_OWNER' || (sellerId && store.ownerId !== sellerId)) return NextResponse.json({ error: 'متجر البائع مطلوب' }, { status: 400 })
    const name = typeof body.name === 'string' ? body.name.trim() : ''; const condition = typeof body.condition === 'string' ? body.condition.trim() : ''; const price = Number(body.price); const stock = Number(body.stock ?? 0)
    if (name.length < 2 || name.length > 160 || !condition || condition.length > 120) return NextResponse.json({ error: 'اسم القطعة وحالتها مطلوبة' }, { status: 400 }); if (!Number.isFinite(price) || price <= 0 || price > 100000000) return NextResponse.json({ error: 'يجب أن يكون سعر المنتج أكبر من صفر.' }, { status: 400 }); if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return NextResponse.json({ error: 'المخزون غير صالح' }, { status: 400 }); if (body.images !== undefined && !validGallery(body.images)) return NextResponse.json({ error: 'يمكن إضافة حتى 4 صور صالحة للقطعة.' }, { status: 400 }); if (body.image !== undefined && body.image !== null && !isPublicUploadUrl(body.image)) return NextResponse.json({ error: 'رابط الصورة غير صالح' }, { status: 400 }); if (body.universal !== undefined && typeof body.universal !== 'boolean') return NextResponse.json({ error: 'نوع التوافق غير صالح' }, { status: 400 })
    const gallery = Array.isArray(body.images) ? body.images : body.image ? [body.image] : []; const universal = Boolean(body.universal); const compatibilitySource = body.compatibilities !== undefined ? body.compatibilities : body.carModels; const compatibilities = universal ? [] : parseVehicleCompatibility(compatibilitySource)
    const part = await db.part.create({ data: { name, description: typeof body.description === 'string' ? body.description.trim().slice(0, 5000) || null : null, price, stock, category: normalizeMarketplaceCategory(body.category) || null, brand: normalizeMarketplaceBrand(body.brand) || null, condition: normalizeMarketplaceCondition(condition), partNumber: typeof body.partNumber === 'string' ? body.partNumber.trim().slice(0, 100) || null : null, oemNumber: typeof body.oemNumber === 'string' ? body.oemNumber.trim().slice(0, 100) || null : null, searchAliases: typeof body.searchAliases === 'string' ? body.searchAliases.trim().slice(0, 500) || null : null, universal, fitmentNotes: typeof body.fitmentNotes === 'string' ? body.fitmentNotes.trim().slice(0, 1000) || null : null, image: gallery[0] || null, storeId: store.id, images: gallery.length > 1 ? { create: gallery.slice(1).map((url: string, index: number) => ({ url, position: index + 1 })) } : undefined, compatibilities: compatibilities.length ? { create: compatibilities } : undefined } }); await audit({ actorId: session.id, action: 'ADMIN_PART_CREATED', targetType: 'part', targetId: part.id, metadata: { storeId: store.id, sellerId: store.ownerId } }); return NextResponse.json({ part }, { status: 201 })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل إنشاء عرض نيابة عن بائع.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'تعذر إنشاء العرض' }, { status: 500 }) }
}
