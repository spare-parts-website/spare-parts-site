'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Search, Send, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

type SupportMessage = { id: string; body: string; authorRole: string; author?: { id: string; name: string } | null; createdAt: string }
type TicketSummary = { id: string; category: string; subject: string; status: string; orderId?: string | null; createdAt: string; updatedAt: string; user?: { id: string; name: string }; messageCount: number; lastMessage?: { body: string; createdAt: string } | null }
type TicketDetail = Omit<TicketSummary, 'messageCount' | 'lastMessage' | 'user'> & { user?: { id: string; name: string; email: string } }
type DetailState = { ticket: TicketDetail; messages: SupportMessage[]; nextCursor: string | null }

const STATUS_LABELS: Record<string, string> = { OPEN: 'مفتوحة', IN_PROGRESS: 'قيد المتابعة', WAITING_FOR_CUSTOMER: 'بانتظار رد العميل', WAITING_FOR_SUPPORT: 'بانتظار الدعم', RESOLVED: 'تم الحل', CLOSED: 'مغلقة' }
const CATEGORY_LABELS: Record<string, string> = { GENERAL: 'عام', ORDER: 'طلب', ACCOUNT: 'حساب', SELLER: 'متجر / بائع', PAYMENT: 'دفع', REPORT: 'بلاغ', RETURN_REFUND: 'استرجاع / رد مبلغ', TECHNICAL: 'مشكلة تقنية', OTHER: 'أخرى' }

