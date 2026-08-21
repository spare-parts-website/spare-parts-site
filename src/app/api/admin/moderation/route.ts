import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

export async function GET() {
  try {
    await requireRole('ADMIN')
    const [disputes, verifications, openReports, auditLogs, duplicateParts, flaggedUsers] = await Promise.all([
      db.dispute.findMany({ include: { order: { include: { part: { select: { name: true } }, store: { select: { name: true } } } }, buyer: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.sellerVerification.findMany({ include: { store: { include: { owner: { select: { name: true, email: true } } } } }, orderBy: { submittedAt: 'desc' }, take: 100 }),
      db.report.count({ where: { status: 'OPEN' } }),
      db.auditLog.findMany({ include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.part.groupBy({ by: ['name', 'storeId'], where: { blocked: false }, _count: { _all: true }, having: { id: { _count: { gt: 1 } } }, orderBy: { _count: { id: 'desc' } }, take: 30 }),
      db.report.groupBy({ by: ['targetId'], where: { targetType: 'user', status: 'OPEN' }, _count: { _all: true }, having: { id: { _count: { gte: 2 } } }, orderBy: { _count: { id: 'desc' } }, take: 30 }),
    ])
    const storageBase = process.env.SUPABASE_URL?.replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY; let storage = { objects: 0, bytes: 0 }
    if (storageBase && key) { const response = await fetch(`${storageBase}/storage/v1/object/list/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }) }); if (response.ok) { const objects = await response.json() as Array<{ metadata?: { size?: number } }>; storage = { objects: objects.length, bytes: objects.reduce((sum, item) => sum + Number(item.metadata?.size || 0), 0) } } }
    return NextResponse.json({ disputes, verifications, openReports, auditLogs, duplicateParts, suspiciousAccountCount: flaggedUsers.length, storage })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر تحميل مركز المراجعة' }, { status: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 403 : 500 }) }
}
