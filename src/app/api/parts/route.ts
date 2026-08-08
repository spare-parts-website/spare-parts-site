import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { deletePartWithDependencies } from '@/lib/admin-deletion'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { deleteUploadedFiles } from '@/lib/storage'
import { ensurePartImagesTable } from '@/lib/part-images'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function uploadPartImage(file: File) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase Storage environment variables are missing')

  const input = Buffer.from(await file.arrayBuffer())
  const output = await sharp(input)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toBuffer()
  const filename = `${Date.now()}-${randomUUID()}.webp`
  const bucket = 'uploads'
  const baseUrl = supabaseUrl.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${filename}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'image/webp',
      'x-upsert': 'false',
    },
    body: new Uint8Array(output),
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`)
  return `${baseUrl}/storage/v1/object/public/${bucket}/${filename}`
}

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
    await ensurePartImagesTable()
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
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const name = formData.get('name')
      const description = formData.get('description')
      const price = formData.get('price')
      const stock = formData.get('stock')
      const category = formData.get('category')
      const brand = formData.get('brand')
      const carModels = formData.get('carModels')
      const parsedMainIndex = Number.parseInt(String(formData.get('mainIndex') || '0'), 10)
      const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File)

      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || price == null) {
        return NextResponse.json({ error: 'الاسم والسعر مطلوبان' }, { status: 400 })
      }
      if (files.length > 4) return NextResponse.json({ error: 'يمكن رفع 4 صور كحد أقصى' }, { status: 400 })
      for (const file of files) {
        if (!ALLOWED_IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: 'صيغة الصورة غير مدعومة' }, { status: 400 })
        if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'حجم كل صورة يجب أن يكون أقل من 4 ميجا' }, { status: 400 })
      }

      const numericPrice = Number(price)
      const numericStock = Number(stock || 0)
      if (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 100000000 || !Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000) {
        return NextResponse.json({ error: 'السعر أو المخزون غير صالح' }, { status: 400 })
      }
      const store = await db.store.findUnique({ where: { ownerId: session.id } })
      if (!store) return NextResponse.json({ error: 'ليس لديك متجر' }, { status: 400 })

      const uploadedUrls: string[] = []
      try {
        for (const file of files) uploadedUrls.push(await uploadPartImage(file))
        const mainIndex = uploadedUrls.length > 0 && parsedMainIndex >= 0 && parsedMainIndex < uploadedUrls.length ? parsedMainIndex : 0
        const mainImage = uploadedUrls[mainIndex] || null
        const galleryImages = uploadedUrls.filter((_, index) => index !== mainIndex)
        if (galleryImages.length > 0) await ensurePartImagesTable()
        const part = await db.part.create({
          data: {
            name: name.trim(),
            description: typeof description === 'string' ? description.trim().slice(0, 5000) || null : null,
            price: numericPrice,
            stock: numericStock,
            category: typeof category === 'string' ? category || null : null,
            brand: typeof brand === 'string' ? brand || null : null,
            image: mainImage,
            carModels: typeof carModels === 'string' ? carModels || null : null,
            storeId: store.id,
            images: { create: galleryImages.map((url) => ({ url })) },
          },
          include: { images: true },
        })
        return NextResponse.json({ part })
      } catch (error) {
        if (uploadedUrls.length > 0) await deleteUploadedFiles(uploadedUrls)
        throw error
      }
    }

    const body = await req.json()
    const { name, description, price, stock, category, brand, image, carModels } = body

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
