import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { verifyAndConsumeAdminMfa } from '@/lib/admin-mfa'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const body = await req.json(); const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!code) return NextResponse.json({ error: 'رمز المصادقة مطلوب' }, { status: 400 })
  try {
    await verifyAndConsumeAdminMfa(session.id, code)
    await db.user.update({ where: { id: session.id }, data: { adminMfaSecret: null, adminMfaEnabledAt: null, adminMfaRecoveryCodes: null, adminMfaLastCounter: null } })
    await audit({ actorId: session.id, action: 'ACCOUNT_MFA_DISABLED', targetType: 'user', targetId: session.id })
    return NextResponse.json({ disabled: true })
  } catch { return NextResponse.json({ error: 'رمز المصادقة غير صحيح' }, { status: 400 }) }
}
