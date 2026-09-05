import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminStepUp, requireAuth, requireRole } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

const TARGET_TYPES = new Set(['part', 'store', 'user'])
const STATUSES = new Set(['REVIEWED', 'DISMISSED', 'BLOCKED'])

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(); const limit = await rateLimit(`reports:${session.id}:${requestAddress(req)}`, 10, 24 * 60 * 60 * 1000); if (!limit.allowed) return NextResponse.json({ error: 'بلاغات كثيرة. حاول مرة أخرى غداً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json(); const targetType = typeof body.targetType === 'string' ? body.targetType : ''; const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : ''; const reason = typeof body.reason === 'string' ? body.reason.trim() : ''; const details = typeof body.details === 'string' ? body.details.trim() : ''
    if (!TARGET_TYPES.has(targetType) || !targetId || reason.length < 2 || reason.length > 100 || details.length > 1000) return NextResponse.json({ error: 'بيانات البلاغ غير صحيحة' }, { status: 400 })
    if (targetType === 'user' && targetId === session.id) return NextResponse.json({ error: 'لا يمكنك الإبلاغ عن حسابك' }, { status: 400 })
    const exists = targetType === 'part' ? await db.part.findUnique({ where: { id: targetId }, select: { id: true } }) : targetType === 'store' ? await db.store.findUnique({ where: { id: targetId }, select: { id: true } }) : await db.user.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'العنصر غير موجود' }, { status: 404 })
    try { const report = await db.report.create({ data: { reporterId: session.id, targetType, targetId, reason, details: details || null } }); return NextResponse.json({ report }, { status: 201 }) }
    catch (error) { if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'لديك بلاغ مفتوح عن هذا العنصر بالفعل' }, { status: 409 }); throw error }
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 }); console.error(error); return NextResponse.json({ error: 'تعذر إرسال البلاغ' }, { status: 500 }) }
}

export async function GET() {
  try { await requireRole('ADMIN'); const reports = await db.report.findMany({ include: { reporter: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }); const partIds = reports.filter((r) => r.targetType === 'part').map((r) => r.targetId); const storeIds = reports.filter((r) => r.targetType === 'store').map((r) => r.targetId); const userIds = reports.filter((r) => r.targetType === 'user').map((r) => r.targetId); const [parts, stores, users] = await Promise.all([db.part.findMany({ where: { id: { in: partIds } }, select: { id: true, name: true, blocked: true } }), db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, moderationStatus: true } }), db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } })]); const targets = new Map([...parts, ...stores, ...users].map((target) => [target.id, target] as const)); return NextResponse.json({ reports: reports.map((report) => ({ ...report, target: targets.get(report.targetId) || null })) }) }
  catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'تعذر تحميل البلاغات' }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json(); const id = typeof body.id === 'string' ? body.id : ''; const status = typeof body.status === 'string' ? body.status : ''
    if (!id || !STATUSES.has(status)) return NextResponse.json({ error: 'بيانات المراجعة غير صحيحة' }, { status: 400 })
    const updated = await db.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id } }); if (!report) throw new Error('NOT_FOUND')
      if (status === 'BLOCKED' && report.targetType === 'user') throw new Error('USER_BLOCK_UNSUPPORTED')
      if (status === 'BLOCKED' && report.targetType === 'part') await tx.part.updateMany({ where: { id: report.targetId }, data: { blocked: true } })
      if (status === 'BLOCKED' && report.targetType === 'store') await tx.store.updateMany({ where: { id: report.targetId }, data: { moderationStatus: 'BLOCKED', moderationReason: `${report.reason}${report.details ? ` — ${report.details}` : ''}`.slice(0, 1000), moderatedAt: new Date(), moderatedById: session.id, verified: false, verificationStatus: 'SUSPENDED', verifiedAt: null } })
      return tx.report.update({ where: { id }, data: { status, reviewedById: session.id } })
    })
    const action = status === 'BLOCKED' ? 'REPORT_TARGET_BLOCKED' : status === 'DISMISSED' ? 'REPORT_DISMISSED' : 'REPORT_REVIEWED'
    await audit({ actorId: session.id, action, targetType: 'report', targetId: id, metadata: { status, targetType: updated.targetType, targetId: updated.targetId } })
    return NextResponse.json({ report: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل اتخاذ قرار في البلاغ.', stepUpUrl: '/admin/security' }, { status: 428 })
    if (message === 'USER_BLOCK_UNSUPPORTED') return NextResponse.json({ error: 'حظر حساب مستخدم يحتاج إجراء إدارة حساب مستقل؛ لا يمكن وضع البلاغ كـ BLOCKED فقط.' }, { status: 400 })
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'البلاغ غير موجود' }, { status: 404 })
    if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error(error); return NextResponse.json({ error: 'تعذر تحديث البلاغ' }, { status: 500 })
  }
}
