'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { AlertTriangle, Bot, Clock3, History, Loader2, MessageCirclePlus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useAppStore, type AuthUser } from '@/lib/store'
import type { AIChatResponse, AIClientAction, AIToolCard } from '@/lib/ai/types'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; cards?: AIToolCard[] }
type SavedConversation = { id: string; title?: string | null; expiresAt: string; updatedAt: string; messages: Array<{ id: string; role: string; content: string; metadata?: { cards?: AIToolCard[] } | null }> }

const GUEST_KEY = 'ghyar-ai-guest-v1'
const HOUR = 60 * 60 * 1000

const PROMPTS: Record<AuthUser['role'] | 'GUEST', string[]> = {
  GUEST: ['دور لي على قطع فرامل تويوتا', 'إزاي أختار القطعة المناسبة؟', 'افتح صفحة المتاجر'],
  BUYER: ['دور على قطع متوافقة مع عربيتي', 'لخص طلباتي الأخيرة', 'ساعدني أختار بين القطع'],
  SHOP_OWNER: ['حلل أداء متجري', 'إيه القطع اللي مخزونها قليل؟', 'اقترح سعر مناسب لقطعة'],
  ADMIN: ['اعرض حالة المنصة اليوم', 'إيه البلاغات والنزاعات المفتوحة؟', 'ابحث عن سجل إداري'],
}

