'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, type FileUIPart } from 'ai'
import { AlertTriangle, Bot, Clock3, History, Loader2, MessageCirclePlus, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Attachment, Attachments, type AttachmentData } from '@/components/ai-elements/attachments'
import { PromptInput, PromptInputAttachmentsButton, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, type PromptAttachment } from '@/components/ai-elements/prompt-input'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import { useAppStore, type AuthUser } from '@/lib/store'
import type { GhyarAIMessage } from '@/lib/ai/messages'
import type { AIClientAction, AISelectedEntity, AIToolCard } from '@/lib/ai/types'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_INPUT_BYTES, IMAGE_UPLOAD_TYPES } from '@/lib/image-policy'

type SavedConversation = { id: string; title?: string | null; preview?: string | null; expiresAt: string; updatedAt: string; messages: GhyarAIMessage[] }
const GUEST_KEY = 'ghyar-ai-guest-v2'; const HOUR = 60 * 60 * 1000
const PROMPTS: Record<AuthUser['role'] | 'GUEST', string[]> = {
  GUEST: ['صوّر القطعة وساعدني أعرفها', 'دور لي على قطع فرامل تويوتا', 'إزاي أختار القطعة المناسبة؟'],
  BUYER: ['دور على قطع متوافقة مع عربيتي', 'لخص طلباتي الأخيرة', 'ساعدني أختار بين القطع'],
  SHOP_OWNER: ['حلل أداء متجري', 'إيه القطع اللي مخزونها قليل؟', 'اقترح سعر مناسب لقطعة'],
  ADMIN: ['اعرض حالة المنصة اليوم', 'إيه البلاغات والنزاعات المفتوحة؟', 'ابحث عن سجل إداري'],
}

