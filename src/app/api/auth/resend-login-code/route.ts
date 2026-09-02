import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { issueLoginVerification } from '@/lib/login-verification'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : ''
    if (!challengeId) return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })

    const limit = await rateLimit(`login-resend:${challengeId}:${requestAddress(req)}`, 3, 10 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'طلبت رموزاً كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const challenge = await db.loginVerification.findUnique({ where: { id: challengeId }, include: { user: true } })
    if (!challenge || challenge.verifiedAt) return NextResponse.json({ error: 'انتهت جلسة التحقق. سجّل الدخول مرة أخرى.' }, { status: 400 })

    const elapsed = Date.now() - challenge.createdAt.getTime()
    if (elapsed < 60_000) {
      const retryAfter = Math.ceil((60_000 - elapsed) / 1000)
      return NextResponse.json({ error: `يمكنك طلب رمز جديد بعد ${retryAfter} ثانية` }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    try {
      const verification = await issueLoginVerification(challenge.user)
      return NextResponse.json({ verificationRequired: true, ...verification })
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_UNDELIVERABLE') {
        return NextResponse.json({ error: 'هذا البريد لا يستقبل رسائل التحقق حالياً. حدّث البريد من خلال الإدارة ثم حاول مرة أخرى.' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'تعذر إرسال رمز جديد. حاول مرة أخرى لاحقاً.' }, { status: 500 })
  }
}
