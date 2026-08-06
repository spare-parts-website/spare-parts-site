import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'

// GET - list coupons for a store (shop owner) or validate a coupon (buyer)
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const code = searchParams.get('code')?.trim().toUpperCase()

    // Validate a coupon by code (for buyer at checkout)
    if (code) {
      const coupon = await db.coupon.findUnique({
        where: { code },
        include: { store: { select: { id: true, name: true } } },
      })
      if (!coupon || !coupon.active) {
        return NextResponse.json({ valid: false, error: 'الكوبون غير صالح' })
      }
      if (coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json({ valid: false, error: 'انتهت صلاحية الكوبون' })
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return NextResponse.json({ valid: false, error: 'انتهت صلاحية الكوبون' })
      }
      return NextResponse.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountPercent: coupon.discountPercent,
          storeId: coupon.storeId,
          storeName: coupon.store.name,
        },
      })
    }

    // List coupons for shop owner
    if (session.role === 'SHOP_OWNER') {
      const store = await db.store.findUnique({ where: { ownerId: session.id } })
      if (!store) return NextResponse.json({ coupons: [] })
      const coupons = await db.coupon.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ coupons })
    }

    if (session.role === 'ADMIN') {
      const coupons = await db.coupon.findMany({
        include: { store: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ coupons })
    }

    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// POST - create coupon (shop owner only)
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const { code, discountPercent, maxUses, expiresAt } = await req.json()

    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : ''
    const percent = Number(discountPercent)
    const uses = Number(maxUses)
    if (!/^[A-Z0-9_-]{3,40}$/.test(normalizedCode) || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return NextResponse.json({ error: 'الكود ونسبة الخصم مطلوبة' }, { status: 400 })
    }
    if (!Number.isFinite(uses) || uses < 1 || uses > 100000) return NextResponse.json({ error: 'عدد الاستخدام غير صالح' }, { status: 400 })

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 400 })

    const existing = await db.coupon.findUnique({ where: { code: normalizedCode } })
    if (existing) return NextResponse.json({ error: 'الكود مستخدم بالفعل' }, { status: 400 })

    const coupon = await db.coupon.create({
      data: {
        code: normalizedCode,
        storeId: store.id,
        discountPercent: percent,
        maxUses: uses,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })
    return NextResponse.json({ coupon })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// DELETE - delete coupon
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })

    const coupon = await db.coupon.findUnique({ where: { id }, include: { store: true } })
    if (!coupon) return NextResponse.json({ error: 'الكوبون غير موجود' }, { status: 404 })

    const isOwner = session.role === 'SHOP_OWNER' && coupon.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    await db.coupon.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