export function AIAssistant({ user }: { user: AuthUser | null }) {
  const router = useRouter(); const addToCart = useAppStore((state) => state.addToCart); const setFavoriteStores = useAppStore((state) => state.setFavoriteStores)
  const role = user?.role || 'GUEST'; const conversationRef = useRef<string | undefined>(undefined); const selectionRef = useRef<AISelectedEntity | undefined>(undefined); const handledActions = useRef(new Set<string>())
  const [open, setOpen] = useState(false); const [input, setInput] = useState(''); const [conversationId, setConversationId] = useState<string>(); const [expiresAt, setExpiresAt] = useState<string>()
  const [conversations, setConversations] = useState<SavedConversation[]>([]); const [showHistory, setShowHistory] = useState(false); const [attachments, setAttachments] = useState<PromptAttachment[]>([]); const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState(''); const [pendingProposal, setPendingProposal] = useState<AIToolCard['proposal']>(); const [proposalBusy, setProposalBusy] = useState(false)
  conversationRef.current = conversationId

  const transport = useMemo(() => new DefaultChatTransport<GhyarAIMessage>({
    api: '/api/ai',
    prepareSendMessagesRequest: ({ messages }) => {
      const cart = useAppStore.getState().cart
      return { body: { messages, conversationId: conversationRef.current, clientContext: { cart: cart.slice(0, 20).map(({ partId, name, quantity, price }) => ({ partId, name, quantity, price })), selection: selectionRef.current } } }
    },
  }), [])

  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } = useChat<GhyarAIMessage>({
    transport,
    onFinish: ({ message }) => {
      if (message.metadata?.conversationId) { setConversationId(message.metadata.conversationId); setExpiresAt(message.metadata.expiresAt) }
      applyToolClientActions(message)
      if (user) void loadConversations()
    },
  })
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    const listener = (event: Event) => { const detail = (event as CustomEvent<{ prompt?: string }>).detail; setOpen(true); if (detail?.prompt) setInput(detail.prompt) }
    window.addEventListener('ghyar-ai-open', listener); return () => window.removeEventListener('ghyar-ai-open', listener)
  }, [])

  useEffect(() => {
    if (user) { void loadConversations(); return }
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(GUEST_KEY) || 'null') as { updatedAt?: number; messages?: GhyarAIMessage[] } | null
      if (saved?.updatedAt && Date.now() - saved.updatedAt < HOUR && Array.isArray(saved.messages)) setMessages(saved.messages.slice(-20))
      else window.sessionStorage.removeItem(GUEST_KEY)
    } catch { window.sessionStorage.removeItem(GUEST_KEY) }
  }, [user?.id, setMessages])

  useEffect(() => {
    if (user) return
    const textOnly = messages.slice(-20).map((message) => ({ ...message, parts: message.parts.filter((part) => part.type === 'text') })).filter((message) => message.parts.length)
    window.sessionStorage.setItem(GUEST_KEY, JSON.stringify({ updatedAt: Date.now(), messages: textOnly }))
  }, [messages, user])

  useEffect(() => {
    if (!user || !expiresAt) return
    const delay = new Date(expiresAt).getTime() - Date.now()
    if (delay <= 0) { newChat(); return }
    const timer = window.setTimeout(() => { newChat(); setLocalError('انتهت المحادثة بعد ساعة من عدم النشاط.') }, delay)
    return () => window.clearTimeout(timer)
  }, [expiresAt, user])

  async function loadConversations() {
    try { const response = await fetch('/api/ai/conversations', { cache: 'no-store' }); if (response.ok) setConversations(((await response.json()) as { conversations?: SavedConversation[] }).conversations || []) } catch { /* The chat remains usable. */ }
  }

  async function submit(text = input, selection?: AISelectedEntity) {
    const prompt = text.trim(); if (busy || (!prompt && !attachments.length)) return
    setLocalError(''); clearError(); selectionRef.current = selection; setUploading(Boolean(attachments.length))
    try {
      const files = await Promise.all(attachments.map((attachment) => prepareAttachment(attachment.file!, Boolean(user))))
      await sendMessage(prompt ? { text: prompt, files } : { files })
      setInput(''); clearAttachmentState()
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'تعذر إرسال الطلب') }
    finally { setUploading(false); selectionRef.current = undefined }
  }

  function addAttachments(files: File[]) {
    setLocalError('')
    const file = files[0]; if (!file) return
    if (!IMAGE_UPLOAD_TYPES.includes(file.type as (typeof IMAGE_UPLOAD_TYPES)[number])) { setLocalError('صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.'); return }
    if (file.size <= 0 || file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES) { setLocalError('حجم الصورة يجب ألا يتجاوز 4 ميجا.'); return }
    clearAttachmentState(); setAttachments([{ id: crypto.randomUUID(), type: 'file', mediaType: file.type, filename: file.name, url: URL.createObjectURL(file), file }])
  }

  function clearAttachmentState() { setAttachments((current) => { current.forEach((item) => item.url.startsWith('blob:') && URL.revokeObjectURL(item.url)); return [] }) }

  function applyToolClientActions(message: GhyarAIMessage) {
    for (const part of message.parts) if (isToolUIPart(part) && part.state === 'output-available') {
      const card = part.output as AIToolCard
      if (!card?.clientAction || handledActions.current.has(part.toolCallId)) continue
      handledActions.current.add(part.toolCallId); applyAutomaticAction(card.clientAction)
    }
  }

  function applyAutomaticAction(action: AIClientAction) {
    if (action.type === 'navigate' && action.href?.startsWith('/')) { setOpen(false); router.push(action.href) }
    if (action.type === 'draft') {
      window.sessionStorage.setItem('ghyar-ai-draft-v1', JSON.stringify({ ...action, createdAt: Date.now() })); window.dispatchEvent(new CustomEvent('ghyar-ai-draft', { detail: action }))
      if (action.target === 'search' && typeof action.fields?.query === 'string') { setOpen(false); router.push(`/parts?search=${encodeURIComponent(action.fields.query)}`); return }
      const paths: Record<string, string> = { search: '/parts', car: '/account/cars', message: '/account/messages', listing: '/seller/parts', coupon: '/seller/coupons', moderation_note: '/admin/reports' }
      if (action.target && paths[action.target]) { setOpen(false); router.push(paths[action.target]) }
    }
  }

  async function decideProposal(approved: boolean) {
    if (!pendingProposal || proposalBusy) return; setProposalBusy(true)
    try {
      const response = await fetch('/api/ai/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId: pendingProposal.id, approved }) }); const data = await response.json() as { error?: string; clientAction?: AIClientAction }
      if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الإجراء')
      if (data.clientAction?.type === 'cart_add' && data.clientAction.cartItem) { const { quantity, ...item } = data.clientAction.cartItem; addToCart(item, quantity) }
      if ((pendingProposal.action === 'wishlist_store_add' || pendingProposal.action === 'wishlist_store_remove') && pendingProposal.targetId) { const favorites = new Set(useAppStore.getState().favoriteStores); if (pendingProposal.action === 'wishlist_store_add') favorites.add(pendingProposal.targetId); else favorites.delete(pendingProposal.targetId); setFavoriteStores([...favorites]) }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text: approved ? 'تم تنفيذ الإجراء بعد إعادة التحقق من الصلاحيات والبيانات الحالية.' : 'تم رفض الاقتراح ولم يتغير أي شيء.' }] }])
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'تعذر تنفيذ الإجراء') }
    finally { setProposalBusy(false); setPendingProposal(undefined) }
  }

  function newChat() { stop(); setConversationId(undefined); setExpiresAt(undefined); setMessages([]); setShowHistory(false); setLocalError(''); clearError(); clearAttachmentState(); if (!user) window.sessionStorage.removeItem(GUEST_KEY) }
  function selectConversation(conversation: SavedConversation) { setConversationId(conversation.id); setExpiresAt(conversation.expiresAt); setMessages(conversation.messages); setShowHistory(false); setLocalError(''); clearError() }
  async function deleteConversation(id: string) { const response = await fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); if (response.ok) { if (conversationId === id) newChat(); setConversations((current) => current.filter((item) => item.id !== id)) } }

  const expiryLabel = expiresAt ? `تختفي المحادثة خلال ${Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000))} دقيقة دون نشاط` : 'تختفي المحادثة بعد ساعة من آخر نشاط'
  const shownError = localError || normalizeChatError(error?.message)
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button className="fixed bottom-24 left-4 z-40 h-12 rounded-2xl px-4 shadow-xl lg:bottom-6" aria-label="فتح مساعد غيار ماركت"><Sparkles className="ml-2 size-5" />اسأل غيار</Button></SheetTrigger>
    <SheetContent side="left" dir="rtl" showClose={false} className="flex h-[100dvh] !w-[100dvw] !max-w-[100dvw] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:!max-w-none lg:!w-[min(560px,100vw)] lg:!max-w-[560px]">
      <SheetHeader className="shrink-0 border-b bg-primary/5 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><SheetTitle className="flex items-center gap-2 text-lg"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><span className="truncate">مساعد غيار ماركت</span></SheetTitle><SheetDescription className="mt-1">{roleLabel(role)}</SheetDescription></div><div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" onClick={newChat} title="محادثة جديدة"><MessageCirclePlus className="size-4" /></Button>{user && <Button size="icon" variant="ghost" onClick={() => setShowHistory((value) => !value)} title="السجل"><History className="size-4" /></Button>}<SheetClose asChild><Button size="icon" variant="ghost" aria-label="إغلاق"><X className="size-4" /></Button></SheetClose></div></div><p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{expiryLabel}</p></SheetHeader>
      {showHistory && user ? <HistoryPanel conversations={conversations} onSelect={selectConversation} onDelete={deleteConversation} /> : <Conversation className="min-w-0"><ConversationContent className="min-w-0 max-w-full overflow-x-hidden"><Welcome visible={!messages.length} role={role} onPrompt={(prompt) => void submit(prompt)} />{messages.map((message) => <MessageView key={message.id} message={message} onProposal={setPendingProposal} onSelect={(selection) => void submit(`اخترت ${selection.label}. أكمل نفس الطلب السابق.`, selection)} />)}{busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{uploading ? 'جاري تجهيز الصورة بأمان...' : status === 'submitted' ? 'جاري إرسال الطلب إلى Gemma...' : 'Gemma يكتب الرد...'}</div>}{shownError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><b>تعذر إكمال الطلب</b><p className="mt-1 break-words">{shownError}</p><Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => { setLocalError(''); clearError(); void regenerate() }}>إعادة المحاولة</Button></div>}</ConversationContent><ConversationScrollButton /></Conversation>}
      <div className="shrink-0 border-t bg-background p-3"><p className="mb-2 text-[11px] text-muted-foreground">اقتراحات الذكاء الاصطناعي تحتاج مراجعتك. أي تغيير حقيقي يتطلب تأكيداً.</p>{attachments.length > 0 && <Attachments className="mb-2">{attachments.map((item) => <Attachment key={item.id} data={item as AttachmentData} onRemove={clearAttachmentState} />)}</Attachments>}<PromptInput onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit() }}><PromptInputTextarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="اكتب طلبك هنا..." onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} /><PromptInputFooter><PromptInputAttachmentsButton accept={IMAGE_UPLOAD_ACCEPT} disabled={busy || attachments.length > 0} onFiles={addAttachments} /><PromptInputSubmit status={status} disabled={uploading || (!busy && !input.trim() && !attachments.length)} onStop={stop} /></PromptInputFooter></PromptInput></div>
    </SheetContent>
    <AlertDialog open={!!pendingProposal} onOpenChange={(value) => { if (!value && !proposalBusy) setPendingProposal(undefined) }}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" />تأكيد تغيير حقيقي</AlertDialogTitle><AlertDialogDescription className="leading-7">{pendingProposal?.summary}<br />سيعيد الخادم فحص صلاحيتك وملكية البيانات وحالتها الحالية قبل التنفيذ.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={proposalBusy} onClick={() => void decideProposal(false)}>رفض</AlertDialogCancel><AlertDialogAction disabled={proposalBusy} onClick={(event) => { event.preventDefault(); void decideProposal(true) }}>{proposalBusy ? 'جاري التحقق...' : 'تأكيد التنفيذ'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Sheet>
}

