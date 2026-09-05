import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { issueLoginVerification, purposeFromDb } from '@/lib/login-verification'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`resend-login-code:${requestAddress(req)}`, 4, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'طلبات رموز كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
    if (!challengeId) return NextResponse.json({ error: 'طلب التحقق غير صالح' }, { status: 400 })
    const challenge = await db.loginVerification.findUnique({ where: { id: challengeId }, include: { user: true } })
    if (!challenge || challenge.verifiedAt) return NextResponse.json({ error: 'طلب التحقق غير صالح' }, { status: 404 })
    const elapsed = Date.now() - challenge.createdAt.getTime()
    if (elapsed < 60_000) return NextResponse.json({ error: 'انتظر دقيقة قبل طلب رمز جديد' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((60_000 - elapsed) / 1000)) } })
    const issued = await issueLoginVerification(challenge.user, purposeFromDb(challenge.purpose))
    return NextResponse.json({ challengeId: issued.challengeId, expiresIn: 600 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'EMAIL_NOT_CONFIGURED' || message === 'EMAIL_DELIVERY_FAILED') return NextResponse.json({ error: 'تعذر إرسال رمز جديد الآن. حاول لاحقاً.' }, { status: 503 })
    console.error('Resend login code failed', error)
    return NextResponse.json({ error: 'تعذر إرسال رمز جديد' }, { status: 500 })
  }
}
