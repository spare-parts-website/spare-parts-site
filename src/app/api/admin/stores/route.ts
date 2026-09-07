import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminStepUp, requireRole } from '@/lib/auth'
import { deleteStoreWithDependencies } from '@/lib/admin-deletion'
import { deleteUploadedFiles } from '@/lib/storage'
import { audit } from '@/lib/audit'
import { parseStoreProfileInput, storeIdentityChanged, storeProfileErrorMessage } from '@/lib/store-profile'
import { isStoreModerationStatus } from '@/lib/store-moderation'
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN'); const url = new URL(req.url); const id = url.searchParams.get('id')?.trim()
    if (id) {
      const store = await db.store.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true, email: true, phone: true } }, verification: true, _count: { select: { parts: true, orders: true, reviews: true } } } })
      if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404, headers: PRIVATE_HEADERS })
      const rating = await db.storeReview.aggregate({ where: { storeId: id, blocked: false }, _avg: { rating: true }, _count: { rating: true } })
      return NextResponse.json({ store: { ...store, avgRating: rating._avg.rating || 0, reviewCount: rating._count.rating } }, { headers: PRIVATE_HEADERS })
    }
    const limit = parseLimit(url.searchParams.get('limit'), 25, 100); const cursor = decodeCursor(url.searchParams.get('cursor')); const search = (url.searchParams.get('search') || '').trim().slice(0, 120); const moderationStatus = url.searchParams.get('status')?.trim().toUpperCase()
    const base: Prisma.StoreWhereInput = {}; if (search) base.OR = [{ name: { contains: search, mode: 'insensitive' } }, { owner: { name: { contains: search, mode: 'insensitive' } } }]; if (moderationStatus && ['ACTIVE','UNDER_REVIEW','BLOCKED'].includes(moderationStatus)) base.moderationStatus = moderationStatus
    const where: Prisma.StoreWhereInput = { ...base }; const before = keysetBefore(cursor); if (before) where.AND = [before]
    const [rows,total] = await Promise.all([db.store.findMany({ where, select: { id: true, name: true, description: true, address: true, image: true, verified: true, verificationStatus: true, moderationStatus: true, moderationReason: true, createdAt: true, owner: { select: { id: true, name: true } }, _count: { select: { parts: true, orders: true, reviews: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }), db.store.count({ where: base })])
    const page = rows.slice(0, limit); const ids = page.map((row) => row.id); const ratings = ids.length ? await db.storeReview.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, blocked: false }, _avg: { rating: true }, _count: { rating: true } }) : []; const ratingMap = new Map(ratings.map((row) => [row.storeId, { avgRating: row._avg.rating || 0, reviewCount: row._count.rating }]))
    const stores = page.map((row) => ({ ...row, ...(ratingMap.get(row.id) || { avgRating: 0, reviewCount: 0 }) })); return NextResponse.json({ stores, total, nextCursor: rows.length > limit && stores.length ? encodeCursor(stores[stores.length - 1]) : null }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const id = new URL(req.url).searchParams.get('id'); if (!id) return NextResponse.json({ error: 'معرف المتجر مطلوب' }, { status: 400 })
    const store = await db.store.findUnique({ where: { id }, select: { id: true, ownerId: true, image: true, parts: { select: { image: true, images: { select: { url: true } } } } } }); if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    await db.$transaction(async (tx) => { await deleteStoreWithDependencies(tx, id); await tx.user.updateMany({ where: { id: store.ownerId, role: 'SHOP_OWNER' }, data: { role: 'BUYER', sessionVersion: { increment: 1 } } }) }); await deleteUploadedFiles([store.image, ...store.parts.flatMap((part) => [part.image, ...part.images.map((image) => image.url)])]); await audit({ actorId: session.id, action: 'ADMIN_STORE_DELETED', targetType: 'store', targetId: id, metadata: { sellerId: store.ownerId } }); return NextResponse.json({ ok: true })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل حذف متجر.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); if (message === 'STORE_HAS_ORDERS') return NextResponse.json({ error: 'لا يمكن حذف متجر لديه طلبات. احفظ سجل الطلبات أولاً.' }, { status: 409 }); console.error(error); return NextResponse.json({ error: 'تعذر حذف المتجر' }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json() as Record<string, unknown>; const id = typeof body.id === 'string' ? body.id : ''; if (!id) return NextResponse.json({ error: 'معرف المتجر مطلوب' }, { status: 400 })
    const current = await db.store.findUnique({ where: { id }, include: { verification: true } }); if (!current) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    let profile; try { profile = parseStoreProfileInput(current, body) } catch (error) { return NextResponse.json({ error: storeProfileErrorMessage(error) }, { status: 400 }) }
    const identityChanged = storeIdentityChanged(current, profile); const requestedModeration = body.moderationStatus === undefined ? current.moderationStatus : body.moderationStatus; if (!isStoreModerationStatus(requestedModeration)) return NextResponse.json({ error: 'حالة الإشراف على المتجر غير صالحة' }, { status: 400 })
    const moderationReason = body.moderationReason === undefined ? current.moderationReason : typeof body.moderationReason === 'string' ? body.moderationReason.trim().slice(0, 1000) || null : null; if (requestedModeration === 'BLOCKED' && !moderationReason) return NextResponse.json({ error: 'سبب حظر المتجر مطلوب' }, { status: 400 }); if (body.verified !== undefined && typeof body.verified !== 'boolean') return NextResponse.json({ error: 'حالة التوثيق غير صالحة' }, { status: 400 }); if (body.verified === true && current.verificationStatus !== 'APPROVED' && current.verification?.status !== 'APPROVED') return NextResponse.json({ error: 'اعتماد متجر جديد يجب أن يتم من طلبات التحقق والمستندات.' }, { status: 409 })
    const moderationChanged = requestedModeration !== current.moderationStatus; const manuallyUnverified = body.verified === false && current.verified; const keepVerified = requestedModeration === 'ACTIVE' && !manuallyUnverified && (current.verified || body.verified === true); const now = new Date()
    const store = await db.store.update({ where: { id }, data: { ...profile, moderationStatus: requestedModeration, moderationReason: requestedModeration === 'ACTIVE' ? null : moderationReason, moderatedAt: moderationChanged ? now : current.moderatedAt, moderatedById: moderationChanged ? session.id : current.moderatedById, verified: requestedModeration === 'BLOCKED' ? false : keepVerified, verificationStatus: requestedModeration === 'BLOCKED' ? 'SUSPENDED' : manuallyUnverified ? 'UNVERIFIED' : current.verificationStatus, verifiedAt: requestedModeration === 'BLOCKED' || manuallyUnverified ? null : keepVerified ? (current.verifiedAt || now) : current.verifiedAt, ...(keepVerified && identityChanged ? { verifiedStoreName: profile.name, verifiedBusinessName: current.verifiedBusinessName || profile.name, verifiedPhone: profile.phone, verifiedAddress: profile.address, verifiedImage: profile.image, verifiedById: session.id } : {}) } })
    if (profile.image !== current.image) await deleteUploadedFiles([current.image]); await audit({ actorId: session.id, action: 'ADMIN_STORE_UPDATED', targetType: 'store', targetId: id, metadata: { sellerId: current.ownerId, identityChanged, moderationFrom: current.moderationStatus, moderationTo: requestedModeration, verificationChanged: current.verified !== store.verified, reason: moderationReason } }); return NextResponse.json({ store })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل تعديل متجر.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'تعذر تحديث المتجر' }, { status: 500 }) }
}
