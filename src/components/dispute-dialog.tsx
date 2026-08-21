'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiImageUpload } from '@/components/image-upload'
import { useToast } from '@/hooks/use-toast'
import { ShieldAlert } from 'lucide-react'

export function DisputeDialog({ orderId }: { orderId: string }) {
  const { toast } = useToast(); const [open, setOpen] = useState(false); const [type, setType] = useState('RETURN'); const [reason, setReason] = useState(''); const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]); const [sending, setSending] = useState(false)
  const submit = async () => { setSending(true); try { const response = await fetch('/api/disputes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, type, reason, evidenceUrls }) }); const data = await response.json(); if (!response.ok) return toast({ title: 'تعذر فتح الطلب', description: data.error, variant: 'destructive' }); toast({ title: 'تم فتح طلب الحماية', description: 'ستراجعه الإدارة ويصلك القرار في الإشعارات.' }); setOpen(false) } finally { setSending(false) } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline"><ShieldAlert className="ml-1 size-4" />حماية المشتري</Button></DialogTrigger><DialogContent dir="rtl"><DialogHeader><DialogTitle>طلب استرجاع أو فتح نزاع</DialogTitle></DialogHeader><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RETURN">طلب استرجاع</SelectItem><SelectItem value="WRONG_ITEM">قطعة مختلفة</SelectItem><SelectItem value="DAMAGED">قطعة تالفة</SelectItem><SelectItem value="DELIVERY">مشكلة توصيل</SelectItem><SelectItem value="OTHER">سبب آخر</SelectItem></SelectContent></Select><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اشرح المشكلة بالتفصيل (10 أحرف على الأقل)" /><MultiImageUpload purpose="evidence" value={evidenceUrls} onChange={setEvidenceUrls} maxImages={3} /><Button onClick={submit} disabled={sending || reason.trim().length < 10}>{sending ? 'جاري الإرسال...' : 'إرسال للإدارة'}</Button></DialogContent></Dialog>
}
