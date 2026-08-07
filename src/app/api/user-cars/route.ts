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
    const { brand, model, year, nickname } = await req.json()
    if (!brand || !model) return NextResponse.json({ error: 'الماركة والموديل مطلوبان' }, { status: 400 })

    const car = await db.userCar.create({
      data: {
        userId: session.id,
        brand,
        model,
        year: year ? parseInt(year) : null,
        nickname: nickname || null,
      },
    })
    return NextResponse.json({ car })
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
