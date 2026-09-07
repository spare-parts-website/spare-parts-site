'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShoppingBag, Package, Store, TrendingUp, Ticket, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, formatPrice } from '@/components/common'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

type Page = { rows: any[]; nextCursor: string | null; total?: number }

const sellerTabs = [
  ['/seller/parts', 'القطع', Package],
  ['/seller/orders', 'الطلبات', ShoppingBag],
  ['/seller/analytics', 'تحليلات', TrendingUp],
  ['/seller/coupons', 'كوبونات', Ticket],
  ['/seller/messages', 'الرسائل', MessageSquare],
  ['/seller/store', 'المتجر', Store],
] as const

export function SellerOrdersView() {
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [page, setPage] = useState<Page>({ rows: [], nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const load = async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true)
    try {
      const params = new URLSearchParams({ scope: 'shop', limit: '25' })
      if (append && page.nextCursor) params.set('cursor', page.nextCursor)
      const response = await fetch(`/api/orders/list?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الطلبات')
      setPage((current) => ({ rows: append ? [...current.rows, ...(data.orders || [])] : data.orders || [], nextCursor: data.nextCursor || null, total: data.total }))
    } catch (error) {
      toast({ title: 'تعذر تحميل الطلبات', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' })
    } finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => { if (user?.role === 'SHOP_OWNER') void load() }, [user?.id, user?.role])

  const openDetail = async (id: string) => {
    const response = await fetch(`/api/orders/detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' }); const data = await response.json()
    if (response.ok) setDetail(data.order); else toast({ title: 'تعذر تحميل تفاصيل الطلب', description: data.error, variant: 'destructive' })
  }

  const act = async (id: string, action: string) => {
    setSubmittingId(id)
    try {
      const trackingNumber = action === 'ship' ? window.prompt('رقم التتبع (اختياري)') || '' : undefined
      const response = await fetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...(trackingNumber !== undefined ? { trackingNumber } : {}) }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { toast({ title: 'تعذر تحديث الطلب', description: data.error || 'حدث خطأ', variant: 'destructive' }); return }
      toast({ title: 'تم تحديث الطلب' }); setDetail(null); await load(false)
    } finally { setSubmittingId(null) }
  }

  if (!user || user.role !== 'SHOP_OWNER') return <div className="content-container py-16 text-center">هذه الصفحة مخصصة لأصحاب المتاجر</div>

  return <div className="content-container dashboard-shell space-y-7 py-10">
    <div className="page-heading mb-0"><div><p className="page-kicker">إدارة المتجر</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">طلبات المتجر</h1><p className="mt-1 text-muted-foreground">قائمة متدرجة مع تفاصيل عند الطلب</p></div></div>
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="أقسام لوحة المتجر">{sellerTabs.map(([href, label, Icon]) => <Link key={href} href={href} prefetch={false} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${href === '/seller/orders' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}><Icon className="size-4" />{label}</Link>)}</nav>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">الطلبات {page.total !== undefined ? `(${page.total})` : ''}</h2></div>
    {loading ? <Card><CardContent className="py-16 text-center text-muted-foreground">جاري تحميل الطلبات...</CardContent></Card> : page.rows.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">لا توجد طلبات</CardContent></Card> : <div className="space-y-3">{page.rows.map((order) => <Card key={order.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{order.part?.name || order.items?.[0]?.productName || 'طلب'}</p><p className="text-xs text-muted-foreground">{order.buyer?.name} • {new Date(order.createdAt).toLocaleDateString('ar-EG')}</p></div><span className="font-bold text-primary">{formatPrice(order.totalPrice)}</span><StatusBadge status={order.status} /><StatusBadge status={order.paymentStatus} /><Button size="sm" variant="outline" onClick={() => void openDetail(order.id)}>التفاصيل</Button></div><OrderActions order={order} disabled={submittingId === order.id} act={act} /></CardContent></Card>)}</div>}
    {page.nextCursor && <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button></div>}
    {detail && <Card className="border-primary/30"><CardContent className="space-y-3 p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">تفاصيل الطلب</h3><Button size="sm" variant="ghost" onClick={() => setDetail(null)}>إغلاق</Button></div><p className="text-sm">العميل: {detail.buyer?.name} — <span dir="ltr">{detail.buyer?.phone || '—'}</span></p><p className="text-sm">العنوان: {detail.deliveryAddress || detail.address || '—'}، {detail.governorate || '—'}</p>{(detail.items || []).map((item: any) => <div key={item.id} className="flex justify-between gap-3 rounded-lg border p-2 text-sm"><span>{item.productName}</span><span>{item.quantity} × {formatPrice(item.unitPrice)}</span></div>)}<OrderActions order={detail} disabled={submittingId === detail.id} act={act} /></CardContent></Card>}
  </div>
}

function OrderActions({ order, disabled, act }: { order: any; disabled: boolean; act: (id: string, action: string) => Promise<void> }) {
  if (order.status === 'PENDING') return <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled} onClick={() => void act(order.id, 'approve')}>موافقة</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(order.id, 'reject')}>رفض</Button></div>
  if (order.status === 'APPROVED' || order.status === 'PAID') return <Button size="sm" disabled={disabled} onClick={() => void act(order.id, 'ship')}>خرج للتوصيل</Button>
  if (order.status === 'SHIPPED') return <Badge variant="outline">قيد التوصيل</Badge>
  return null
}
