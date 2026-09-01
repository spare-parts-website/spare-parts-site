import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeMarketplaceBrand, normalizeMarketplaceCategory, normalizeMarketplaceCondition } from '@/lib/marketplace-taxonomy'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '@/lib/vehicle-compatibility'

const UPLOAD_URL = /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[A-Za-z0-9._-]+$/

function validGallery(value: unknown) {
  return Array.isArray(value) && value.length <= 4 && new Set(value).size === value.length && value.every((url) => typeof url === 'string' && UPLOAD_URL.test(url))
}

// Block / unblock parts
export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json()
    const { id, blocked } = body
    const target = await db.part.findUnique({ where: { id }, select: { id: true, storeId: true, store: { select: { ownerId: true } } } })
    if (!target) return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    const part = await db.part.update({
      where: { id },
      data: { blocked: !!blocked },
    })
    await audit({ actorId: session.id, action: blocked ? 'ADMIN_PART_BLOCKED' : 'ADMIN_PART_UNBLOCKED', targetType: 'part', targetId: id, metadata: { storeId: target.storeId, sellerId: target.store.ownerId } })
    return NextResponse.json({ part })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

/** Create an offer on behalf of a seller without changing its owning store. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json()
    const sellerId = typeof body.sellerId === 'string' ? body.sellerId.trim() : ''
    const requestedStoreId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    const store = requestedStoreId
      ? await db.store.findUnique({ where: { id: requestedStoreId }, select: { id: true, ownerId: true, owner: { select: { role: true } } } })
      : sellerId
        ? await db.store.findUnique({ where: { ownerId: sellerId }, select: { id: true, ownerId: true, owner: { select: { role: true } } } })
        : null
    if (!store || store.owner.role !== 'SHOP_OWNER' || (sellerId && store.ownerId !== sellerId)) return NextResponse.json({ error: 'متجر البائع مطلوب' }, { status: 400 })

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const condition = typeof body.condition === 'string' ? body.condition.trim() : ''
    const price = Number(body.price)
    const stock = Number(body.stock ?? 0)
    if (name.length < 2 || name.length > 160 || !condition || condition.length > 120) return NextResponse.json({ error: 'اسم القطعة وحالتها مطلوبة' }, { status: 400 })
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) return NextResponse.json({ error: 'يجب أن يكون سعر المنتج أكبر من صفر.' }, { status: 400 })
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return NextResponse.json({ error: 'المخزون غير صالح' }, { status: 400 })
    if (body.images !== undefined && !validGallery(body.images)) return NextResponse.json({ error: 'يمكن إضافة حتى 4 صور صالحة للقطعة.' }, { status: 400 })
    if (body.image !== undefined && body.image !== null && (typeof body.image !== 'string' || !UPLOAD_URL.test(body.image))) return NextResponse.json({ error: 'رابط الصورة غير صالح' }, { status: 400 })
    if (body.universal !== undefined && typeof body.universal !== 'boolean') return NextResponse.json({ error: 'نوع التوافق غير صالح' }, { status: 400 })

    const gallery = Array.isArray(body.images) ? body.images : body.image ? [body.image] : []
    const universal = Boolean(body.universal)
    const compatibilitySource = body.compatibilities !== undefined ? body.compatibilities : body.carModels
    const compatibilities = universal ? [] : parseVehicleCompatibility(compatibilitySource)
    const part = await db.part.create({
      data: {
        name,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 5000) || null : null,
        price,
        stock,
        category: normalizeMarketplaceCategory(body.category) || null,
        brand: normalizeMarketplaceBrand(body.brand) || null,
        condition: normalizeMarketplaceCondition(condition),
        partNumber: typeof body.partNumber === 'string' ? body.partNumber.trim().slice(0, 100) || null : null,
        oemNumber: typeof body.oemNumber === 'string' ? body.oemNumber.trim().slice(0, 100) || null : null,
        searchAliases: typeof body.searchAliases === 'string' ? body.searchAliases.trim().slice(0, 500) || null : null,
        universal,
        fitmentNotes: typeof body.fitmentNotes === 'string' ? body.fitmentNotes.trim().slice(0, 1000) || null : null,
        image: gallery[0] || null,
        carModels: universal ? null : serializeLegacyCompatibility(compatibilitySource),
        storeId: store.id,
        images: gallery.length > 1 ? { create: gallery.slice(1).map((url: string, index: number) => ({ url, position: index + 1 })) } : undefined,
        compatibilities: compatibilities.length ? { create: compatibilities } : undefined,
      },
    })
    await audit({ actorId: session.id, action: 'ADMIN_PART_CREATED', targetType: 'part', targetId: part.id, metadata: { storeId: store.id, sellerId: store.ownerId } })
    return NextResponse.json({ part }, { status: 201 })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error(e)
    return NextResponse.json({ error: 'تعذر إنشاء العرض' }, { status: 500 })
  }
}

// Get all parts (including blocked) for admin
export async function GET() {
  try {
    await requireRole('ADMIN')
    const parts = await db.part.findMany({
      include: {
        store: { select: { id: true, name: true } },
        images: { select: { url: true, position: true }, orderBy: { position: 'asc' } },
        compatibilities: { orderBy: [{ make: 'asc' }, { model: 'asc' }] },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ parts })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
