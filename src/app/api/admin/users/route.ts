import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { deleteUserWithDependencies } from '@/lib/admin-deletion'

export async function GET() {
  try {
    await requireRole('ADMIN')
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
        _count: {
          select: { orders: true, productReviews: true, storeReviews: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ users })
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
    const session = await requireRole('ADMIN')
    const body = await req.json()
    const { id, role } = body
    if (!['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 })
    }
    if (id === session.id) return NextResponse.json({ error: 'لا يمكنك تغيير دور حساب المدير الحالي' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id }, include: { store: { select: { id: true } } } })
    if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    if (target.role === 'SHOP_OWNER' && role !== 'SHOP_OWNER' && target.store) {
      return NextResponse.json({ error: 'احذف أو انقل المتجر قبل تغيير دور صاحبه' }, { status: 409 })
    }
    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const admins = await db.user.count({ where: { role: 'ADMIN' } })
      if (admins <= 1) return NextResponse.json({ error: 'يجب أن يبقى مدير واحد على الأقل' }, { status: 409 })
    }
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id },
        data: { role },
        select: { id: true, name: true, email: true, role: true, phone: true },
      })
      if (role === 'SHOP_OWNER' && !target.store) {
        await tx.store.create({ data: { name: `متجر ${next.name}`, description: '', ownerId: next.id } })
      }
      return next
    })
    return NextResponse.json({ user: updated })
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
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'المعرف مطلوب' }, { status: 400 })
    }
    if (id === session.id) {
      return NextResponse.json({ error: 'لا يمكنك حذف حساب المدير الذي تستخدمه حالياً' }, { status: 400 })
    }
    await db.$transaction((tx) => deleteUserWithDependencies(tx, id))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (e.message === 'USER_HAS_ORDERS' || e.message === 'STORE_HAS_ORDERS') {
      return NextResponse.json({ error: 'لا يمكن حذف مستخدم لديه طلبات محفوظة. احفظ سجل الطلبات أولاً.' }, { status: 409 })
    }
    console.error(e)
    return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 500 })
  }
}
