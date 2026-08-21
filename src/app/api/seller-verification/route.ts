import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { audit } from '@/lib/audit'

const DOCUMENT_URL = /^\/api\/private-image\?path=[A-Za-z0-9%._-]+$/

export async function GET(req: NextRequest) {
  try {
    const scope = new URL(req.url).searchParams.get('scope')
    const session = await requireRole(scope === 'admin' ? 'ADMIN' : 'SHOP_OWNER')
    if (scope === 'admin') return NextResponse.json({ requests: await db.sellerVerification.findMany({ include: { store: { include: { owner: { select: { name: true, email: true, phone: true } } } } }, orderBy: { submittedAt: 'desc' } }) })
    const store = await db.store.findUnique({ where: { ownerId: session.id }, include: { verification: true } })
    return NextResponse.json({ verification: store?.verification || null, status: store?.verificationStatus || 'UNVERIFIED' })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر تحميل التحقق' }, { status: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 403 : 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER'); const { documentUrls, businessName } = await req.json(); const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const urls = Array.isArray(documentUrls) ? documentUrls.filter((url) => typeof url === 'string' && DOCUMENT_URL.test(url)).slice(0, 3) : []
    if (!urls.length) return NextResponse.json({ error: 'ارفع مستندًا واحدًا على الأقل' }, { status: 400 })
    const verification = await db.sellerVerification.upsert({ where: { storeId: store.id }, create: { storeId: store.id, documentUrls: JSON.stringify(urls), businessName: typeof businessName === 'string' ? businessName.trim().slice(0, 160) || null : null }, update: { documentUrls: JSON.stringify(urls), businessName: typeof businessName === 'string' ? businessName.trim().slice(0, 160) || null : null, status: 'PENDING', adminNote: null, submittedAt: new Date(), reviewedAt: null } })
    await db.store.update({ where: { id: store.id }, data: { verificationStatus: 'PENDING', verified: false, verifiedAt: null } })
    await audit({ actorId: session.id, action: 'SELLER_VERIFICATION_SUBMITTED', targetType: 'store', targetId: store.id })
    return NextResponse.json({ verification })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر إرسال الطلب' }, { status: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 403 : 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN'); const { id, status, adminNote } = await req.json()
    if (!['APPROVED', 'REJECTED'].includes(status)) return NextResponse.json({ error: 'القرار غير صالح' }, { status: 400 })
    const request = await db.sellerVerification.update({ where: { id }, data: { status, adminNote: typeof adminNote === 'string' ? adminNote.trim().slice(0, 1000) || null : null, reviewedAt: new Date() }, include: { store: true } })
    await db.store.update({ where: { id: request.storeId }, data: { verificationStatus: status, verified: status === 'APPROVED', verifiedAt: status === 'APPROVED' ? new Date() : null } })
    await Promise.allSettled([createNotification({ userId: request.store.ownerId, title: status === 'APPROVED' ? 'تم اعتماد متجرك' : 'يحتاج طلب الاعتماد إلى تعديل', message: adminNote || (status === 'APPROVED' ? 'أصبح متجرك معتمدًا على غيار ماركت.' : 'راجع بيانات التحقق وأعد الإرسال.'), type: 'VERIFICATION', link: 'shop-dashboard' }), audit({ actorId: admin.id, action: `SELLER_VERIFICATION_${status}`, targetType: 'store', targetId: request.storeId })])
    return NextResponse.json({ request })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر حفظ القرار' }, { status: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 403 : 500 }) }
}