function Welcome({ visible, role, onPrompt }: { visible: boolean; role: keyof typeof PROMPTS; onPrompt: (prompt: string) => void }) { if (!visible) return null; return <div className="py-8 text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary"><Sparkles className="size-8" /></span><h2 className="mt-4 text-xl font-black">إزاي أقدر أساعدك؟</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">اسأل بطريقتك الطبيعية أو أرفق صورة للقطعة. لن أطلب منك أي ID تقني.</p><Suggestions className="mt-5">{PROMPTS[role].map((prompt) => <Suggestion key={prompt} suggestion={prompt} onClick={onPrompt} />)}</Suggestions></div> }

function MessageView({ message, onProposal, onSelect }: { message: GhyarAIMessage; onProposal: (proposal: AIToolCard['proposal']) => void; onSelect: (selection: AISelectedEntity) => void }) {
  const sources = message.parts.filter((part) => part.type === 'source-url')
  return <Message from={message.role} className={message.role === 'user' ? 'mr-auto max-w-[88%]' : undefined}><MessageContent dir="auto" className={cn("rounded-2xl px-4 py-3", message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/35')}>{message.parts.map((part, index) => {
    if (part.type === 'text' && part.text) return <MessageResponse key={index}>{part.text}</MessageResponse>
    if (part.type === 'file') return <Attachments key={index}><Attachment data={{ ...part, id: `${message.id}-${index}` }} /></Attachments>
    if (isToolUIPart(part)) return <ToolPart key={part.toolCallId} part={part} onProposal={onProposal} onSelect={onSelect} />
    return null
  })}{sources.length > 0 && <Sources><SourcesTrigger count={sources.length} /><SourcesContent>{sources.map((source) => source.type === 'source-url' ? <Source key={source.sourceId} href={source.url} title={source.title || source.url} /> : null)}</SourcesContent></Sources>}</MessageContent></Message>
}

