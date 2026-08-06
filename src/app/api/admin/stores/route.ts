import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { deleteStoreWithDependencies } from '@/lib/admin-deletion'
import { deleteUploadedFiles } from '@/lib/storage'

export async function GET() {
  try {
    await requireRole('ADMIN')
    const stores = await db.store.findMany({
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { parts: true, orders: true, reviews: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const storesWithRating = await Promise.all(stores.map(async (store) => {
      const reviews = await db.storeReview.findMany({ where: { storeId: store.id }, select: { rating: true } })
      const avgRating = reviews.length
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0
      return { ...store, avgRating }
    }))

    return NextResponse.json({ stores: storesWithRating })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'معرف المتجر مطلوب' }, { status: 400 })

    const store = await db.store.findUnique({ where: { id }, select: { id: true, ownerId: true, image: true, parts: { select: { image: true, images: { select: { url: true } } } } } })
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    if (store.ownerId === session.id) {
      return NextResponse.json({ error: 'لا يمكنك حذف متجرك من حساب المدير الحالي' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      await deleteStoreWithDependencies(tx, id)
      await tx.user.updateMany({ where: { id: store.ownerId, role: 'SHOP_OWNER' }, data: { role: 'BUYER' } })
    })
    await deleteUploadedFiles([
      store.image,
      ...store.parts.flatMap((part) => [part.image, ...part.images.map((image) => image.url)]),
    ])

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (e.message === 'STORE_HAS_ORDERS') {
      return NextResponse.json({ error: 'لا يمكن حذف متجر لديه طلبات. احفظ سجل الطلبات أولاً.' }, { status: 409 })
    }
    console.error(e)
    return NextResponse.json({ error: 'تعذر حذف المتجر' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id || typeof body.verified !== 'boolean') return NextResponse.json({ error: 'بيانات التحقق غير صحيحة' }, { status: 400 })
    const store = await db.store.update({ where: { id }, data: { verified: body.verified } })
    return NextResponse.json({ store })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحديث حالة المتجر' }, { status: 500 })
  }
}
