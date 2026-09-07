import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  try {
    await requireRole('ADMIN')
    const [openReports, openDisputes, pendingVerifications, auditLogs, duplicateParts, flaggedUsers] = await Promise.all([
      db.report.count({ where: { status: 'OPEN' } }),
      db.dispute.count({ where: { status: 'OPEN' } }),
      db.sellerVerification.count({ where: { status: 'PENDING' } }),
      db.auditLog.findMany({ select: { id: true, action: true, targetType: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.part.groupBy({ by: ['name', 'storeId'], where: { blocked: false }, _count: { _all: true }, having: { id: { _count: { gt: 1 } } }, orderBy: { _count: { id: 'desc' } }, take: 20 }),
      db.report.groupBy({ by: ['targetId'], where: { targetType: 'user', status: 'OPEN' }, _count: { _all: true }, having: { id: { _count: { gte: 2 } } }, orderBy: { _count: { id: 'desc' } }, take: 100 }),
    ])
    return NextResponse.json({ openReports, openDisputes, pendingVerifications, suspiciousAccountCount: flaggedUsers.length, duplicateParts, auditLogs }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: message === 'UNAUTHORIZED' || message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر تحميل مركز المراجعة' }, { status: message === 'UNAUTHORIZED' || message === 'FORBIDDEN' ? 403 : 500, headers: PRIVATE_HEADERS })
  }
}
