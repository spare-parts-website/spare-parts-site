'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppStore, viewToPath } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Mail, Lock, User, Phone, Store, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useToast } from '@/hooks/use-toast'
import { ProfileAvatarPicker } from '@/components/profile-avatar-picker'

export function AuthView({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const setUser = useAppStore((state) => state.setUser)
  const pendingView = useAppStore((state) => state.pendingView)
  const setPendingView = useAppStore((state) => state.setPendingView)
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [verification, setVerification] = useState<{ challengeId: string; emailHint: string } | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    avatar: '',
    role: 'BUYER' as 'BUYER' | 'SHOP_OWNER',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : form
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error || 'حدث خطأ', variant: 'destructive' })
        return
      }
      if (data.verificationRequired) {
        setVerification({ challengeId: data.challengeId, emailHint: data.emailHint })
        setVerificationCode('')
        toast({
          title: 'تحقق من بريدك',
          description: mode === 'register'
            ? 'تم إنشاء الحساب! أرسلنا رمز تحقق من 4 أرقام لتأكيد بريدك الإلكتروني.'
            : 'أرسلنا رمزاً من 4 أرقام إلى بريدك الإلكتروني.',
        })
        return
      }
      setUser(data)
      toast({
        title: mode === 'login' ? 'مرحباً بعودتك' : 'تم التسجيل بنجاح',
        description: `أهلاً ${data.name}`,
      })
      const destination = pendingView || { name: 'home' }
      setPendingView(null)
      router.push(viewToPath(destination))
    } catch {
      toast({ title: 'تعذر الاتصال', description: 'تحقق من اتصالك وحاول مرة أخرى.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verification || verificationCode.length !== 4) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: verification.challengeId, code: verificationCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVerificationCode('')
        toast({ title: 'تعذر التحقق', description: data.error || 'الرمز غير صحيح', variant: 'destructive' })
        return
      }
      setUser(data)
      toast({ title: 'تم التحقق', description: `أهلاً ${data.name}` })
      const destination = pendingView || { name: 'home' }
      setPendingView(null)
      router.push(viewToPath(destination))
    } catch {
      toast({ title: 'تعذر الاتصال', description: 'تحقق من اتصالك وحاول مرة أخرى.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!verification || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/resend-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: verification.challengeId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر الإرسال', description: data.error || 'حاول مرة أخرى لاحقاً.', variant: 'destructive' })
        return
      }
      setVerification({ challengeId: data.challengeId, emailHint: data.emailHint })
      setVerificationCode('')
      toast({ title: 'تم إرسال رمز جديد', description: 'راجع صندوق الوارد والرسائل غير المرغوب فيها.' })
    } catch {
      toast({ title: 'تعذر الاتصال', description: 'تحقق من اتصالك وحاول مرة أخرى.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="content-container flex min-h-[calc(100vh-13rem)] items-center justify-center py-10">
      <div className="w-full max-w-md">
        <Card className="market-card border-border/60 shadow-xl shadow-primary/5">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <img src="/ghyar-market-logo.png" alt="غيار ماركت" className="h-16 w-28 object-contain drop-shadow-sm" />
            </div>
            <h1 className="text-2xl font-semibold leading-none">
              {verification ? 'تأكيد بريدك الإلكتروني' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </h1>
            <CardDescription>
              {verification
                ? `أدخل الرمز المرسل إلى ${verification.emailHint}`
                : mode === 'login'
                ? 'ادخل بياناتك للوصول إلى حسابك'
                : 'انضم إلى غيار ماركت'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verification ? (
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheck className="size-6" />
                  </div>
                  <p className="text-sm font-semibold">رمز التحقق مكوّن من 4 أرقام</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">ينتهي خلال 10 دقائق. لا تشارك الرمز مع أي شخص.</p>
                </div>

                <div className="space-y-2 text-center">
                  <Label htmlFor="login-code">رمز التحقق</Label>
                  <InputOTP
                    id="login-code"
                    maxLength={4}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={verificationCode}
                    onChange={setVerificationCode}
                    autoFocus
                    containerClassName="justify-center"
                    disabled={loading}
                  >
                    <InputOTPGroup dir="ltr">
                      {[0, 1, 2, 3].map((index) => (
                        <InputOTPSlot key={index} index={index} className="h-12 w-12 text-xl font-bold" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading || verificationCode.length !== 4}>
                  {loading ? 'جاري التحقق...' : mode === 'register' ? 'تأكيد البريد وتفعيل الحساب' : 'تأكيد وتسجيل الدخول'}
                </Button>

                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                  <button type="button" onClick={handleResend} disabled={loading} className="font-medium text-primary hover:underline disabled:opacity-50">
                    إرسال رمز جديد
                  </button>
                  <button type="button" onClick={() => { setVerification(null); setVerificationCode('') }} disabled={loading} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    {mode === 'register' ? 'العودة للتسجيل' : 'العودة لتسجيل الدخول'}
                  </button>
                </div>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="space-y-2">
                    <Label>صورة الحساب (اختياري)</Label>
                    <ProfileAvatarPicker value={form.avatar} onChange={(avatar) => setForm({ ...form, avatar })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم الكامل</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="pr-9"
                        placeholder="أدخل اسمك"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>نوع الحساب</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, role: 'BUYER' })}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition ${
                          form.role === 'BUYER'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <User className="size-5 text-primary" />
                        <span className="text-sm font-medium">مشتري</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, role: 'SHOP_OWNER' })}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition ${
                          form.role === 'SHOP_OWNER'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <Store className="size-5 text-primary" />
                        <span className="text-sm font-medium">صاحب محل</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="pr-9"
                        placeholder="01********"
                        type="tel"
                        dir="ltr"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">صيغة رقم الموبايل المصري (مثل: 01012345678)</p>
                  </div>

                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="pr-9"
                    placeholder="example@email.com"
                    required
                    dir="ltr"
                  />
                </div>
                {mode === 'register' && (
                  <p className="text-xs text-muted-foreground">
                    يلزم تأكيد بريدك الإلكتروني برمز تحقق مكوّن من 4 أرقام لتفعيل الحساب واستخدامه.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3"><Label htmlFor="password">كلمة المرور</Label>{mode === 'login' && <Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>}</div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="pr-9 pl-11"
                        placeholder="••••••••"
                        required
                        minLength={8}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-primary"
                        aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading
                  ? 'جاري المعالجة...'
                  : mode === 'login'
                    ? 'دخول'
                    : 'تسجيل'}
              </Button>
            </form>
            )}

            {!verification && <div className="text-center text-sm text-muted-foreground mt-4">
              {mode === 'login' ? (
                <>
                  ليس لديك حساب؟{' '}
                  <button
                    onClick={() => router.push('/register')}
                    className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    سجّل الآن
                  </button>
                </>
              ) : (
                <>
                  لديك حساب؟{' '}
                  <button
                    onClick={() => router.push('/login')}
                    className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    سجّل الدخول
                  </button>
                </>
              )}
            </div>}

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
