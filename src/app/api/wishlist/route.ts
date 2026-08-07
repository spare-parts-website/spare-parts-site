import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// GET user's favorite stores
export async function GET() {
  try {
    const session = await requireAuth()
    const items = await db.storeWishlist.findMany({
      where: { userId: session.id },
      include: {
        store: {
          select: {
            id: true, name: true, description: true, address: true, phone: true,
            image: true, verified: true,
            owner: { select: { name: true, avatar: true } },
            _count: { select: { parts: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// POST - add a store to favorites
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { storeId } = await req.json()
    if (!storeId) return NextResponse.json({ error: 'storeId مطلوب' }, { status: 400 })

    const item = await db.storeWishlist.upsert({
      where: { userId_storeId: { userId: session.id, storeId } },
      update: {},
      create: { userId: session.id, storeId },
    })
    return NextResponse.json({ item })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// DELETE - remove a store from favorites
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId مطلوب' }, { status: 400 })

    await db.storeWishlist.deleteMany({ where: { userId: session.id, storeId } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
