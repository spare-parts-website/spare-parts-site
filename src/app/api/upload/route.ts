import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { requireRoles } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const BUCKET = 'uploads'

export async function POST(req: NextRequest) {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER', 'ADMIN'])
    const limit = rateLimit(`upload:${session.id}:${requestAddress(req)}`, 20, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'رفعت صوراً كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })

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
    const output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, effort: 5, smartSubsample: true })
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