function ToolPart({ part, onProposal, onSelect }: { part: GhyarAIMessage['parts'][number]; onProposal: (proposal: AIToolCard['proposal']) => void; onSelect: (selection: AISelectedEntity) => void }) {
  if (!isToolUIPart(part)) return null
  if (part.state !== 'output-available') return <p className="text-xs text-muted-foreground">جاري استخدام البيانات المصرح بها...</p>
  const card = part.output as AIToolCard; if (!isImportantCard(card)) return null
  return <ToolCard card={card} onProposal={onProposal} onSelect={onSelect} />
}

function ToolCard({ card, onProposal, onSelect }: { card: AIToolCard; onProposal: (proposal: AIToolCard['proposal']) => void; onSelect: (selection: AISelectedEntity) => void }) { return <div className="mt-2 w-full min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm"><b className="block break-words text-sm">{card.title}</b>{card.description && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{card.description}</p>}{card.items?.length ? <div className="mt-3 space-y-2">{card.items.slice(0, 6).map((item) => <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-muted/50 p-2.5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p>{item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}</div><div className="flex shrink-0 items-center gap-2">{item.value !== undefined && <span className="text-xs font-bold text-primary">{item.value}</span>}{item.select && <Button size="sm" variant="outline" onClick={() => onSelect(item.select!)}>اختيار</Button>}{item.href && !item.select && <Button asChild size="sm" variant="link"><Link href={item.href}>فتح</Link></Button>}</div></div>)}</div> : null}{card.proposal && <Button variant="destructive" className="mt-3 w-full" onClick={() => onProposal(card.proposal)}>مراجعة وتنفيذ</Button>}</div> }

