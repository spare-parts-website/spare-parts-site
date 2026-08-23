import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { requireRoles } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { IMAGE_PURPOSES, IMAGE_UPLOAD_MAX_INPUT_BYTES, IMAGE_UPLOAD_MAX_OUTPUT_BYTES, IMAGE_UPLOAD_TYPES, isImagePurpose } from '@/lib/image-policy'

const ALLOWED_TYPES = new Set<string>(IMAGE_UPLOAD_TYPES)
const PUBLIC_BUCKET = 'uploads'
const PRIVATE_BUCKET = 'protected-uploads'

export async function POST(req: NextRequest) {
  try {
    const session = await requireRoles(['BUYER', 'SHOP_OWNER', 'ADMIN'])
    const limit = await rateLimit(`upload:${session.id}:${requestAddress(req)}`, 20, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'رفعت صوراً كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase Storage environment variables are missing')
    }

    const formData = await req.formData()
    const file = formData.get('file')
    const purpose = formData.get('purpose')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ملف الصورة مطلوب' }, { status: 400 })
    }
    if (!isImagePurpose(purpose)) {
      return NextResponse.json({ error: 'استخدام الصورة غير صالح' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'صيغة الصورة غير مدعومة' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'حجم الصورة يجب ألا يتجاوز 4 ميجا' }, { status: 400 })
    }

    const input = Buffer.from(await file.arrayBuffer())
    const policy = IMAGE_PURPOSES[purpose]
    const isPrivate = purpose === 'ai' || purpose === 'evidence' || purpose === 'verification'
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET
    let output = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: policy.width, height: policy.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: policy.quality, effort: 5, smartSubsample: true })
      .toBuffer()

    if (output.length > IMAGE_UPLOAD_MAX_OUTPUT_BYTES) {
      output = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' })
        .rotate()
        .resize({ width: Math.min(policy.width, 1280), height: Math.min(policy.height, 1280), fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70, effort: 6, smartSubsample: true })
        .toBuffer()
    }
    if (output.length > IMAGE_UPLOAD_MAX_OUTPUT_BYTES) {
      return NextResponse.json({ error: 'تعذر ضغط الصورة إلى حجم آمن. اختر صورة أبسط.' }, { status: 400 })
    }

    const filename = `${purpose}-${session.id}-${Date.now()}-${randomUUID()}.webp`
    const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${filename}`
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(output),
    })

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text()
      throw new Error(`Supabase Storage upload failed: ${uploadResponse.status} ${details}`)
    }

    const url = isPrivate ? `/api/private-image?path=${encodeURIComponent(filename)}` : `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${PUBLIC_BUCKET}/${filename}`
    return NextResponse.json({ url, bytes: output.length, ...(purpose === 'ai' ? { path: filename } : {}) })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ أثناء رفع الصورة' }, { status: 500 })
  }
}