export function AIAssistant({ user }: { user: AuthUser | null }) {
  const router = useRouter()
  const addToCart = useAppStore((state) => state.addToCart)
  const setFavoriteStores = useAppStore((state) => state.setFavoriteStores)
  const role = user?.role || 'GUEST'
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string>()
  const [expiresAt, setExpiresAt] = useState<string>()
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryPrompt, setRetryPrompt] = useState('')
  const [pendingProposal, setPendingProposal] = useState<AIToolCard['proposal']>()
  const [proposalBusy, setProposalBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail
      setOpen(true)
      if (detail?.prompt) setInput(detail.prompt)
    }
    window.addEventListener('ghyar-ai-open', listener)
    return () => window.removeEventListener('ghyar-ai-open', listener)
  }, [])

  useEffect(() => {
    if (user) {
      void loadConversations()
      return
    }
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(GUEST_KEY) || 'null') as { updatedAt?: number; messages?: ChatMessage[] } | null
      if (saved?.updatedAt && Date.now() - saved.updatedAt < HOUR && Array.isArray(saved.messages)) setMessages(saved.messages.slice(-20))
      else window.sessionStorage.removeItem(GUEST_KEY)
    } catch { window.sessionStorage.removeItem(GUEST_KEY) }
  }, [user?.id])

  useEffect(() => {
    if (!user) window.sessionStorage.setItem(GUEST_KEY, JSON.stringify({ updatedAt: Date.now(), messages: messages.slice(-20) }))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, user])

  useEffect(() => {
    if (!user || !expiresAt) return
    const delay = new Date(expiresAt).getTime() - Date.now()
    if (delay <= 0) {
      setConversationId(undefined); setExpiresAt(undefined); setMessages([])
      return
    }
    const timeout = window.setTimeout(() => { setConversationId(undefined); setExpiresAt(undefined); setMessages([]); setError('انتهت المحادثة بعد ساعة من عدم النشاط. ابدأ محادثة جديدة.') }, delay)
    return () => window.clearTimeout(timeout)
  }, [expiresAt, user])

  const expiryLabel = (() => {
    if (!expiresAt) return 'تختفي المحادثة بعد ساعة من آخر نشاط'
    const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000))
    return `تختفي المحادثة خلال ${minutes} دقيقة دون نشاط`
  })()

  async function loadConversations() {
    try {
      const response = await fetch('/api/ai/conversations', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json() as { conversations?: SavedConversation[] }
      setConversations(data.conversations || [])
    } catch { /* Chat remains usable without the history list. */ }
  }

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim()
    if (!text || loading) return
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const prior = messages
    setMessages((current) => [...current, userMessage])
    setInput('')
    setError('')
    setRetryPrompt('')
    setLoading(true)
    try {
      const cart = useAppStore.getState().cart
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, conversationId, history: user ? undefined : prior.map((item) => ({ role: item.role, content: item.content })).slice(-12), clientContext: { cart: cart.slice(0, 20).map(({ partId, name, quantity, price }) => ({ partId, name, quantity, price })) } }) })
      const data = await response.json() as AIChatResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || 'تعذر الاتصال بالمساعد')
      setConversationId(data.conversationId)
      setExpiresAt(data.expiresAt)
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: data.answer, cards: data.cards }])
      for (const card of data.cards) if (card.clientAction) applyAutomaticAction(card.clientAction)
      if (user) void loadConversations()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خدمة الذكاء الاصطناعي غير متاحة حالياً')
      setRetryPrompt(text)
    } finally { setLoading(false) }
  }

  function applyAutomaticAction(action: AIClientAction) {
    if (action.type === 'navigate' && action.href?.startsWith('/')) { setOpen(false); router.push(action.href) }
    if (action.type === 'draft') {
      window.sessionStorage.setItem('ghyar-ai-draft-v1', JSON.stringify({ ...action, createdAt: Date.now() }))
      window.dispatchEvent(new CustomEvent('ghyar-ai-draft', { detail: action }))
      if (action.target === 'search' && typeof action.fields?.query === 'string') {
        setOpen(false)
        router.push(`/parts?search=${encodeURIComponent(action.fields.query)}`)
        return
      }
      const targetPath: Record<string, string> = { search: '/parts', car: '/account/cars', message: '/account/messages', listing: '/seller/parts', coupon: '/seller/coupons', moderation_note: '/admin/reports' }
      if (action.target && targetPath[action.target]) { setOpen(false); router.push(targetPath[action.target]) }
    }
  }

  async function decideProposal(approved: boolean) {
    if (!pendingProposal || proposalBusy) return
    setProposalBusy(true)
    try {
      const response = await fetch('/api/ai/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId: pendingProposal.id, approved }) })
      const data = await response.json() as { error?: string; clientAction?: AIClientAction }
      if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الإجراء')
      if (data.clientAction?.type === 'cart_add' && data.clientAction.cartItem) {
        const { quantity, ...item } = data.clientAction.cartItem
        addToCart(item, quantity)
      }
      if (pendingProposal.action === 'wishlist_store_add' || pendingProposal.action === 'wishlist_store_remove') {
        if (pendingProposal.targetId) {
          const favorites = new Set(useAppStore.getState().favoriteStores)
          if (pendingProposal.action === 'wishlist_store_add') favorites.add(pendingProposal.targetId)
          else favorites.delete(pendingProposal.targetId)
          setFavoriteStores([...favorites])
        }
      }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: approved ? 'تم تنفيذ الإجراء بعد التحقق من الصلاحيات والبيانات الحالية.' : 'تم رفض الاقتراح ولم يتغير أي شيء.' }])
      if (user) void loadConversations()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ الإجراء') }
    finally { setProposalBusy(false); setPendingProposal(undefined) }
  }

  function newChat() {
    setConversationId(undefined)
    setExpiresAt(undefined)
    setMessages([])
    setError('')
    setShowHistory(false)
    if (!user) window.sessionStorage.removeItem(GUEST_KEY)
  }

  function selectConversation(conversation: SavedConversation) {
    setConversationId(conversation.id)
    setExpiresAt(conversation.expiresAt)
    setMessages(conversation.messages.map((message) => ({ id: message.id, role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content, cards: message.metadata?.cards })))
    setShowHistory(false)
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (response.ok) {
      if (conversationId === id) newChat()
      setConversations((current) => current.filter((item) => item.id !== id))
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="fixed bottom-24 left-4 z-40 h-12 rounded-2xl px-4 shadow-xl lg:bottom-6" aria-label="فتح مساعد غيار ماركت">
          <Sparkles className="ml-2 size-5" /> <span>اسأل غيار</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" dir="rtl" showClose={false} className="flex h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-primary/5 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div><SheetTitle className="flex items-center gap-2 text-lg"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span>مساعد غيار ماركت</SheetTitle><SheetDescription className="mt-1">{role === 'GUEST' ? 'بحث ومساعدة عامة' : role === 'BUYER' ? 'مساعد المشتري' : role === 'SHOP_OWNER' ? 'مساعد المتجر' : 'مساعد الإدارة'}</SheetDescription></div>
            <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" onClick={newChat} title="محادثة جديدة"><MessageCirclePlus className="size-4" /></Button>{user && <Button size="icon" variant="ghost" onClick={() => setShowHistory((value) => !value)} title="السجل"><History className="size-4" /></Button>}<SheetClose asChild><Button size="icon" variant="ghost" aria-label="إغلاق المساعد" title="إغلاق"><X className="size-4" /></Button></SheetClose></div>
          </div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{expiryLabel}</p>
        </SheetHeader>

        {showHistory && user ? <HistoryPanel conversations={conversations} onSelect={selectConversation} onDelete={deleteConversation} /> : (
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="space-y-4 py-5">
              {!messages.length && <Welcome role={role} onPrompt={(prompt) => void send(prompt)} />}
              {messages.map((message) => <MessageBubble key={message.id} message={message} onProposal={setPendingProposal} />)}
              {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />جاري التفكير والتحقق من البيانات...</div>}
              {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><b>تعذر إكمال الطلب</b><p className="mt-1">{error}</p>{retryPrompt && <Button type="button" size="sm" variant="outline" className="mt-3" disabled={loading} onClick={() => void send(retryPrompt)}>إعادة المحاولة</Button>}</div>}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}

        <div className="border-t bg-background p-4">
          <p className="mb-2 text-[11px] text-muted-foreground">اقتراحات الذكاء الاصطناعي تحتاج مراجعتك. التغييرات الحقيقية تعرض تحذيراً قبل التنفيذ.</p>
          <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send() }}>
            <Textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} rows={2} placeholder="اكتب طلبك هنا..." className="min-h-12 resize-none" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} />
            <Button size="icon" className="size-12 shrink-0" disabled={loading || !input.trim()} aria-label="إرسال"><Send className="size-4" /></Button>
          </form>
        </div>
      </SheetContent>

      <AlertDialog open={!!pendingProposal} onOpenChange={(value) => { if (!value && !proposalBusy) setPendingProposal(undefined) }}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" />تأكيد تغيير حقيقي</AlertDialogTitle><AlertDialogDescription className="leading-7">{pendingProposal?.summary}<br />سيعيد الخادم فحص صلاحيتك وملكية البيانات وحالتها الحالية قبل التنفيذ. لا يمكن استخدام الاقتراح أكثر من مرة.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={proposalBusy} onClick={() => void decideProposal(false)}>رفض</AlertDialogCancel><AlertDialogAction disabled={proposalBusy} onClick={(event) => { event.preventDefault(); void decideProposal(true) }}>{proposalBusy ? 'جاري التحقق...' : 'تأكيد التنفيذ'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

