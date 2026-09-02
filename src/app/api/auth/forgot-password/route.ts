import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { issuePasswordReset } from '@/lib/password-reset'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

const GENERIC_MESSAGE = 'إذا كان البريد مسجلاً لدينا، ستصلك رسالة استعادة خلال دقائق.'

export async function POST(req: NextRequest) {
  try {
    const address = requestAddress(req)
    const addressLimit = await rateLimit(`password-reset-request:address:${address}`, 5, 15 * 60 * 1000)
    if (!addressLimit.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(addressLimit.retryAfter) } })
    }

    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (/^\S+@\S+\.\S+$/.test(email) && email.length <= 254) {
      const emailKey = createHash('sha256').update(email).digest('hex')
      const emailLimit = await rateLimit(`password-reset-request:email:${emailKey}`, 3, 60 * 60 * 1000)
      if (emailLimit.allowed) {
        const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, emailDeliveryStatus: true } })
        if (user) {
          try {
            await issuePasswordReset(user)
          } catch (error) {
            console.error('Password reset email failed', error)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE })
  } catch (error) {
    console.error('Password reset request failed', error)
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE })
  }
}
