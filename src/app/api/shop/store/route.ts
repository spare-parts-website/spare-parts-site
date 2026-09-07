import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { deleteUploadedFiles } from '@/lib/storage'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { parseStoreProfileInput, storeIdentityChanged, storeProfileErrorMessage } from '@/lib/store-profile'

export async function GET() {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    return NextResponse.json({ store })
  } catch (error) {
    if (error instanceof Error && (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN')) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error('Store profile load failed', error)
    return NextResponse.json({ error: 'تعذر تحميل المتجر' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const limit = await rateLimit(`seller-store-update:${session.id}:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'تحديثات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const store = await db.store.findUnique({ where: { ownerId: session.id } })
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const body = await req.json() as Record<string, unknown>
    let profile
    try { profile = parseStoreProfileInput(store, body) } catch (error) { return NextResponse.json({ error: storeProfileErrorMessage(error) }, { status: 400 }) }
    const identityChanged = storeIdentityChanged(store, profile)
    const revokeVerification = identityChanged && store.verificationStatus === 'APPROVED'
    const updated = await db.store.update({
      where: { id: store.id },
      data: {
        ...profile,
        ...(revokeVerification ? { verified: false, verificationStatus: 'CHANGES_PENDING', verifiedAt: null } : {}),
      },
    })
    if (profile.image !== store.image) await deleteUploadedFiles([store.image])
    await audit({ actorId: session.id, action: revokeVerification ? 'SELLER_VERIFIED_IDENTITY_CHANGED' : 'SELLER_STORE_UPDATED', targetType: 'store', targetId: store.id, metadata: { identityChanged, verificationRevoked: revokeVerification } })
    return NextResponse.json({ store: updated, verificationRevoked: revokeVerification })
  } catch (error) {
    if (error instanceof Error && (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN')) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error('Store profile update failed', error)
    return NextResponse.json({ error: 'تعذر تحديث المتجر' }, { status: 500 })
  }
}
