'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, Package, DollarSign, Star, ShoppingBag } from 'lucide-react'
import { formatPrice } from '@/components/common'
import { useAppStore } from '@/lib/store'

interface Analytics {
  stats: {
    totalOrders: number
    totalRevenue: number
    paidOrders: number
    avgRating: number
    reviewCount: number
    avgResponseMinutes: number | null
  }
  statusCounts: Record<string, number>
  monthlyRevenue: { month: string; revenue: number; orders: number }[]
  topParts: { name: string; count: number; revenue: number }[]
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الموافقة',
  APPROVED: 'تمت الموافقة',
  REJECTED: 'مرفوض',
  PAID: 'مدفوع',
  DELIVERED: 'تم التوصيل',
  RETURNED: 'تم الاسترجاع',
  CANCELLED: 'ملغى',
}

const ANALYTICS_CACHE_TTL = 30_000
const analyticsCache = new Map<string, { fetchedAt: number; data: Analytics }>()
const analyticsInFlight = new Map<string, Promise<Analytics>>()

export async function warmSellerAnalytics(userId: string, force = false) {
  const cached = analyticsCache.get(userId)
  if (!force && cached && Date.now() - cached.fetchedAt < ANALYTICS_CACHE_TTL) return cached.data
  const pending = analyticsInFlight.get(userId)
  if (!force && pending) return pending

  const request = fetch('/api/shop/analytics', { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'SHOP_ANALYTICS_LOAD_FAILED')
      analyticsCache.set(userId, { fetchedAt: Date.now(), data })
      return data as Analytics
    })
    .finally(() => analyticsInFlight.delete(userId))

  analyticsInFlight.set(userId, request)
  return request
}

export function AnalyticsView() {
  const userId = useAppStore((state) => state.user?.id)
  const cached = userId ? analyticsCache.get(userId)?.data || null : null
  const [data, setData] = useState<Analytics | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (!userId) {
      setData(null)
      setLoading(false)
      return
    }
    const current = analyticsCache.get(userId)?.data
    if (current) {
      setData(current)
      setLoading(false)
    } else {
      setLoading(true)
    }
    let active = true
    warmSellerAnalytics(userId)
      .then((next) => { if (active) setData(next) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  const maxRevenue = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 1)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="size-5 text-primary" />
          التحليلات والإحصائيات
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">نظرة شاملة على أداء متجرك</p>
      </div>

      {/* Stats cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <DollarSign className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatPrice(data.stats.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.stats.totalOrders}</p>
              <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Package className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.stats.paidOrders}</p>
              <p className="text-xs text-muted-foreground">طلبات مكتملة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Star className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.stats.avgRating.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{data.stats.reviewCount} تقييم</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">متوسط وقت الرد</p><p className="mt-1 text-xl font-bold">{data.stats.avgResponseMinutes === null ? 'لا توجد بيانات كافية' : data.stats.avgResponseMinutes < 60 ? `${data.stats.avgResponseMinutes} دقيقة` : `${(data.stats.avgResponseMinutes / 60).toFixed(1)} ساعة`}</p></CardContent></Card>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly revenue chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الإيرادات الشهرية (آخر 6 أشهر)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.monthlyRevenue.map((m) => (
                <div key={m.month} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.month}</span>
                    <span className="text-muted-foreground">
                      {formatPrice(m.revenue)} • {m.orders} طلب
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(m.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Order status distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزيع حالات الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.statusCounts).map(([status, count]) => {
                const total = data.stats.totalOrders
                const pct = total > 0 ? (count / total) * 100 : 0
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-sm w-32 shrink-0">{STATUS_LABELS[status] || status}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-primary/70 flex items-center justify-end px-2"
                        style={{ width: `${Math.max(pct, 5)}%` }}
                      >
                        <span className="text-xs text-primary-foreground font-medium">{count}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-left">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top selling parts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أكثر القطع مبيعاً</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topParts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              لا توجد مبيعات بعد
            </p>
          ) : (
            <div className="space-y-3">
              {data.topParts.map((part, idx) => (
                <div key={part.name} className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{part.name}</p>
                    <p className="text-xs text-muted-foreground">{part.count} مبيعة</p>
                  </div>
                  <span className="font-semibold text-primary shrink-0">
                    {formatPrice(part.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
