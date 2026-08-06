'use client'

import { CheckCircle2, Clock, XCircle, CreditCard, Truck, RotateCcw, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimelineEntry {
  id: string
  status: string
  note?: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  PENDING: { label: 'تم إنشاء الطلب', icon: Package, color: 'text-amber-500 bg-amber-500/10' },
  APPROVED: { label: 'وافق المحل', icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10' },
  REJECTED: { label: 'رفض المحل', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  PAID: { label: 'تم الدفع', icon: CreditCard, color: 'text-blue-500 bg-blue-500/10' },
  DELIVERED: { label: 'تم التوصيل', icon: Truck, color: 'text-teal-500 bg-teal-500/10' },
  RETURNED: { label: 'تم الاسترجاع', icon: RotateCcw, color: 'text-orange-500 bg-orange-500/10' },
}

const STATUS_ORDER = ['PENDING', 'APPROVED', 'PAID', 'DELIVERED']

export function OrderTimeline({
  timeline,
  currentStatus,
}: {
  timeline: TimelineEntry[]
  currentStatus: string
}) {
  // Build a map of status -> timestamp
  const statusMap = new Map<string, TimelineEntry>()
  timeline.forEach((t) => {
    if (!statusMap.has(t.status)) statusMap.set(t.status, t)
  })

  const isReturned = currentStatus === 'RETURNED'
  const isRejected = currentStatus === 'REJECTED'

  return (
    <div className="space-y-1">
      {STATUS_ORDER.map((status, idx) => {
        const config = STATUS_CONFIG[status]
        const entry = statusMap.get(status)
        const isCompleted = !!entry
        const isCurrent = currentStatus === status

        // Check if this status is reachable
        const currentIdx = STATUS_ORDER.indexOf(currentStatus)
        const isFuture = currentIdx >= 0 && idx > currentIdx && !isReturned

        return (
          <div key={status} className="flex gap-3">
            {/* Line */}
            {idx < STATUS_ORDER.length - 1 && (
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'size-9 rounded-full flex items-center justify-center shrink-0 transition',
                    isCompleted ? config.color : 'bg-muted text-muted-foreground'
                  )}
                >
                  <config.icon className="size-4" />
                </div>
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[24px] mt-1',
                    isCompleted && statusMap.get(STATUS_ORDER[idx + 1])
                      ? 'bg-primary/30'
                      : 'bg-border'
                  )}
                />
              </div>
            )}
            {idx === STATUS_ORDER.length - 1 && (
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'size-9 rounded-full flex items-center justify-center shrink-0 transition',
                    isCompleted ? config.color : 'bg-muted text-muted-foreground'
                  )}
                >
                  <config.icon className="size-4" />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    'font-medium text-sm',
                    isCompleted ? 'text-foreground' : 'text-muted-foreground',
                    isCurrent && 'text-primary'
                  )}
                >
                  {config.label}
                </p>
                {isCurrent && (
                  <span className="size-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              {entry && (
                <div className="mt-0.5">
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString('ar-EG')}
                  </p>
                  {entry.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                  )}
                </div>
              )}
              {isFuture && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">بانتظار الخطوة السابقة</p>
              )}
            </div>
          </div>
        )
      })}

      {/* Show rejected/returned as special states */}
      {isRejected && (
        <div className="flex gap-3 pt-2 border-t">
          <div className="size-9 rounded-full flex items-center justify-center bg-red-500/10 text-red-500 shrink-0">
            <XCircle className="size-4" />
          </div>
          <div>
            <p className="font-medium text-sm text-red-500">تم رفض الطلب</p>
            {statusMap.get('REJECTED') && (
              <p className="text-xs text-muted-foreground">
                {new Date(statusMap.get('REJECTED')!.createdAt).toLocaleString('ar-EG')}
              </p>
            )}
          </div>
        </div>
      )}

      {isReturned && (
        <div className="flex gap-3 pt-2 border-t">
          <div className="size-9 rounded-full flex items-center justify-center bg-orange-500/10 text-orange-500 shrink-0">
            <RotateCcw className="size-4" />
          </div>
          <div>
            <p className="font-medium text-sm text-orange-500">تم استرجاع القطعة</p>
            {statusMap.get('RETURNED') && (
              <p className="text-xs text-muted-foreground">
                {new Date(statusMap.get('RETURNED')!.createdAt).toLocaleString('ar-EG')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
