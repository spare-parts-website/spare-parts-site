import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { matchesPasswordResetToken, parsePasswordResetToken, PASSWORD_RESET_MAX_ATTEMPTS } from '@/lib/password-reset'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

const INVALID_LINK = 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`password-reset-complete:${requestAddress(req)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })

    const body = await req.json().catch(() => ({}))
    const parsed = parsePasswordResetToken(body.token)
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8 || password.length > 128) return NextResponse.json({ error: 'كلمة المرور يجب أن تكون بين 8 و128 حرفاً.' }, { status: 400 })
    if (!parsed) return NextResponse.json({ error: INVALID_LINK }, { status: 400 })

    const reset = await db.passwordReset.findUnique({ where: { id: parsed.id } })
    const now = new Date()
    if (!reset || reset.usedAt || reset.expiresAt <= now || reset.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 })
    }

    if (!matchesPasswordResetToken(parsed.id, parsed.token, reset.codeHash)) {
      await db.passwordReset.updateMany({ where: { id: parsed.id, usedAt: null }, data: { attempts: { increment: 1 } } })
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const consumed = await db.$transaction(async (tx) => {
      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS } },
        data: { usedAt: now, attempts: { increment: 1 } },
      })
      if (claimed.count !== 1) return false
      await tx.user.update({ where: { id: reset.userId }, data: { password: passwordHash, sessionVersion: { increment: 1 } } })
      await tx.loginVerification.deleteMany({ where: { userId: reset.userId } })
      await tx.passwordReset.updateMany({ where: { userId: reset.userId, id: { not: reset.id }, usedAt: null }, data: { expiresAt: now } })
      return true
    })

    if (!consumed) return NextResponse.json({ error: INVALID_LINK }, { status: 400 })
    return NextResponse.json({ ok: true, message: 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.' })
  } catch (error) {
    console.error('Password reset completion failed', error)
    return NextResponse.json({ error: 'تعذر تغيير كلمة المرور الآن. حاول مرة أخرى.' }, { status: 500 })
  }
}
