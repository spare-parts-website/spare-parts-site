import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { deleteUploadedFiles } from '@/lib/storage'
import { isValidPublicUploadUrl } from '@/lib/image-policy'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'

export async function GET() {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    return NextResponse.json({ store })
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
    const session = await requireRole('SHOP_OWNER')
    const body = await req.json()
    const { name, description, address, phone, image } = body

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
      return NextResponse.json({ error: 'اسم المتجر يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    }
    if (description !== undefined && description !== null && (typeof description !== 'string' || description.trim().length > 1000)) {
      return NextResponse.json({ error: 'وصف المتجر طويل جداً' }, { status: 400 })
    }
    if (address !== undefined && address !== null && (typeof address !== 'string' || address.trim().length > 500)) {
      return NextResponse.json({ error: 'عنوان المتجر طويل جداً' }, { status: 400 })
    }
    const phoneInput = typeof phone === 'string' ? phone.trim() : ''
    const normalizedPhone = phoneInput ? normalizeEgyptianMobile(phoneInput) : null
    if (phoneInput && !normalizedPhone) {
      return NextResponse.json({ error: 'رقم الموبايل المصري غير صالح' }, { status: 400 })
    }
    if (image !== undefined && image !== null && image !== '' && !isValidPublicUploadUrl(image)) {
      return NextResponse.json({ error: 'رابط صورة المتجر غير صالح' }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) {
      return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    }

    const updated = await db.store.update({
      where: { id: store.id },
      data: {
        name: typeof name === 'string' ? name.trim() : undefined,
        description: description !== undefined ? (typeof description === 'string' ? description.trim() || null : null) : undefined,
        address: address !== undefined ? (typeof address === 'string' ? address.trim() || null : null) : undefined,
        phone: phone !== undefined ? (normalizedPhone || null) : undefined,
        image: image !== undefined ? (image ? String(image).trim() : null) : undefined,
      },
    })

    if (image !== undefined && image !== store.image) await deleteUploadedFiles([store.image])

    return NextResponse.json({ store: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
