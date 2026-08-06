import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireRole } from '@/lib/auth'
import { isBlockedStoreName } from '@/lib/store-moderation'

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

  if (id) {
    const part = await db.part.findUnique({
      where: { id },
      include: {
        store: {
          select: { id: true, name: true, address: true, phone: true },
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
    return NextResponse.json(
      { part },
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

  const parts = await db.part.findMany({
    where,
    include: {
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get categories and brands for filters
  const visibleParts = parts.filter((part) => !isBlockedStoreName(part.store.name))

  const categories = await db.part.findMany({
    where: { blocked: false, category: { not: null } },
    distinct: ['category'],
    select: { category: true },
  })
  const brands = await db.part.findMany({
    where: { blocked: false, brand: { not: null } },
    distinct: ['brand'],
    select: { brand: true },
  })

    return NextResponse.json(
      {
        parts: visibleParts,
        categories: categories.map((c) => c.category).filter(Boolean),
        brands: brands.map((b) => b.brand).filter(Boolean),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل قطع الغيار' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const body = await req.json()
    const { name, description, price, stock, category, brand, image, carModels } = body

    if (!name || price == null) {
      return NextResponse.json({ error: 'الاسم والسعر مطلوبان' }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) {
      return NextResponse.json({ error: 'ليس لديك متجر' }, { status: 400 })
    }

    const part = await db.part.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price),
        stock: parseInt(stock) || 0,
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

    // Only shop owner of this part's store OR admin can edit
    const isOwner = session.role === 'SHOP_OWNER' && part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const updated = await db.part.update({
      where: { id },
      data: {
        name: name ?? undefined,
        description: description !== undefined ? (description || null) : undefined,
        price: price != null ? parseFloat(price) : undefined,
        stock: stock != null ? parseInt(stock) : undefined,
        category: category !== undefined ? (category || null) : undefined,
        brand: brand !== undefined ? (brand || null) : undefined,
        image: image !== undefined ? (image || null) : undefined,
        carModels: carModels !== undefined ? (carModels || null) : undefined,
      },
    })

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

    // Admin can either block (toggle) or hard delete; shop owner can delete own parts
    if (isAdmin) {
      await db.part.delete({ where: { id } })
    } else {
      await db.part.delete({ where: { id } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