function Welcome({ role, onPrompt }: { role: keyof typeof PROMPTS; onPrompt: (prompt: string) => void }) {
  return <div className="py-8 text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary"><Sparkles className="size-8" /></span><h2 className="mt-4 text-xl font-black">إزاي أقدر أساعدك؟</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">أبحث في بيانات غيار ماركت المسموح لك بها، وأجهز المسودات والإجراءات للمراجعة.</p><div className="mt-5 grid gap-2">{PROMPTS[role].map((prompt) => <Button key={prompt} variant="outline" className="h-auto justify-start whitespace-normal py-3 text-right" onClick={() => onPrompt(prompt)}>{prompt}</Button>)}</div></div>
}

function MessageBubble({ message, onProposal }: { message: ChatMessage; onProposal: (proposal: AIToolCard['proposal']) => void }) {
  return <div className={cn('space-y-2', message.role === 'user' && 'mr-auto max-w-[88%]')}><div className={cn('rounded-2xl px-4 py-3 text-sm leading-7', message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/35')}><ReactMarkdown>{message.content}</ReactMarkdown></div>{message.cards?.map((card, index) => <ToolCard key={`${message.id}-${index}`} card={card} onProposal={onProposal} />)}</div>
}

function ToolCard({ card, onProposal }: { card: AIToolCard; onProposal: (proposal: AIToolCard['proposal']) => void }) {
  return <div className="rounded-2xl border bg-card p-3 shadow-sm"><b className="text-sm">{card.title}</b>{card.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>}{card.items?.length ? <div className="mt-3 space-y-2">{card.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p>{item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}</div><div className="shrink-0 text-left">{item.value !== undefined && <p className="text-xs font-bold text-primary">{item.value}</p>}{item.href && <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs"><Link href={item.href}>فتح</Link></Button>}</div></div>)}</div> : null}{card.proposal && <Button variant="destructive" className="mt-3 w-full" onClick={() => onProposal(card.proposal)}>مراجعة وتنفيذ</Button>}</div>
}

function HistoryPanel({ conversations, onSelect, onDelete }: { conversations: SavedConversation[]; onSelect: (conversation: SavedConversation) => void; onDelete: (id: string) => void }) {
  return <ScrollArea className="min-h-0 flex-1 p-4"><div className="space-y-2"><h2 className="mb-3 font-bold">المحادثات خلال الساعة الأخيرة</h2>{!conversations.length && <p className="py-10 text-center text-sm text-muted-foreground">لا توجد محادثات محفوظة</p>}{conversations.map((conversation) => <div key={conversation.id} className="flex items-center gap-2 rounded-xl border p-2"><button className="min-w-0 flex-1 text-right" onClick={() => onSelect(conversation)}><p className="truncate text-sm font-medium">{conversation.title || 'محادثة جديدة'}</p><p className="text-xs text-muted-foreground">{new Date(conversation.updatedAt).toLocaleTimeString('ar-EG')}</p></button><Button size="icon" variant="ghost" onClick={() => void onDelete(conversation.id)} aria-label="حذف المحادثة"><Trash2 className="size-4 text-destructive" /></Button></div>)}</div></ScrollArea>
}
