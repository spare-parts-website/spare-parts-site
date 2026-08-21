'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MultiImageUpload } from '@/components/image-upload'
import { useToast } from '@/hooks/use-toast'
import { BadgeCheck } from 'lucide-react'

export function SellerVerificationCard() {
  const { toast } = useToast(); const [status, setStatus] = useState('UNVERIFIED'); const [businessName, setBusinessName] = useState(''); const [documentUrls, setDocumentUrls] = useState<string[]>([]); const [saving, setSaving] = useState(false)
  useEffect(() => { fetch('/api/seller-verification', { cache: 'no-store' }).then((r) => r.json()).then((data) => { setStatus(data.status || 'UNVERIFIED'); if (data.verification?.businessName) setBusinessName(data.verification.businessName); try { setDocumentUrls(JSON.parse(data.verification?.documentUrls || '[]')) } catch {} }) }, [])
  const submit = async () => { setSaving(true); try { const response = await fetch('/api/seller-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName, documentUrls }) }); const data = await response.json(); if (!response.ok) return toast({ title: 'تعذر الإرسال', description: data.error, variant: 'destructive' }); setStatus('PENDING'); toast({ title: 'تم إرسال طلب الاعتماد' }) } finally { setSaving(false) } }
  return <Card className="market-card"><CardHeader><CardTitle className="flex items-center gap-2"><BadgeCheck className="size-5 text-primary" />توثيق واعتماد المتجر <Badge variant="outline">{status === 'APPROVED' ? 'متجر معتمد' : status === 'PENDING' ? 'قيد المراجعة' : status === 'REJECTED' ? 'يحتاج تعديل' : 'غير موثق'}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">ارفع السجل التجاري أو البطاقة الضريبية أو إثبات الهوية. تظهر الملفات للإدارة فقط داخل لوحة المراجعة.</p><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="الاسم القانوني للنشاط" /><MultiImageUpload purpose="verification" value={documentUrls} onChange={setDocumentUrls} maxImages={3} /><Button onClick={submit} disabled={saving || !documentUrls.length}>{saving ? 'جاري الإرسال...' : 'إرسال للمراجعة'}</Button></CardContent></Card>
}
