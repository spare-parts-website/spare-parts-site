import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { destroySession, requireAuth, revokeOtherSessions } from '@/lib/auth'
import { audit } from '@/lib/audit'

type SessionRow = { id: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; userAgentHash: string | null; ipHash: string | null }

export async function GET() {
  try {
    const session = await requireAuth()
    const rows = await db.$queryRaw<SessionRow[]>`SELECT "id","createdAt","lastSeenAt","expiresAt","userAgentHash","ipHash" FROM public."Session" WHERE "userId"=${session.id} AND "expiresAt">CURRENT_TIMESTAMP ORDER BY "lastSeenAt" DESC LIMIT 50`
    return NextResponse.json({ sessions: rows.map((row) => ({ ...row, isCurrent: row.id === session.sessionId })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(); const body = await req.json().catch(() => ({})) as { id?: unknown; allOthers?: unknown }
    if (body.allOthers === true) {
      await revokeOtherSessions(session.id, session.sessionId)
      await audit({ actorId: session.id, action: 'ACCOUNT_OTHER_SESSIONS_REVOKED', targetType: 'user', targetId: session.id })
      return NextResponse.json({ ok: true })
    }
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'معرف الجلسة مطلوب' }, { status: 400 })
    if (id === session.sessionId) { await destroySession(); return NextResponse.json({ ok: true, loggedOut: true }) }
    await db.$executeRaw`DELETE FROM public."Session" WHERE "id"=${id} AND "userId"=${session.id}`
    await audit({ actorId: session.id, action: 'ACCOUNT_SESSION_REVOKED', targetType: 'session', targetId: id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'تعذر إلغاء الجلسة' }, { status: 500 }) }
}
