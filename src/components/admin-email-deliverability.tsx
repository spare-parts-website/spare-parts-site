'use client'

import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, Clock3, MailCheck, MessageSquareWarning, RefreshCw, Send, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Metrics = {
  window: { days: number; from: string; to: string }
  counts: Record<'SENT' | 'DELIVERED' | 'DELAYED' | 'BOUNCED' | 'FAILED' | 'COMPLAINED' | 'SUPPRESSED', number>
  totalAttempts: number
  deliveryRate: number
  bounceRate: number
  complaintRate: number
  suppressedRecipients: number
}

const STATUS_CARDS = [
  { key: 'SENT', label: 'مقبولة للإرسال', icon: Send, className: 'text-sky-500' },
  { key: 'DELIVERED', label: 'تم التسليم', icon: CheckCircle2, className: 'text-emerald-500' },
  { key: 'DELAYED', label: 'متأخرة', icon: Clock3, className: 'text-amber-500' },
  { key: 'BOUNCED', label: 'مرتدة', icon: XCircle, className: 'text-red-500' },
  { key: 'FAILED', label: 'فشلت', icon: XCircle, className: 'text-red-400' },
  { key: 'COMPLAINED', label: 'شكاوى', icon: MessageSquareWarning, className: 'text-orange-500' },
  { key: 'SUPPRESSED', label: 'محظورة من المزوّد', icon: Ban, className: 'text-violet-500' },
] as const

export function AdminEmailDeliverability() {
  const [days, setDays] = useState(30)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    fetch(`/api/admin/email-deliverability?days=${days}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<Metrics> : Promise.reject(new Error('METRICS_FAILED')))
      .then((data) => { if (active) setMetrics(data) })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [days, refreshKey])

  return (
    <Card className="market-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><MailCheck className="size-4 text-primary" />تسليم البريد</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">حالة مزوّد البريد فقط؛ لا تعني أن الرسالة وصلت إلى الوارد بدلاً من Spam أو Promotions.</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="الفترة الزمنية لإحصاءات البريد" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوماً</option>
            <option value={90}>آخر 90 يوماً</option>
          </select>
          <Button variant="ghost" size="icon" onClick={() => setRefreshKey((value) => value + 1)} aria-label="تحديث إحصاءات البريد"><RefreshCw className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-24 rounded-xl" /> : error ? <p className="py-4 text-center text-sm text-muted-foreground">تعذر تحميل إحصاءات البريد. أعد المحاولة لاحقاً.</p> : metrics && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">معدل التسليم</p><p className="mt-1 text-xl font-bold text-emerald-500">{metrics.deliveryRate}%</p><p className="text-[11px] text-muted-foreground">من الحالات النهائية المعروفة</p></div>
              <div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">معدل الارتداد</p><p className="mt-1 text-xl font-bold text-red-500">{metrics.bounceRate}%</p></div>
              <div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">معدل الشكاوى</p><p className="mt-1 text-xl font-bold text-orange-500">{metrics.complaintRate}%</p></div>
              <div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">مستلمون محظورون حالياً</p><p className="mt-1 text-xl font-bold">{metrics.suppressedRecipients}</p></div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {STATUS_CARDS.map(({ key, label, icon: Icon, className }) => <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><Icon className={`size-4 ${className}`} />{label}</span><span className="font-bold">{metrics.counts[key]}</span></div>)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
