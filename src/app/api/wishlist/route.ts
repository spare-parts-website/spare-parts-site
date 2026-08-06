import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// GET user's wishlist
export async function GET() {
  try {
    const session = await requireAuth()
    const items = await db.wishlist.findMany({
      where: { userId: session.id },
      include: {
        part: {
          select: {
            id: true, name: true, price: true, image: true, stock: true, blocked: true,
            store: { select: { id: true, name: true } },
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

// POST - add to wishlist
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { partId } = await req.json()
    if (!partId) return NextResponse.json({ error: 'partId مطلوب' }, { status: 400 })

    const item = await db.wishlist.upsert({
      where: { userId_partId: { userId: session.id, partId } },
      update: {},
      create: { userId: session.id, partId },
    })
    return NextResponse.json({ item })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// DELETE - remove from wishlist
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const partId = searchParams.get('partId')
    if (!partId) return NextResponse.json({ error: 'partId مطلوب' }, { status: 400 })

    await db.wishlist.deleteMany({ where: { userId: session.id, partId } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
