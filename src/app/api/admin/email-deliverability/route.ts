import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const STATUSES = ['SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'] as const

function requestedDays(value: string | null) {
  const days = Number(value || 30)
  return Number.isInteger(days) && [7, 30, 90].includes(days) ? days : 30
}
function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const days = requestedDays(new URL(req.url).searchParams.get('days'))
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const [grouped, suppressedRecipients] = await Promise.all([
      db.emailDeliveryAttempt.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      db.user.count({ where: { emailDeliveryStatus: { in: ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'] } } }),
    ])
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<(typeof STATUSES)[number], number>
    for (const row of grouped) {
      if (row.status in counts) counts[row.status as (typeof STATUSES)[number]] = row._count._all
    }
    const totalAttempts = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const resolvedAttempts = counts.DELIVERED + counts.BOUNCED + counts.FAILED + counts.COMPLAINED + counts.SUPPRESSED
    return NextResponse.json({
      window: { days, from: from.toISOString(), to: to.toISOString() },
      counts,
      totalAttempts,
      deliveryRate: percentage(counts.DELIVERED, resolvedAttempts),
      bounceRate: percentage(counts.BOUNCED, totalAttempts),
      complaintRate: percentage(counts.COMPLAINED, totalAttempts),
      suppressedRecipients,
    }, { headers: PRIVATE_HEADERS })
  } catch (error: any) {
    if (error?.message === 'UNAUTHORIZED' || error?.message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    console.error('Email deliverability metrics failed', error)
    return NextResponse.json({ error: 'تعذر تحميل إحصاءات البريد' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
