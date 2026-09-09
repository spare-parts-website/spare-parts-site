'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, KeyRound, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/lib/store'

export default function AdminSecurityPage() {
  const user = useAppStore((state) => state.user)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/auth/admin-mfa/step-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تأكيد الهوية')
      setCode('')
      setMessage('تم تأكيد هويتك. الإجراءات الحساسة متاحة لمدة 15 دقيقة.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تأكيد الهوية') } finally { setLoading(false) }
  }

  if (user && user.role !== 'ADMIN') return <div className="content-container py-16"><Card><CardHeader><CardTitle>غير مصرح</CardTitle></CardHeader></Card></div>

  return <div className="content-container max-w-2xl py-12">
    <Card>
      <CardHeader>
        <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div>
        <CardTitle>أمان المدير</CardTitle>
        <CardDescription>أكد هويتك برمز تطبيق المصادقة أو أحد رموز الاسترداد قبل تنفيذ تغيير حساس.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="admin-mfa-code">رمز المصادقة</Label><Input id="admin-mfa-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" placeholder="123456 أو رمز الاسترداد" dir="ltr" /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{message}</p>}
          <Button type="submit" disabled={loading || !code.trim()}><KeyRound className="ml-2 size-4" />{loading ? 'جاري التأكيد...' : 'تأكيد الهوية'}</Button>
        </form>
        <Button asChild variant="ghost" className="mt-5"><Link href="/admin/users"><ArrowRight className="ml-2 size-4" />العودة للوحة المدير</Link></Button>
      </CardContent>
    </Card>
  </div>
}
