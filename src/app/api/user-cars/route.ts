import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoles } from '@/lib/auth'

// GET user's saved cars
export async function GET() {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER'])
    const cars = await db.userCar.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ cars })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// POST - add a car
export async function POST(req: NextRequest) {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER'])
    const { brand, model, year, nickname, engine, isPrimary } = await req.json()
    if (!brand || !model) return NextResponse.json({ error: 'الماركة والموديل مطلوبان' }, { status: 400 })

    const count = await db.userCar.count({ where: { userId: session.id } })
    if (count >= 5) return NextResponse.json({ error: 'يمكن حفظ 5 سيارات كحد أقصى' }, { status: 400 })
    const parsedYear = year ? parseInt(year) : null
    if (parsedYear && (parsedYear < 1950 || parsedYear > new Date().getFullYear() + 1)) return NextResponse.json({ error: 'سنة الصنع غير صالحة' }, { status: 400 })
    if (isPrimary || count === 0) await db.userCar.updateMany({ where: { userId: session.id }, data: { isPrimary: false } })

    const car = await db.userCar.create({
      data: {
        userId: session.id,
        brand: String(brand).trim().slice(0, 80),
        model: String(model).trim().slice(0, 80),
        year: parsedYear,
        engine: typeof engine === 'string' ? engine.trim().slice(0, 80) || null : null,
        nickname: typeof nickname === 'string' ? nickname.trim().slice(0, 80) || null : null,
        isPrimary: Boolean(isPrimary || count === 0),
      },
    })
    return NextResponse.json({ car })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER'])
    const { id } = await req.json()
    if (typeof id !== 'string') return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    const owned = await db.userCar.findFirst({ where: { id, userId: session.id }, select: { id: true } })
    if (!owned) return NextResponse.json({ error: 'السيارة غير موجودة' }, { status: 404 })
    await db.$transaction([db.userCar.updateMany({ where: { userId: session.id }, data: { isPrimary: false } }), db.userCar.update({ where: { id }, data: { isPrimary: true } })])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// DELETE - remove a car
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER'])
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })

    await db.userCar.deleteMany({ where: { id, userId: session.id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
