'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ShoppingBag, Package, Store as StoreIcon, RotateCcw, CheckCircle2, XCircle, Clock, FileText, MessageSquare } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, formatPrice } from '@/components/common'
import { OrderTimeline } from '@/components/order-timeline'
import { useToast } from '@/hooks/use-toast'
import { DisputeDialog } from '@/components/dispute-dialog'

type Page = { rows: any[]; nextCursor: string | null; total?: number }

export function OrdersView() {
  const navigate = useAppNavigation()
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [page, setPage] = useState<Page>({ rows: [], nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const load = async (append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({ scope: 'buyer', limit: '25' })
      if (append && page.nextCursor) params.set('cursor', page.nextCursor)
      const response = await fetch(`/api/orders/list?${params}`, { cache: 'no-store' }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الطلبات')
      setPage((current) => ({ rows: append ? [...current.rows, ...(data.orders || [])] : data.orders || [], nextCursor: data.nextCursor || null, total: data.total }))
    } catch (error) { toast({ title: 'تعذر تحميل الطلبات', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => { if (user && ['BUYER','SHOP_OWNER'].includes(user.role)) void load(false); else setLoading(false) }, [user?.id, user?.role])

  const openDetail = async (id: string) => {
    const response = await fetch(`/api/orders/detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' }); const data = await response.json()
    if (response.ok) setDetail(data.order); else toast({ title: 'تعذر تحميل تفاصيل الطلب', description: data.error, variant: 'destructive' })
  }

  const act = async (id: string, action: string) => {
    setSubmittingId(id)
    try {
      const response = await fetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }); const data = await response.json().catch(() => ({}))
      if (!response.ok) { toast({ title: 'تعذر تحديث الطلب', description: data.error || 'حدث خطأ', variant: 'destructive' }); return }
      toast({ title: 'تم تحديث الطلب' }); setDetail(null); await load(false)
    } finally { setSubmittingId(null) }
  }

  if (!user) return <div className="container mx-auto px-4 py-16 text-center"><ShoppingBag className="mx-auto mb-3 size-16 text-muted-foreground/50" /><h2 className="text-xl font-semibold">سجّل الدخول لعرض طلباتك</h2><Button className="mt-4" onClick={() => navigate({ name: 'login' })}>تسجيل الدخول</Button></div>
  if (!['BUYER','SHOP_OWNER'].includes(user.role)) return <div className="container mx-auto px-4 py-16 text-center"><ShoppingBag className="mx-auto mb-3 size-16 text-muted-foreground/50" /><h2 className="text-xl font-semibold">طلبات العملاء متاحة للمشترين وأصحاب المحلات فقط</h2></div>

  return <div className="content-container space-y-7 py-10">
    <div className="page-heading mb-0"><div><p className="page-kicker">المتابعة</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">طلباتي</h1><p className="mt-1 text-muted-foreground">{page.total !== undefined ? `${page.total} طلب` : 'قائمة متدرجة مع تفاصيل عند الطلب'}</p></div></div>
    {loading ? <Card><CardContent className="py-16 text-center text-muted-foreground">جاري تحميل الطلبات...</CardContent></Card> : page.rows.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground"><ShoppingBag className="mx-auto mb-3 size-12 opacity-50" /><p className="mb-3">لا توجد طلبات بعد</p><Button onClick={() => navigate({ name: 'parts' })}>تصفح قطع الغيار</Button></CardContent></Card> : <div className="space-y-4">{page.rows.map((order) => <Card key={order.id} className="market-card"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row"><div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted/30">{(order.items?.[0]?.productImage || order.part?.image) ? <Image src={order.items?.[0]?.productImage || order.part.image} alt="" fill sizes="80px" className="object-contain" /> : <Package className="m-5 size-10 text-muted-foreground/40" />}</div><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><button className="font-semibold hover:text-primary" onClick={() => navigate({ name: 'part', partId: order.items?.[0]?.partId || order.part.id })}>{order.items?.length > 1 ? `${order.items.length} منتجات` : order.items?.[0]?.productName || order.part.name}</button><p className="mt-1 text-xs text-muted-foreground"><StoreIcon className="ml-1 inline size-3" />{order.store.name} • {new Date(order.createdAt).toLocaleDateString('ar-EG')}</p></div><StatusBadge status={order.status} /></div><div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-bold text-primary">{formatPrice(order.totalPrice)}</span><StatusBadge status={order.paymentStatus} /><Button size="sm" variant="outline" onClick={() => void openDetail(order.id)}>التفاصيل والتتبع</Button><Button size="sm" variant="outline" onClick={() => navigate({ name: 'chat', orderId: order.id })}><MessageSquare className="ml-1 size-4" />دردشة</Button></div></div></CardContent></Card>)}</div>}
    {page.nextCursor && <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button></div>}
    {detail && <OrderDetail order={detail} close={() => setDetail(null)} act={act} disabled={submittingId === detail.id} />}
  </div>
}

function OrderDetail({ order, close, act, disabled }: { order: any; close: () => void; act: (id: string, action: string) => Promise<void>; disabled: boolean }) {
  return <Card className="border-primary/30"><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">تفاصيل الطلب</h2><Button size="sm" variant="ghost" onClick={close}>إغلاق</Button></div>
    {(order.items || []).length > 0 && <div className="space-y-2">{order.items.map((item: any) => <div key={item.id} className="flex justify-between gap-3 rounded-lg border p-2 text-sm"><span>{item.productName}</span><span>{item.quantity} × {formatPrice(item.unitPrice)} = {formatPrice(item.itemTotal)}</span></div>)}</div>}
    <div className="grid gap-2 text-sm sm:grid-cols-3"><span>الإجمالي: <b>{formatPrice(order.totalPrice)}</b></span><span>الشحن: <b>{formatPrice(order.shippingFee || 0)}</b></span><span>الدفع: <StatusBadge status={order.paymentStatus} /></span></div>
    <p className="text-sm text-muted-foreground">العنوان: {order.deliveryAddress || order.address || '—'}، {order.governorate || '—'}</p>
    <div className="flex flex-wrap gap-2">{order.status === 'SHIPPED' && <Button size="sm" disabled={disabled} onClick={() => void act(order.id, 'deliver')}><CheckCircle2 className="ml-1 size-4" />تم استلام الطلب والدفع</Button>}{order.status === 'DELIVERED' && <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(order.id, 'return')}><RotateCcw className="ml-1 size-4" />استرجاع القطعة</Button>}{['SHIPPED','DELIVERED'].includes(order.status) && <DisputeDialog orderId={order.id} />}{['PENDING','APPROVED'].includes(order.status) && order.paymentStatus === 'UNPAID' && <Button size="sm" variant="outline" disabled={disabled} onClick={() => { if (window.confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) void act(order.id, 'cancel') }}><XCircle className="ml-1 size-4" />إلغاء الطلب</Button>}{(order.status === 'PAID' || order.status === 'DELIVERED') && <Button size="sm" variant="outline" onClick={() => window.open(`/api/invoices?id=${order.id}`, '_blank')}><FileText className="ml-1 size-4" />فاتورة</Button>}{order.status === 'PENDING' && <Badge variant="outline"><Clock className="ml-1 size-3" />بانتظار موافقة المتجر</Badge>}</div>
    {order.timeline?.length > 0 && <div className="border-t pt-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Clock className="size-4 text-primary" />تتبع حالة الطلب</h3><OrderTimeline timeline={order.timeline} currentStatus={order.status} /></div>}
  </CardContent></Card>
}