function mergeMessages(current: SupportMessage[], incoming: SupportMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) map.set(message.id, message)
  return [...map.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

export function SupportView({ embedded = false }: { embedded?: boolean }) {
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('GENERAL')
  const [orderId, setOrderId] = useState('')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const detailCursorRef = useRef<string | null>(null)
  const olderLoadedRef = useRef(false)

  const loadTickets = async (append = false) => {
    if (!user) return
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '25' })
      if (append && nextCursor) params.set('cursor', nextCursor)
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (ticketSearch) params.set('search', ticketSearch)
      const response = await fetch(`/api/support/tickets?${params}`, { cache: 'no-store' }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الدعم')
      const rows = (data.tickets || []) as TicketSummary[]
      setTickets((current) => append ? [...current, ...rows] : rows)
      setNextCursor(data.nextCursor || null)
      if (!append) {
        const requested = new URLSearchParams(window.location.search).get('ticket')
        setSelectedId((current) => requested && rows.some((ticket) => ticket.id === requested) ? requested : current && rows.some((ticket) => ticket.id === current) ? current : rows[0]?.id || null)
      }
    } catch (error) { toast({ title: 'تعذر تحميل الدعم', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setLoading(false); setLoadingMore(false) }
  }

  const loadDetail = async (id: string, options: { older?: boolean; refresh?: boolean } = {}) => {
    const params = new URLSearchParams({ limit: '50' })
    if (options.older && detailCursorRef.current) params.set('cursor', detailCursorRef.current)
    if (options.older) setLoadingOlder(true)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(id)}?${params}`, { cache: 'no-store' }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل التذكرة')
      const incoming = (data.messages || []) as SupportMessage[]
      setDetail((current) => ({ ticket: data.ticket, messages: options.older || options.refresh ? mergeMessages(current?.messages || [], incoming) : incoming, nextCursor: options.refresh && olderLoadedRef.current ? current?.nextCursor || null : data.nextCursor || null }))
      if (options.older) { olderLoadedRef.current = true; detailCursorRef.current = data.nextCursor || null }
      else if (!options.refresh || !olderLoadedRef.current) detailCursorRef.current = data.nextCursor || null
    } catch (error) { if (!options.refresh) toast({ title: 'تعذر تحميل التذكرة', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setLoadingOlder(false) }
  }

  useEffect(() => { if (user) void loadTickets(false); else { setTickets([]); setSelectedId(null); setDetail(null); setLoading(false) } }, [user?.id, user?.role, statusFilter, categoryFilter, ticketSearch])
  useEffect(() => { if (!selectedId) { setDetail(null); return }; olderLoadedRef.current = false; detailCursorRef.current = null; void loadDetail(selectedId) }, [selectedId])
  useEffect(() => { if (!selectedId) return; const refresh = () => { if (document.visibilityState === 'visible') { void loadTickets(false); void loadDetail(selectedId, { refresh: true }) } }; window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) } }, [selectedId, user?.id, statusFilter, categoryFilter, ticketSearch])

  const selectedSummary = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) || null, [selectedId, tickets])

  const createTicket = async () => {
    if (saving || subject.trim().length < 3 || message.trim().length < 2) return
    setSaving(true)
    try {
      const response = await fetch('/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, category, message, orderId: orderId.trim() || undefined }) }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إنشاء التذكرة')
      setSubject(''); setMessage(''); setCategory('GENERAL'); setOrderId(''); await loadTickets(false); if (data.ticket?.id) setSelectedId(data.ticket.id)
      toast({ title: 'تم إرسال طلب الدعم' })
    } catch (error) { toast({ title: 'تعذر إرسال التذكرة', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  const sendReply = async () => {
    if (!detail || saving || reply.trim().length < 2) return
    setSaving(true)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(detail.ticket.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: reply }) }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال الرد')
      setReply(''); setDetail((current) => current ? { ...current, ticket: { ...current.ticket, ...data.ticket }, messages: data.message ? mergeMessages(current.messages, [data.message]) : current.messages } : current); await loadTickets(false)
    } catch (error) { toast({ title: 'تعذر إرسال الرد', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  const updateStatus = async (status: string) => {
    if (!detail || saving || user?.role !== 'ADMIN') return
    setSaving(true)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(detail.ticket.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الحالة')
      setDetail((current) => current ? { ...current, ticket: { ...current.ticket, ...data.ticket } } : current); await loadTickets(false)
    } catch (error) { toast({ title: 'تعذر تحديث الحالة', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  if (!user) return <div className="content-container space-y-6 py-10"><div className="page-heading mb-0"><div><p className="page-kicker">خدمة العملاء</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">الدعم والمساعدة</h1><p className="mt-1 text-muted-foreground">نساعدك في الطلبات والحسابات وقطع الغيار.</p></div></div><div className="grid gap-5 md:grid-cols-3"><Card><CardHeader><CardTitle className="text-base">مساعدة سريعة</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-muted-foreground">تصفح قطع الغيار والمتاجر، أو سجّل الدخول لمتابعة طلباتك وفتح تذكرة مرتبطة بحسابك.</CardContent></Card><Card><CardHeader><CardTitle className="text-base">تواصل معنا</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-muted-foreground">إذا واجهت مشكلة في التصفح أو التسجيل، سجّل الدخول أو أنشئ حساباً حتى نتمكن من متابعة طلبك بأمان.</CardContent></Card><Card><CardHeader><CardTitle className="text-base">تذاكر الدعم</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-7 text-muted-foreground"><p>التذاكر والردود الخاصة تظهر بعد تسجيل الدخول فقط.</p><div className="flex flex-wrap gap-2"><Button asChild><Link href="/login">تسجيل الدخول</Link></Button><Button asChild variant="outline"><Link href="/register">إنشاء حساب</Link></Button></div></CardContent></Card></div></div>

  return <div className={`content-container space-y-6 py-10 ${embedded ? 'pt-2' : ''}`}>
    {!embedded && <div className="page-heading mb-0"><div><p className="page-kicker">خدمة العملاء</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">الدعم والمساعدة</h1><p className="mt-1 text-muted-foreground">قائمة مختصرة ورسائل تُحمّل فقط عند فتح التذكرة.</p></div></div>}
    {user.role === 'ADMIN' && <Card><CardContent className="flex flex-wrap gap-2 p-4"><div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="pr-9" placeholder="ابحث برقم التذكرة أو العنوان أو المستخدم" /></div><select aria-label="الحالة" className="h-9 rounded-md border bg-background px-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">كل الحالات</option>{Object.entries(STATUS_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="التصنيف" className="h-9 rounded-md border bg-background px-2" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">كل التصنيفات</option>{Object.entries(CATEGORY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="outline" onClick={() => setTicketSearch(searchInput.trim())}>بحث</Button></CardContent></Card>}
    <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" />{user.role === 'ADMIN' ? 'صندوق الدعم' : 'تذاكري'}</CardTitle></CardHeader><CardContent className="space-y-2">{loading ? <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</p> : tickets.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تذاكر.</p> : tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-xl border p-3 text-right ${selectedId === ticket.id ? 'border-primary bg-primary/5' : ''}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{ticket.subject}</span><Badge variant="outline" className="text-[10px]">{STATUS_LABELS[ticket.status] || ticket.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[ticket.category] || ticket.category} • {ticket.messageCount} رسالة</p>{ticket.lastMessage && <p className="mt-1 truncate text-xs text-muted-foreground">{ticket.lastMessage.body}</p>}{user.role === 'ADMIN' && ticket.user && <p className="mt-1 text-xs text-primary">{ticket.user.name}</p>}</button>)}{nextCursor && <Button className="w-full" variant="outline" disabled={loadingMore} onClick={() => void loadTickets(true)}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button>}</CardContent></Card>
      <div className="space-y-5">
        {detail ? <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{detail.ticket.subject}</CardTitle><p className="mt-1 text-xs text-muted-foreground">#{detail.ticket.id} • {CATEGORY_LABELS[detail.ticket.category] || detail.ticket.category}</p>{user.role === 'ADMIN' && detail.ticket.user && <p className="mt-1 text-xs text-muted-foreground">{detail.ticket.user.name} — {detail.ticket.user.email}</p>}</div>{user.role === 'ADMIN' ? <select aria-label="حالة التذكرة" value={detail.ticket.status} onChange={(event) => void updateStatus(event.target.value)} disabled={saving} className="h-9 rounded-md border bg-background px-2">{Object.entries(STATUS_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <Badge>{STATUS_LABELS[detail.ticket.status] || detail.ticket.status}</Badge>}</div></CardHeader><CardContent className="space-y-4">{detail.nextCursor && <Button className="w-full" variant="ghost" disabled={loadingOlder} onClick={() => void loadDetail(detail.ticket.id, { older: true })}>{loadingOlder ? 'جاري التحميل...' : 'تحميل رسائل أقدم'}</Button>}<div className="max-h-[30rem] space-y-3 overflow-y-auto rounded-xl bg-muted/20 p-3">{detail.messages.map((item) => <div key={item.id} className={`rounded-xl border p-3 text-sm ${item.authorRole === 'ADMIN' ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}><div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>{item.authorRole === 'ADMIN' ? <span className="flex items-center gap-1"><ShieldCheck className="size-3" />الدعم</span> : item.author?.name || 'المستخدم'}</span><span>{new Date(item.createdAt).toLocaleString('ar-EG')}</span></div><p className="whitespace-pre-wrap">{item.body}</p></div>)}</div><div className="flex gap-2"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="اكتب ردك..." rows={2} /><Button disabled={saving || reply.trim().length < 2} onClick={() => void sendReply()}><Send className="size-4" /></Button></div></CardContent></Card> : selectedSummary ? <Card><CardContent className="py-12 text-center text-muted-foreground">جاري تحميل التذكرة...</CardContent></Card> : null}
        {user.role !== 'ADMIN' && <Card><CardHeader><CardTitle>تذكرة جديدة</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="عنوان المشكلة" maxLength={160} /><select aria-label="تصنيف المشكلة" className="h-10 w-full rounded-md border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="رقم الطلب (اختياري)" /><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اشرح المشكلة" rows={4} /><Button disabled={saving || subject.trim().length < 3 || message.trim().length < 2} onClick={() => void createTicket()}>إرسال طلب الدعم</Button></CardContent></Card>}
      </div>
    </div>
  </div>
}
