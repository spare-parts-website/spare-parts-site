'use client'

import { useEffect, useMemo, useState } from 'react'
import { LifeBuoy, MessageSquare, Search, Send, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

type SupportMessage = { id: string; body: string; authorRole: string; author?: { id: string; name: string } | null; createdAt: string }
type SupportTicket = { id: string; category: string; subject: string; status: string; orderId?: string | null; createdAt: string; updatedAt: string; user?: { id: string; name: string; email: string }; messages: SupportMessage[] }

const STATUS_LABELS: Record<string, string> = { OPEN: 'مفتوحة', IN_PROGRESS: 'قيد المتابعة', WAITING_FOR_CUSTOMER: 'بانتظار رد العميل', WAITING_FOR_SUPPORT: 'بانتظار الدعم', RESOLVED: 'تم الحل', CLOSED: 'مغلقة' }
const CATEGORY_LABELS: Record<string, string> = { GENERAL: 'عام', ORDER: 'طلب', ACCOUNT: 'حساب', SELLER: 'متجر / بائع', PAYMENT: 'دفع', REPORT: 'بلاغ', RETURN_REFUND: 'استرجاع / رد مبلغ', TECHNICAL: 'مشكلة تقنية', OTHER: 'أخرى' }

export function SupportView({ embedded = false }: { embedded?: boolean }) {
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
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

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (ticketSearch) params.set('search', ticketSearch)
      const response = await fetch(`/api/support/tickets${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الدعم')
      const next = data.tickets || []
      setTickets(next)
      const requested = new URLSearchParams(window.location.search).get('ticket')
      setSelectedId((current) => (requested && next.some((ticket: SupportTicket) => ticket.id === requested) ? requested : current && next.some((ticket: SupportTicket) => ticket.id === current) ? current : next[0]?.id || null))
    } catch (error: any) {
      toast({ title: 'تعذر تحميل الدعم', description: error.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [user?.id, statusFilter, categoryFilter, ticketSearch])

  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) || null, [selectedId, tickets])

  const createTicket = async () => {
    if (saving || subject.trim().length < 3 || message.trim().length < 2) return
    setSaving(true)
    try {
      const response = await fetch('/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, category, message, orderId: orderId.trim() || undefined }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إنشاء التذكرة')
      setSubject(''); setMessage(''); setCategory('GENERAL'); setOrderId('')
      await load()
      setSelectedId(data.ticket?.id || null)
      toast({ title: 'تم إرسال طلب الدعم', description: 'سيظهر رد الفريق هنا عند وصوله.' })
    } catch (error: any) {
      toast({ title: 'تعذر إرسال التذكرة', description: error.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const sendReply = async () => {
    if (!selected || saving || reply.trim().length < 2) return
    setSaving(true)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(selected.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: reply }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال الرد')
      setReply('')
      setTickets((current) => current.map((ticket) => ticket.id === selected.id ? data.ticket : ticket))
    } catch (error: any) {
      toast({ title: 'تعذر إرسال الرد', description: error.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const updateStatus = async (status: string) => {
    if (!selected || saving || user?.role !== 'ADMIN') return
    setSaving(true)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(selected.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الحالة')
      setTickets((current) => current.map((ticket) => ticket.id === selected.id ? data.ticket : ticket))
    } catch (error: any) {
      toast({ title: 'تعذر تحديث الحالة', description: error.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (!user) return <div className="content-container py-16"><Card><CardContent className="py-12 text-center"><LifeBuoy className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-2xl font-bold">الدعم والمساعدة</h1><p className="mt-2 text-muted-foreground">سجّل الدخول لإنشاء تذكرة ومتابعة الردود.</p></CardContent></Card></div>

  return (
    <div className={`content-container space-y-6 py-10 ${embedded ? 'pt-2' : ''}`}>
      {!embedded && <div className="page-heading mb-0"><div><p className="page-kicker">خدمة العملاء</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">الدعم والمساعدة</h1><p className="mt-1 text-muted-foreground">تواصل مع فريق غيار ماركت وتابع طلبك من مكان واحد.</p></div><LifeBuoy className="size-10 text-primary" /></div>}
      {user.role === 'ADMIN' && <Card className="market-card"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center"><div className="relative min-w-0 flex-1 sm:min-w-56"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setTicketSearch(searchInput.trim()) }} className="pr-9" placeholder="ابحث برقم التذكرة أو العنوان أو المستخدم" /></div><select aria-label="تصفية حسب الحالة" className="h-9 rounded-md border bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">كل الحالات</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="تصفية حسب التصنيف" className="h-9 rounded-md border bg-background px-2 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">كل التصنيفات</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button type="button" variant="outline" onClick={() => setTicketSearch(searchInput.trim())}>بحث</Button><Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setTicketSearch(''); setStatusFilter(''); setCategoryFilter('') }}>مسح</Button></CardContent></Card>}
      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
        <Card className="market-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" />{user.role === 'ADMIN' ? 'صندوق الدعم' : 'تذاكري'}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</p> : tickets.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تذاكر بعد.</p> : tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-xl border p-3 text-right transition hover:border-primary/50 ${selectedId === ticket.id ? 'border-primary bg-primary/5' : ''}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{ticket.subject}</span><Badge variant="outline" className="shrink-0 text-[10px]">{STATUS_LABELS[ticket.status] || ticket.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[ticket.category] || ticket.category} • {new Date(ticket.updatedAt).toLocaleDateString('ar-EG')}</p>{user.role === 'ADMIN' && ticket.user && <p className="mt-1 truncate text-xs text-primary">{ticket.user.name}</p>}</button>)}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {selected ? <Card className="market-card"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{selected.subject}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[selected.category] || selected.category} • #{selected.id}</p>{user.role === 'ADMIN' && selected.user && <p className="mt-1 text-xs text-muted-foreground">{selected.user.name} — {selected.user.email}</p>}</div>{user.role === 'ADMIN' ? <select aria-label="حالة التذكرة" className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.status} onChange={(event) => void updateStatus(event.target.value)} disabled={saving}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <Badge>{STATUS_LABELS[selected.status] || selected.status}</Badge>}</div></CardHeader><CardContent className="space-y-4"><div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-muted/20 p-3">{selected.messages.map((item) => <div key={item.id} className={`rounded-xl border p-3 text-sm ${item.authorRole === 'ADMIN' ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}><div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1">{item.authorRole === 'ADMIN' && <ShieldCheck className="size-3.5 text-primary" />}{item.author?.name || (item.authorRole === 'ADMIN' ? 'فريق الدعم' : 'أنت')}</span><span>{new Date(item.createdAt).toLocaleString('ar-EG')}</span></div><p className="whitespace-pre-wrap leading-7">{item.body}</p></div>)}</div><div className="flex gap-2"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="اكتب ردك..." maxLength={5000} rows={3} /><Button type="button" size="icon" className="shrink-0" onClick={() => void sendReply()} disabled={saving || reply.trim().length < 2} aria-label="إرسال الرد"><Send className="size-4" /></Button></div></CardContent></Card> : <Card className="market-card"><CardContent className="py-10 text-center text-muted-foreground">اختر تذكرة لعرض المحادثة.</CardContent></Card>}

          {user.role !== 'ADMIN' && <Card className="market-card"><CardHeader><CardTitle className="text-base">فتح تذكرة جديدة</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="عنوان مختصر للمشكلة" maxLength={160} /><select aria-label="تصنيف التذكرة" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="رقم الطلب (اختياري)" maxLength={100} dir="ltr" /><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اشرح ما تحتاجه..." maxLength={5000} rows={4} /><Button type="button" onClick={() => void createTicket()} disabled={saving || subject.trim().length < 3 || message.trim().length < 2}><Send className="ml-2 size-4" />{saving ? 'جاري الإرسال...' : 'إرسال التذكرة'}</Button></CardContent></Card>}
        </div>
      </div>
    </div>
  )
}
