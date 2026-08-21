'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasswordResetView({ mode, token = '' }: { mode: 'request' | 'reset'; token?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (mode === 'reset' && password !== confirmation) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(mode === 'request' ? '/api/auth/forgot-password' : '/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'request' ? { email } : { token, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'تعذر إكمال الطلب.')
        return
      }
      setMessage(data.message || 'تم بنجاح.')
    } catch {
      setError('تعذر الاتصال. تحقق من اتصالك وحاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'request' ? 'استعادة كلمة المرور' : 'كلمة مرور جديدة'
  const description = mode === 'request' ? 'أدخل بريدك وسنرسل لك رابطاً آمناً لتغيير كلمة المرور.' : 'اختر كلمة مرور قوية لحسابك.'

  return (
    <div className="content-container flex min-h-[calc(100vh-13rem)] items-center justify-center py-10" dir="rtl">
      <Card className="market-card w-full max-w-md border-border/60 shadow-xl shadow-primary/5">
        <CardHeader className="text-center">
          <span className="mx-auto mb-3 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-8" /></span>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="leading-6">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {message ? (
            <div className="space-y-5 text-center" role="status">
              <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
              <p className="leading-7 text-muted-foreground">{message}</p>
              <Button asChild className="w-full"><Link href="/login">العودة لتسجيل الدخول</Link></Button>
            </div>
          ) : mode === 'reset' && !token ? (
            <div className="space-y-5 text-center">
              <p className="leading-7 text-destructive">رابط الاستعادة غير مكتمل. اطلب رابطاً جديداً.</p>
              <Button asChild className="w-full"><Link href="/forgot-password">طلب رابط جديد</Link></Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode === 'request' ? (
                <div className="space-y-2">
                  <Label htmlFor="reset-email">البريد الإلكتروني</Label>
                  <div className="relative"><Mail className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="reset-email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pr-9" required /></div>
                </div>
              ) : (
                <>
                  <div className="space-y-2"><Label htmlFor="new-password">كلمة المرور الجديدة</Label><Input id="new-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
                  <div className="space-y-2"><Label htmlFor="confirm-password">تأكيد كلمة المرور</Label><Input id="confirm-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
                </>
              )}
              {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? 'جاري المعالجة...' : mode === 'request' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور'}</Button>
              <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><span>{mode === 'request' ? 'ستظهر الرسالة نفسها سواء كان البريد مسجلاً أم لا لحماية خصوصية الحسابات.' : 'بعد الحفظ سيتم تسجيل خروج الحساب من الأجهزة الأخرى لحمايته.'}</span></div>
              <p className="text-center text-sm"><Link href="/login" className="font-bold text-primary hover:underline">العودة لتسجيل الدخول</Link></p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
