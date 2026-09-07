'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, Pencil, Search, ShieldCheck, Store as StoreIcon, Trash2 } from 'lucide-react'
import { AdminEditDialog, type AdminEditTarget } from '@/components/admin-edit-dialog'
import { AdminCreatePartDialog } from '@/components/admin-create-part-dialog'
import { StatusBadge, formatPrice, Stars } from '@/components/common'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

type Tab = 'users' | 'stores' | 'parts' | 'orders' | 'reports'
type PagePayload = { rows: any[]; nextCursor: string | null; total?: number }

const endpointFor = (tab: Tab, cursor: string | null, search: string) => {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  if (search && tab !== 'orders' && tab !== 'reports') params.set('search', search)
  if (tab === 'orders') params.set('scope', 'admin')
  const path = tab === 'users' ? '/api/admin/users' : tab === 'stores' ? '/api/admin/stores' : tab === 'parts' ? '/api/admin/parts' : tab === 'orders' ? '/api/orders/list' : '/api/reports'
  return `${path}?${params}`
}

function extract(tab: Tab, data: any): PagePayload {
  const key = tab === 'users' ? 'users' : tab === 'stores' ? 'stores' : tab === 'parts' ? 'parts' : tab === 'orders' ? 'orders' : 'reports'
  return { rows: Array.isArray(data[key]) ? data[key] : [], nextCursor: data.nextCursor || null, total: Number.isFinite(data.total) ? data.total : undefined }
}

