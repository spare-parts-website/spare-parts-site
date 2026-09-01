import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'
import { deletePartWithDependencies } from '@/lib/admin-deletion'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { deleteUploadedFiles } from '@/lib/storage'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '@/lib/vehicle-compatibility'
import { audit } from '@/lib/audit'
import { getPublicPart, getPublicPartsList } from '@/lib/public-marketplace'

const UPLOAD_URL = /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[A-Za-z0-9._-]+$/

function validGallery(value: unknown) {
  return Array.isArray(value) && value.length <= 4 && new Set(value).size === value.length && value.every((url) => typeof url === 'string' && UPLOAD_URL.test(url))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const brand = searchParams.get('brand') || ''
    const condition = searchParams.get('condition') || ''
    const id = searchParams.get('id')
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1
    const mine = searchParams.get('scope') === 'mine'
    const sort = searchParams.get('sort') || 'newest'

    if (id) {
      const result = await getPublicPart(id, await getSession())
      if (!result.part) return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    if (!mine) {
      const carId = searchParams.get('carId') || ''
      const result = await getPublicPartsList({
        search,
        category,
        brand,
        condition,
        storeId: searchParams.get('storeId') || '',
        minPrice: searchParams.get('minPrice'),
        maxPrice: searchParams.get('maxPrice'),
        carModel: searchParams.get('carModel') || '',
        carId,
        sort,
        page,
      }, carId ? await getSession() : null)
      return NextResponse.json(result, {
        headers: { 'Cache-Control': carId ? 'no-store, max-age=0' : 'public, s-maxage=30, stale-while-revalidate=120' },
      })
    }

    const session = await getSession()
    if (!session || session.role !== 'SHOP_OWNER') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    const store = await db.store.findUnique({ where: { ownerId: session.id }, select: { id: true } })
    const pageSize = 100
    if (!store) return NextResponse.json({ parts: [], pagination: { page: 1, pageSize, total: 0, totalPages: 1 }, categories: [], brands: [], conditions: [] })
    const where: Record<string, unknown> = { storeId: store.id }
    if (search) where.OR = [{ name: { contains: search } }, { description: { contains: search } }, { brand: { contains: search } }, { condition: { contains: search } }, { partNumber: { contains: search } }, { oemNumber: { contains: search } }, { searchAliases: { contains: search } }]
    if (category) where.category = category
    if (brand) where.brand = brand
    if (condition) where.condition = condition
    const orderBy = sort === 'price-asc' ? { price: 'asc' as const } : sort === 'price-desc' ? { price: 'desc' as const } : sort === 'name' ? { name: 'asc' as const } : { createdAt: 'desc' as const }
    const [parts, total] = await Promise.all([
      db.part.findMany({ where, include: { images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, compatibilities: true, store: { select: { id: true, name: true, image: true } } }, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      db.part.count({ where }),
    ])
    return NextResponse.json({ parts, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, categories: [], brands: [], conditions: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل قطع الغيار' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const limit = await rateLimit(`parts-create:${session.id}:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const { name, description, price, stock, category, brand, condition, image, images, carModels, compatibilities: compatibilityEntries, universal, fitmentNotes, partNumber, oemNumber, searchAliases } = body

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || price == null) {
      return NextResponse.json({ error: 'الاسم والسعر مطلوبان' }, { status: 400 })
    }
    if (typeof condition !== 'string' || condition.trim().length < 1 || condition.trim().length > 120) return NextResponse.json({ error: 'حالة المنتج مطلوبة وبحد أقصى 120 حرفاً' }, { status: 400 })
    const numericPrice = Number(price)
    const numericStock = Number(stock ?? 0)
    if (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 100000000 || !Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000) {
      return NextResponse.json({ error: 'السعر أو المخزون غير صالح' }, { status: 400 })
    }
    if (images !== undefined && !validGallery(images)) return NextResponse.json({ error: 'يمكن إضافة حتى 4 صور صالحة للقطعة.' }, { status: 400 })
    if (image !== undefined && image !== null && (typeof image !== 'string' || !UPLOAD_URL.test(image))) return NextResponse.json({ error: 'رابط الصورة الرئيسية غير صالح' }, { status: 400 })
    if (universal !== undefined && typeof universal !== 'boolean') return NextResponse.json({ error: 'نوع التوافق غير صالح' }, { status: 400 })
    if (fitmentNotes !== undefined && typeof fitmentNotes !== 'string') return NextResponse.json({ error: 'ملاحظات التوافق غير صالحة' }, { status: 400 })

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) {
      return NextResponse.json({ error: 'ليس لديك متجر' }, { status: 400 })
    }

    const gallery = Array.isArray(images) ? images : image ? [image] : []
    const compatibilitySource = compatibilityEntries !== undefined ? compatibilityEntries : carModels
    const compatibilities = universal ? [] : parseVehicleCompatibility(compatibilitySource)
    const legacyCarModels = universal ? null : serializeLegacyCompatibility(compatibilitySource)
    const part = await db.part.create({
      data: {
        name: name.trim(),
        description: typeof description === 'string' ? description.trim().slice(0, 5000) || null : null,
        price: numericPrice,
        stock: numericStock,
        category: category || null,
        brand: brand || null,
        partNumber: typeof partNumber === 'string' ? partNumber.trim().slice(0, 100) || null : null,
        oemNumber: typeof oemNumber === 'string' ? oemNumber.trim().slice(0, 100) || null : null,
        searchAliases: typeof searchAliases === 'string' ? searchAliases.trim().slice(0, 500) || null : null,
        condition: condition.trim(),
        universal: Boolean(universal),
        fitmentNotes: typeof fitmentNotes === 'string' ? fitmentNotes.trim().slice(0, 1000) || null : null,
        image: gallery[0] || null,
        carModels: legacyCarModels,
        storeId: store.id,
        images: gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined,
        compatibilities: compatibilities.length ? { create: compatibilities } : undefined,
      },
    })

    return NextResponse.json({ part })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await req.json()
    const { id, name, description, price, stock, category, brand, condition, image, images, carModels, compatibilities: compatibilityEntries, universal, fitmentNotes, partNumber, oemNumber, searchAliases } = body

    const part = await db.part.findUnique({ where: { id }, include: { store: true, images: true } })
    if (!part) {
      return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    }

    const numericPrice = price != null ? Number(price) : undefined
    const numericStock = stock != null ? Number(stock) : undefined
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160)) return NextResponse.json({ error: 'اسم القطعة غير صالح' }, { status: 400 })
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 100000000)) return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
    if (numericStock !== undefined && (!Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000)) return NextResponse.json({ error: 'المخزون غير صالح' }, { status: 400 })
    if (typeof condition !== 'string' || condition.trim().length < 1 || condition.trim().length > 120) return NextResponse.json({ error: 'حالة المنتج مطلوبة وبحد أقصى 120 حرفاً' }, { status: 400 })
    if (images !== undefined && !validGallery(images)) return NextResponse.json({ error: 'يمكن إضافة حتى 4 صور صالحة للقطعة.' }, { status: 400 })
    if (image !== undefined && image !== null && (typeof image !== 'string' || !UPLOAD_URL.test(image))) return NextResponse.json({ error: 'رابط الصورة الرئيسية غير صالح' }, { status: 400 })
    if (universal !== undefined && typeof universal !== 'boolean') return NextResponse.json({ error: 'نوع التوافق غير صالح' }, { status: 400 })
    if (fitmentNotes !== undefined && typeof fitmentNotes !== 'string') return NextResponse.json({ error: 'ملاحظات التوافق غير صالحة' }, { status: 400 })

    // Only shop owner of this part's store OR admin can edit
    const isOwner = session.role === 'SHOP_OWNER' && part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const gallery = Array.isArray(images) ? images : undefined
    const compatibilitySource = compatibilityEntries !== undefined ? compatibilityEntries : carModels
    const replaceCompatibilities = compatibilityEntries !== undefined || carModels !== undefined || universal === true
    const compatibilities = replaceCompatibilities ? (universal ? [] : parseVehicleCompatibility(compatibilitySource)) : null
    const legacyCarModels = replaceCompatibilities ? (universal ? null : serializeLegacyCompatibility(compatibilitySource)) : undefined
    const updated = await db.$transaction(async (tx) => {
      if (gallery) await tx.partImage.deleteMany({ where: { partId: id } })
      if (compatibilities) await tx.vehicleCompatibility.deleteMany({ where: { partId: id } })
      return tx.part.update({
        where: { id },
        data: {
          name: typeof name === 'string' ? name.trim() : undefined,
          description: description !== undefined ? (description || null) : undefined,
          price: numericPrice,
          stock: numericStock,
          category: category !== undefined ? (category || null) : undefined,
          brand: brand !== undefined ? (brand || null) : undefined,
          partNumber: partNumber !== undefined ? String(partNumber).trim().slice(0, 100) || null : undefined,
          oemNumber: oemNumber !== undefined ? String(oemNumber).trim().slice(0, 100) || null : undefined,
          searchAliases: searchAliases !== undefined ? String(searchAliases).trim().slice(0, 500) || null : undefined,
          condition: condition.trim(),
          universal: typeof universal === 'boolean' ? universal : undefined,
          fitmentNotes: fitmentNotes !== undefined ? fitmentNotes.trim().slice(0, 1000) || null : undefined,
          image: gallery ? gallery[0] || null : image !== undefined ? image || null : undefined,
          carModels: legacyCarModels,
          images: gallery && gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined,
          compatibilities: compatibilities?.length ? { create: compatibilities } : undefined,
        },
      })
    })

    if (gallery) {
      const oldUrls = [part.image, ...part.images.map((partImage) => partImage.url)].filter(Boolean) as string[]
      await deleteUploadedFiles(oldUrls.filter((url) => !gallery.includes(url)))
    } else if (image !== undefined && image !== part.image) {
      await deleteUploadedFiles([part.image])
    }
    if (isAdmin) await audit({ actorId: session.id, action: 'ADMIN_PART_UPDATED', targetType: 'part', targetId: id })

    return NextResponse.json({ part: updated })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'معرف قطعة الغيار مطلوب' }, { status: 400 })
    }

    const part = await db.part.findUnique({ where: { id }, include: { store: true } })
    if (!part) {
      return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    }

    const isOwner = session.role === 'SHOP_OWNER' && part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const media = await db.part.findUnique({ where: { id }, select: { image: true, images: { select: { url: true } } } })
    await db.$transaction((tx) => deletePartWithDependencies(tx, id))
    await deleteUploadedFiles([media?.image, ...(media?.images || []).map((image) => image.url)])

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'PART_HAS_ORDERS') {
      return NextResponse.json({ error: 'لا يمكن حذف قطعة مرتبطة بطلبات. احفظ سجل الطلبات أولاً.' }, { status: 409 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
