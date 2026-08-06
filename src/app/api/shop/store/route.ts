import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const body = await req.json()
    const { name, description, address, phone, image } = body

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) {
      return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    }

    const updated = await db.store.update({
      where: { id: store.id },
      data: {
        name: name ?? undefined,
        description: description !== undefined ? (description || null) : undefined,
        address: address !== undefined ? (address || null) : undefined,
        phone: phone !== undefined ? (phone || null) : undefined,
        image: image !== undefined ? (image || null) : undefined,
      },
    })

    return NextResponse.json({ store: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