export function AdminListView({ tab }: { tab: Tab }) {
  const currentUser = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [rows, setRows] = useState<any[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminEditTarget | null>(null)
  const [storeChoices, setStoreChoices] = useState<any[]>([])
  const [orderDetail, setOrderDetail] = useState<any | null>(null)

  const title = useMemo(() => ({ users: 'إدارة المستخدمين', stores: 'إدارة المتاجر', parts: 'إدارة قطع الغيار', orders: 'إدارة الطلبات', reports: 'بلاغات المستخدمين' })[tab], [tab])

  const load = async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true)
    try {
      const response = await fetch(endpointFor(tab, append ? nextCursor : null, appliedSearch), { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل البيانات')
      const page = extract(tab, data)
      setRows((current) => append ? [...current, ...page.rows] : page.rows)
      setNextCursor(page.nextCursor)
      setTotal(page.total)
    } catch (error) {
      toast({ title: 'تعذر تحميل البيانات', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' })
    } finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => { setRows([]); setNextCursor(null); setOrderDetail(null); void load(false) }, [tab, appliedSearch])

  useEffect(() => {
    if (tab !== 'parts') return
    void fetch('/api/admin/stores?limit=100', { cache: 'no-store' }).then((response) => response.json()).then((data) => setStoreChoices(data.stores || [])).catch(() => setStoreChoices([]))
  }, [tab])

  const mutate = async (url: string, init: RequestInit, success: string) => {
    const response = await fetch(url, init)
    const data = await response.json().catch(() => ({}))
    if (response.status === 428 && data.stepUpUrl) { window.location.assign(data.stepUpUrl); return false }
    if (!response.ok) { toast({ title: 'تعذر تنفيذ الإجراء', description: data.error || 'حدث خطأ', variant: 'destructive' }); return false }
    toast({ title: success }); await load(false); return true
  }

  const openEdit = async (kind: 'user' | 'store' | 'part', id: string) => {
    const path = kind === 'part' ? `/api/admin/parts?id=${encodeURIComponent(id)}` : `/api/admin/${kind === 'user' ? 'users' : 'stores'}?id=${encodeURIComponent(id)}`
    const response = await fetch(path, { cache: 'no-store' }); const data = await response.json()
    if (!response.ok) { toast({ title: 'تعذر تحميل التفاصيل', description: data.error, variant: 'destructive' }); return }
    setEditTarget({ kind, item: data[kind] })
  }

  if (!currentUser || currentUser.role !== 'ADMIN') return <div className="content-container py-16 text-center">هذه الصفحة مخصصة للمدير فقط</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-muted-foreground">{total !== undefined ? `${total} سجل` : 'تحميل متدرج لتقليل ضغط قاعدة البيانات'}</p></div>
        {tab === 'parts' && <AdminCreatePartDialog stores={storeChoices} onSaved={() => void load(false)} />}
      </div>
      {['users','stores','parts'].includes(tab) && <form className="flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()) }}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث..." /><Button type="submit" variant="outline" className="gap-2"><Search className="size-4" />بحث</Button></form>}
      {loading ? <Card><CardContent className="py-16 text-center text-muted-foreground">جاري التحميل...</CardContent></Card> : rows.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">لا توجد نتائج</CardContent></Card> : <div className="space-y-3">{tab === 'users' ? rows.map((item) => <UserRow key={item.id} item={item} currentUserId={currentUser.id} onEdit={() => void openEdit('user', item.id)} onRole={(role) => void mutate('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, role }) }, 'تم تحديث الدور')} onDelete={() => { if (confirm('هل تريد حذف هذا المستخدم؟')) void mutate(`/api/admin/users?id=${item.id}`, { method: 'DELETE' }, 'تم حذف المستخدم') }} />) : tab === 'stores' ? rows.map((item) => <StoreRow key={item.id} item={item} onEdit={() => void openEdit('store', item.id)} onVerify={() => void mutate('/api/admin/stores', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, verified: !item.verified }) }, item.verified ? 'تم إلغاء التوثيق' : 'تم توثيق المتجر')} onDelete={() => { if (confirm('هل تريد حذف هذا المتجر؟')) void mutate(`/api/admin/stores?id=${item.id}`, { method: 'DELETE' }, 'تم حذف المتجر') }} />) : tab === 'parts' ? rows.map((item) => <PartRow key={item.id} item={item} onEdit={() => void openEdit('part', item.id)} onBlock={() => void mutate('/api/admin/parts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, blocked: !item.blocked }) }, item.blocked ? 'تم رفع الحظر' : 'تم حظر القطعة')} onDelete={() => { if (confirm('هل تريد حذف هذه القطعة؟')) void mutate(`/api/parts?id=${item.id}`, { method: 'DELETE' }, 'تم حذف القطعة') }} />) : tab === 'orders' ? rows.map((item) => <OrderRow key={item.id} item={item} onDetail={async () => { const response = await fetch(`/api/orders/detail?id=${item.id}`, { cache: 'no-store' }); const data = await response.json(); if (response.ok) setOrderDetail(data.order); else toast({ title: 'تعذر تحميل الطلب', description: data.error, variant: 'destructive' }) }} />) : rows.map((item) => <ReportRow key={item.id} item={item} onDecision={(status) => void mutate('/api/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status }) }, 'تم تحديث البلاغ')} />)}</div>}
      {nextCursor && <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button></div>}
      {orderDetail && <Card className="border-primary/30"><CardContent className="space-y-2 p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">تفاصيل الطلب</h3><Button size="sm" variant="ghost" onClick={() => setOrderDetail(null)}>إغلاق</Button></div><p className="text-sm">العميل: {orderDetail.buyer?.name} — {orderDetail.buyer?.phone || 'بدون هاتف'}</p><p className="text-sm">العنوان: {orderDetail.address || '—'}، {orderDetail.governorate || '—'}</p><p className="text-sm">العناصر: {(orderDetail.items || []).length || 1}</p></CardContent></Card>}
      <AdminEditDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => void load(false)} />
    </div>
  )
}

function UserRow({ item, currentUserId, onEdit, onRole, onDelete }: any) { return <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.store?.name || 'بدون متجر'} • {new Date(item.createdAt).toLocaleDateString('ar-EG')}</p></div><Select value={item.role} onValueChange={onRole} disabled={item.id === currentUserId}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BUYER">مشتري</SelectItem><SelectItem value="SHOP_OWNER">صاحب متجر</SelectItem><SelectItem value="ADMIN">مدير</SelectItem></SelectContent></Select><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="size-4" /></Button><Button size="sm" variant="destructive" disabled={item.id === currentUserId} onClick={onDelete}><Trash2 className="size-4" /></Button></CardContent></Card> }
function StoreRow({ item, onEdit, onVerify, onDelete }: any) { return <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center"><StoreIcon className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-semibold">{item.name}</p>{item.verified && <ShieldCheck className="size-4 text-emerald-500" />}</div><p className="text-xs text-muted-foreground">{item.owner?.name} • {item._count?.parts || 0} قطعة • {item.reviewCount || 0} تقييم</p></div><Stars value={item.avgRating || 0} size={12} /><Badge variant={item.moderationStatus === 'ACTIVE' ? 'outline' : 'destructive'}>{item.moderationStatus}</Badge><Button size="sm" variant="outline" onClick={onEdit}>تعديل</Button><Button size="sm" variant="outline" onClick={onVerify}>{item.verified ? 'إلغاء التوثيق' : 'توثيق'}</Button><Button size="sm" variant="destructive" onClick={onDelete}>حذف</Button></CardContent></Card> }
function PartRow({ item, onEdit, onBlock, onDelete }: any) { return <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="size-10 rounded-lg bg-muted flex items-center justify-center"><Package className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.store?.name} • مخزون {item.stock}</p></div><span className="font-semibold text-primary">{formatPrice(item.price)}</span>{item.blocked && <Badge variant="destructive">محظور</Badge>}<Button size="sm" variant="outline" onClick={onEdit}>تعديل</Button><Button size="sm" variant="outline" onClick={onBlock}>{item.blocked ? 'رفع الحظر' : 'حظر'}</Button><Button size="sm" variant="destructive" onClick={onDelete}>حذف</Button></CardContent></Card> }
function OrderRow({ item, onDetail }: any) { return <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{item.part?.name || item.items?.[0]?.productName || 'طلب'}</p><p className="text-xs text-muted-foreground">{item.store?.name} • {item.buyer?.name} • {new Date(item.createdAt).toLocaleDateString('ar-EG')}</p></div><span className="font-semibold text-primary">{formatPrice(item.totalPrice)}</span><StatusBadge status={item.status} /><StatusBadge status={item.paymentStatus} /><Button size="sm" variant="outline" onClick={onDetail}>التفاصيل</Button></CardContent></Card> }
function ReportRow({ item, onDecision }: any) { return <Card className={item.status !== 'OPEN' ? 'opacity-70' : ''}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === 'OPEN' ? 'destructive' : 'outline'}>{item.status}</Badge><span className="font-semibold">{item.target?.name || item.targetId}</span><span className="text-xs text-muted-foreground">من {item.reporter?.name}</span></div><p>{item.reason}</p>{item.details && <p className="text-sm text-muted-foreground">{item.details}</p>}{item.status === 'OPEN' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onDecision('DISMISSED')}>رفض البلاغ</Button><Button size="sm" onClick={() => onDecision('REVIEWED')}>تمت المراجعة</Button>{item.targetType !== 'user' && <Button size="sm" variant="destructive" onClick={() => onDecision('BLOCKED')}>حظر العنصر</Button>}</div>}</CardContent></Card> }
