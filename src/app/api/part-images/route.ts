import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { deleteUploadedFiles } from '@/lib/storage'

// POST - add image to part
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const limit = rateLimit(`part-images:${session.id}:${requestAddress(req)}`, 40, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })

    const { partId, url } = await req.json()
    if (!partId || !url) return NextResponse.json({ error: 'partId و url مطلوبان' }, { status: 400 })
    if (typeof url !== 'string' || !/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[A-Za-z0-9._-]+$/.test(url)) {
      return NextResponse.json({ error: 'رابط الصورة غير صالح' }, { status: 400 })
    }

    // Verify ownership
    const part = await db.part.findUnique({ where: { id: partId }, include: { store: true } })
    if (!part) return NextResponse.json({ error: 'القطعة غير موجودة' }, { status: 404 })

    const isOwner = session.role === 'SHOP_OWNER' && part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const image = await db.partImage.create({ data: { partId, url } })
    return NextResponse.json({ image })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// DELETE - remove image
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const imageId = searchParams.get('imageId')
    if (!imageId) return NextResponse.json({ error: 'imageId مطلوب' }, { status: 400 })

    const image = await db.partImage.findUnique({ where: { id: imageId }, include: { part: { include: { store: true } } } })
    if (!image) return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 })

    const isOwner = session.role === 'SHOP_OWNER' && image.part.store.ownerId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    await db.partImage.delete({ where: { id: imageId } })
    await deleteUploadedFiles([image.url])
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
