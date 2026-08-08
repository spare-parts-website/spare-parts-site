import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { deletePartWithDependencies } from '@/lib/admin-deletion'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { deleteUploadedFiles } from '@/lib/storage'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const brand = searchParams.get('brand') || ''
  const storeId = searchParams.get('storeId') || ''
  const id = searchParams.get('id')
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const carModel = searchParams.get('carModel') || ''
  const includeImages = searchParams.get('includeImages') === 'true'
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1
  const pageSize = 24
  const sort = searchParams.get('sort') || 'newest'

  if (id) {
    const part = await db.part.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            ownerId: true,
            owner: { select: { name: true, avatar: true } },
          },
        },
        reviews: {
          where: { blocked: false },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        images: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!part || part.blocked || isBlockedStoreName(part.store.name)) {
      return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    }
    const session = await getSession()
    const canReview = session && ['BUYER', 'SHOP_OWNER'].includes(session.role)
      ? Boolean(await db.order.findFirst({
          where: { buyerId: session.id, partId: part.id, status: { in: ['DELIVERED', 'RETURNED'] } },
          select: { id: true },
        }))
      : false
    return NextResponse.json(
      { part, canReview },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  const where: any = { blocked: false }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
      { brand: { contains: search } },
    ]
  }
  if (category) where.category = category
  if (brand) where.brand = brand
  if (storeId) where.storeId = storeId
  if (minPrice) where.price = { ...where.price, gte: parseFloat(minPrice) }
  if (maxPrice) where.price = { ...where.price, lte: parseFloat(maxPrice) }
  if (carModel) {
    // Search in carModels field (case-insensitive contains)
    where.carModels = { contains: carModel }
  }

  const orderBy = sort === 'price-asc'
    ? { price: 'asc' as const }
    : sort === 'price-desc'
      ? { price: 'desc' as const }
      : sort === 'name'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const }

  const [parts, total, categories, brands] = await Promise.all([
    db.part.findMany({
      where,
      select: {
        id: true, name: true, description: true, price: true, stock: true,
        category: true, brand: true, image: true, carModels: true,
        createdAt: true,
        store: {
          select: {
            id: true,
            name: true,
            image: true,
            owner: { select: { name: true, avatar: true } },
          },
        },
        ...(includeImages ? { images: { select: { id: true, url: true }, orderBy: { createdAt: 'asc' as const } } } : {}),
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.part.count({ where }),
    db.part.findMany({
      where: { blocked: false, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    }),
    db.part.findMany({
      where: { blocked: false, brand: { not: null } },
      distinct: ['brand'],
      select: { brand: true },
    }),
  ])

  const visibleParts = parts.filter((part) => !isBlockedStoreName(part.store.name))

    return NextResponse.json(
      {
        parts: visibleParts,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        categories: categories.map((c) => c.category).filter(Boolean),
        brands: brands.map((b) => b.brand).filter(Boolean),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل قطع الغيار' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const limit = rateLimit(`parts-create:${session.id}:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const { name, description, price, stock, category, brand, image, carModels, images } = body

    const galleryImages = Array.isArray(images)
      ? images.filter((url): url is string => typeof url === 'string' && /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[A-Za-z0-9._-]+$/.test(url)).slice(0, 3)
      : []
    if (Array.isArray(images) && galleryImages.length !== Math.min(images.length, 3)) {
      return NextResponse.json({ error: 'روابط الصور غير صالحة' }, { status: 400 })
    }

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || price == null) {
      return NextResponse.json({ error: 'الاسم والسعر مطلوبان' }, { status: 400 })
    }
    const numericPrice = Number(price)
    const numericStock = Number(stock ?? 0)
    if (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 100000000 || !Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000) {
      return NextResponse.json({ error: 'السعر أو المخزون غير صالح' }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) {
      return NextResponse.json({ error: 'ليس لديك متجر' }, { status: 400 })
    }

    const part = await db.part.create({
      data: {
        name: name.trim(),
        description: typeof description === 'string' ? description.trim().slice(0, 5000) || null : null,
        price: numericPrice,
        stock: numericStock,
        category: category || null,
        brand: brand || null,
        image: image || null,
        carModels: carModels || null,
        storeId: store.id,
        images: { create: galleryImages.map((url) => ({ url })) },
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
    const { id, name, description, price, stock, category, brand, image, carModels } = body

    const part = await db.part.findUnique({ where: { id }, include: { store: true } })
    if (!part) {
      return NextResponse.json({ error: 'قطعة الغيار غير موجودة' }, { status: 404 })
    }

    const numericPrice = price != null ? Number(price) : undefined
    const numericStock = stock != null ? Number(stock) : undefined
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160)) return NextResponse.json({ error: 'اسم القطعة غير صالح' }, { status: 400 })
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 100000000)) return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
    if (numericStock !== undefined && (!Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000)) return NextResponse.json({ error: 'المخزون غير صالح' }, { status: 400 })

    // Only shop owner of this part's store OR admin can edit
    const isOwner = session.role === 'SHOP_OWNER' && part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const updated = await db.part.update({
      where: { id },
      data: {
        name: typeof name === 'string' ? name.trim() : undefined,
        description: description !== undefined ? (description || null) : undefined,
        price: numericPrice,
        stock: numericStock,
        category: category !== undefined ? (category || null) : undefined,
        brand: brand !== undefined ? (brand || null) : undefined,
        image: image !== undefined ? (image || null) : undefined,
        carModels: carModels !== undefined ? (carModels || null) : undefined,
      },
    })

    if (image !== undefined && image !== part.image) await deleteUploadedFiles([part.image])

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
