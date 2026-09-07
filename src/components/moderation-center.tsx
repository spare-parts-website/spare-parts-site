'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Copy, ShieldAlert, Store, UserX } from 'lucide-react'

type Page = { rows: any[]; nextCursor: string | null }
type Summary = { openReports: number; openDisputes: number; pendingVerifications: number; suspiciousAccountCount: number; duplicateParts: any[]; auditLogs: any[] }

export function ModerationCenter() {
  const { toast } = useToast()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [disputes, setDisputes] = useState<Page>({ rows: [], nextCursor: null })
  const [verifications, setVerifications] = useState<Page>({ rows: [], nextCursor: null })
  const [verificationDetail, setVerificationDetail] = useState<any | null>(null)
  const [disputeDetail, setDisputeDetail] = useState<any | null>(null)

  const loadSummary = async () => {
    const response = await fetch('/api/admin/moderation', { cache: 'no-store' }); const data = await response.json()
    if (response.ok) setSummary(data)
  }
  const loadDisputes = async (append = false) => {
    const params = new URLSearchParams({ scope: 'admin', limit: '10' }); if (append && disputes.nextCursor) params.set('cursor', disputes.nextCursor)
    const response = await fetch(`/api/disputes?${params}`, { cache: 'no-store' }); const data = await response.json()
    if (response.ok) setDisputes((current) => ({ rows: append ? [...current.rows, ...(data.disputes || [])] : data.disputes || [], nextCursor: data.nextCursor || null }))
  }
  const loadVerifications = async (append = false) => {
    const params = new URLSearchParams({ scope: 'admin', limit: '10' }); if (append && verifications.nextCursor) params.set('cursor', verifications.nextCursor)
    const response = await fetch(`/api/seller-verification?${params}`, { cache: 'no-store' }); const data = await response.json()
    if (response.ok) setVerifications((current) => ({ rows: append ? [...current.rows, ...(data.requests || [])] : data.requests || [], nextCursor: data.nextCursor || null }))
  }

  useEffect(() => { void Promise.all([loadSummary(), loadDisputes(), loadVerifications()]) }, [])

  const decideVerification = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const adminNote = status === 'REJECTED' ? window.prompt('سبب الرفض أو التعديل المطلوب') || '' : window.prompt('ملاحظة القرار (اختياري)') || ''
    if (status === 'REJECTED' && !adminNote.trim()) return
    const response = await fetch('/api/seller-verification', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, adminNote }) }); const data = await response.json().catch(() => ({}))
    if (response.status === 428 && data.stepUpUrl) { window.location.assign(data.stepUpUrl); return }
    if (!response.ok) { toast({ title: 'تعذر حفظ قرار التوثيق', description: data.error, variant: 'destructive' }); return }
    toast({ title: 'تم حفظ قرار التوثيق' }); setVerificationDetail(null); await Promise.all([loadSummary(), loadVerifications()])
  }
  const decideDispute = async (id: string, status: 'RESOLVED_BUYER' | 'RESOLVED_SELLER' | 'REJECTED') => {
    const resolution = window.prompt('اكتب قرارًا واضحًا للعميل') || ''; if (resolution.trim().length < 3) return
    const response = await fetch('/api/disputes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, resolution }) }); const data = await response.json().catch(() => ({}))
    if (response.status === 428 && data.stepUpUrl) { window.location.assign(data.stepUpUrl); return }
    if (!response.ok) { toast({ title: 'تعذر حفظ قرار النزاع', description: data.error, variant: 'destructive' }); return }
    toast({ title: 'تم حفظ قرار النزاع' }); setDisputeDetail(null); await Promise.all([loadSummary(), loadDisputes()])
  }

  if (!summary) return <Card><CardContent className="p-6">جاري تحميل مركز المراجعة...</CardContent></Card>

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric icon={Store} value={summary.pendingVerifications} label="طلبات توثيق معلقة" />
      <Metric icon={ShieldAlert} value={summary.openDisputes} label="نزاعات مفتوحة" />
      <Metric icon={Copy} value={summary.duplicateParts.length} label="إعلانات مكررة محتملة" />
      <Metric icon={UserX} value={summary.suspiciousAccountCount} label="حسابات تحتاج مراجعة" />
    </div>

    <Card><CardHeader><CardTitle>طلبات اعتماد المتاجر</CardTitle></CardHeader><CardContent className="space-y-3">{verifications.rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات</p> : verifications.rows.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><b>{item.store?.name}</b><p className="text-xs text-muted-foreground">{item.store?.owner?.name} • {item.businessName || 'بدون اسم قانوني'}</p></div><Badge variant="outline">{item.status}</Badge><Button size="sm" variant="outline" onClick={async () => { const response = await fetch(`/api/seller-verification?scope=admin&id=${item.id}`, { cache: 'no-store' }); const data = await response.json(); if (response.ok) setVerificationDetail(data.request) }}>المستندات والقرار</Button></div>)}{verifications.nextCursor && <Button variant="outline" onClick={() => void loadVerifications(true)}>تحميل المزيد</Button>}</CardContent></Card>

    {verificationDetail && <Card className="border-primary/30"><CardHeader><CardTitle>{verificationDetail.store?.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">المالك: {verificationDetail.store?.owner?.name} — {verificationDetail.store?.owner?.email}</p><div className="flex flex-wrap gap-2">{safeUrls(verificationDetail.documentUrls).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm text-primary underline">عرض مستند</a>)}</div>{verificationDetail.status === 'PENDING' && <div className="flex gap-2"><Button onClick={() => void decideVerification(verificationDetail.id, 'APPROVED')}>اعتماد</Button><Button variant="outline" onClick={() => void decideVerification(verificationDetail.id, 'REJECTED')}>طلب تعديل</Button></div>}<Button size="sm" variant="ghost" onClick={() => setVerificationDetail(null)}>إغلاق</Button></CardContent></Card>}

    <Card><CardHeader><CardTitle>نزاعات حماية المشتري</CardTitle></CardHeader><CardContent className="space-y-3">{disputes.rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد نزاعات</p> : disputes.rows.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><b>{item.order?.part?.name || 'طلب'}</b><p className="text-sm">{item.reason}</p></div><Badge variant="outline">{item.status}</Badge><Button size="sm" variant="outline" onClick={async () => { const response = await fetch(`/api/disputes?scope=admin&id=${item.id}`, { cache: 'no-store' }); const data = await response.json(); if (response.ok) setDisputeDetail(data.dispute) }}>التفاصيل والقرار</Button></div>)}{disputes.nextCursor && <Button variant="outline" onClick={() => void loadDisputes(true)}>تحميل المزيد</Button>}</CardContent></Card>

    {disputeDetail && <Card className="border-primary/30"><CardHeader><CardTitle>تفاصيل النزاع</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">{disputeDetail.reason}</p>{disputeDetail.buyer && <p className="text-xs text-muted-foreground">{disputeDetail.buyer.name}{disputeDetail.buyer.email ? ` — ${disputeDetail.buyer.email}` : ''}</p>}{disputeDetail.status === 'OPEN' && <div className="flex flex-wrap gap-2"><Button onClick={() => void decideDispute(disputeDetail.id, 'RESOLVED_BUYER')}>قرار للمشتري</Button><Button variant="outline" onClick={() => void decideDispute(disputeDetail.id, 'RESOLVED_SELLER')}>قرار للبائع</Button><Button variant="ghost" onClick={() => void decideDispute(disputeDetail.id, 'REJECTED')}>رفض النزاع</Button></div>}<Button size="sm" variant="ghost" onClick={() => setDisputeDetail(null)}>إغلاق</Button></CardContent></Card>}

    <Card><CardHeader><CardTitle>آخر إجراءات الإدارة</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{summary.auditLogs.map((log) => <div key={log.id} className="flex flex-wrap justify-between gap-2 border-b py-2"><span>{log.action} — {log.targetType}</span><span className="text-muted-foreground">{log.actor?.name || 'النظام'} • {new Date(log.createdAt).toLocaleString('ar-EG')}</span></div>)}</CardContent></Card>
  </div>
}

function Metric({ icon: Icon, value, label }: { icon: typeof Store; value: number; label: string }) { return <Card><CardContent className="p-4"><Icon className="size-5 text-primary" /><b className="mt-2 block text-2xl">{value}</b><span className="text-xs text-muted-foreground">{label}</span></CardContent></Card> }
function safeUrls(value: unknown) { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === 'string' && url.startsWith('/api/private-image?')) : [] } catch { return [] } }
