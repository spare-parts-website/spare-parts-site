import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { requireRoles } from '@/lib/auth'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const BUCKET = 'uploads'

export async function POST(req: NextRequest) {
  try {
    await requireRoles(['SHOP_OWNER', 'ADMIN'])

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase Storage environment variables are missing')
    }

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ملف الصورة مطلوب' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'صيغة الصورة غير مدعومة' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'حجم الصورة يجب أن يكون أقل من 5 ميجا' }, { status: 400 })
    }

    const input = Buffer.from(await file.arrayBuffer())
    const output = await sharp(input)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()

    const filename = `${Date.now()}-${randomUUID()}.webp`
    const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${filename}`
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'image/webp',
        'x-upsert': 'false',
      },
      body: new Uint8Array(output),
    })

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text()
      throw new Error(`Supabase Storage upload failed: ${uploadResponse.status} ${details}`)
    }

    const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${filename}`
    return NextResponse.json({ url: publicUrl })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ أثناء رفع الصورة' }, { status: 500 })
  }
}
