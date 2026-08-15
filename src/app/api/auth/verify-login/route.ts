import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { LOGIN_CODE_MAX_ATTEMPTS, matchesLoginCode } from '@/lib/login-verification'

function invalidCode(attemptsRemaining?: number) {
  return NextResponse.json(
    { error: 'رمز التحقق غير صحيح أو منتهي الصلاحية', attemptsRemaining },
    { status: 400 },
  )
}

export async function POST(req: NextRequest) {
  try {
    const address = requestAddress(req)
    const addressLimit = rateLimit(`login-verify:address:${address}`, 25, 10 * 60 * 1000)
    if (!addressLimit.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(addressLimit.retryAfter) } })
    }

    const body = await req.json()
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!challengeId || !/^\d{4}$/.test(code)) return invalidCode()

    const challengeLimit = rateLimit(`login-verify:challenge:${challengeId}`, LOGIN_CODE_MAX_ATTEMPTS, 10 * 60 * 1000)
    if (!challengeLimit.allowed) {
      return NextResponse.json({ error: 'تم تجاوز عدد المحاولات المسموح. اطلب رمزاً جديداً.' }, { status: 429 })
    }

    const now = new Date()
    const challenge = await db.loginVerification.findUnique({
      where: { id: challengeId },
      include: { user: true },
    })

    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= now || challenge.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      return invalidCode(0)
    }

    const reservedAttempt = await db.loginVerification.updateMany({
      where: { id: challengeId, verifiedAt: null, expiresAt: { gt: now }, attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })
    if (reservedAttempt.count !== 1) return invalidCode(0)

    const attemptsRemaining = Math.max(0, LOGIN_CODE_MAX_ATTEMPTS - (challenge.attempts + 1))
    if (!matchesLoginCode(challengeId, code, challenge.codeHash)) return invalidCode(attemptsRemaining)

    const consumed = await db.loginVerification.updateMany({
      where: { id: challengeId, verifiedAt: null },
      data: { verifiedAt: now },
    })
    if (consumed.count !== 1) return invalidCode(0)

    const user = challenge.user
    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'BUYER' | 'ADMIN' | 'SHOP_OWNER',
      phone: user.phone,
      avatar: user.avatar,
    })

    await db.loginVerification.deleteMany({ where: { userId: user.id, id: { not: challengeId } } })

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'تعذر التحقق من الرمز. حاول مرة أخرى.' }, { status: 500 })
  }
}