function HistoryPanel({ conversations, onSelect, onDelete }: { conversations: SavedConversation[]; onSelect: (conversation: SavedConversation) => void; onDelete: (id: string) => void }) { return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"><h2 className="mb-3 font-bold">المحادثات خلال الساعة الأخيرة</h2><div className="space-y-2">{!conversations.length && <p className="py-10 text-center text-sm text-muted-foreground">لا توجد محادثات محفوظة</p>}{conversations.map((conversation) => <div key={conversation.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border p-3"><button type="button" className="min-w-0 overflow-hidden text-right" onClick={() => onSelect(conversation)}><p className="truncate text-sm font-semibold">{conversation.title || conversation.preview || 'محادثة بصورة'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{conversation.preview}</p><p className="mt-1 text-[11px] text-muted-foreground">{conversation.messages.length} رسائل • {new Date(conversation.updatedAt).toLocaleTimeString('ar-EG')}</p></button><Button type="button" size="icon" variant="ghost" onClick={() => void onDelete(conversation.id)} aria-label="حذف المحادثة"><Trash2 className="size-4 text-destructive" /></Button></div>)}</div></div> }

async function prepareAttachment(file: File, authenticated: boolean): Promise<FileUIPart> {
  if (authenticated) { const form = new FormData(); form.append('file', file); form.append('purpose', 'chat'); const response = await fetch('/api/upload', { method: 'POST', body: form }); const data = await response.json() as { url?: string; error?: string }; if (!response.ok || !data.url) throw new Error(data.error || 'تعذر رفع الصورة'); return { type: 'file', mediaType: 'image/webp', filename: file.name, url: data.url } }
  return { type: 'file', mediaType: 'image/webp', filename: file.name, url: await compressImageToDataUrl(file) }
}
async function compressImageToDataUrl(file: File) { const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL('image/webp', 0.76) }
function isImportantCard(card: unknown): card is AIToolCard { if (!card || typeof card !== 'object') return false; const value = card as AIToolCard; return Boolean(value.proposal || value.clientAction || value.items?.some((item) => item.select || item.href)) }
function roleLabel(role: keyof typeof PROMPTS) { return role === 'GUEST' ? 'بحث ومساعدة عامة' : role === 'BUYER' ? 'مساعد المشتري' : role === 'SHOP_OWNER' ? 'مساعد المتجر' : 'مساعد الإدارة' }
function normalizeChatError(value?: string) { if (!value) return ''; try { const parsed = JSON.parse(value) as { error?: string }; return parsed.error || value } catch { return value } }
