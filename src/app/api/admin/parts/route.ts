import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

// Block / unblock parts
export async function PUT(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const body = await req.json()
    const { id, blocked } = body
    const part = await db.part.update({
      where: { id },
      data: { blocked: !!blocked },
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

// Get all parts (including blocked) for admin
export async function GET() {
  try {
    await requireRole('ADMIN')
    const parts = await db.part.findMany({
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ parts })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
