'use client'

import { cloneElement, isValidElement, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppStore, viewToPath } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Mail, Lock, User, Phone, Store, ShieldCheck, KeyRound, Copy, CheckCircle2 } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useToast } from '@/hooks/use-toast'
import { ProfileAvatarPicker } from '@/components/profile-avatar-picker'

type Verification = { challengeId: string; emailHint: string; adminBootstrap?: boolean }
type AdminLoginMfa = { challengeId: string }
type Enrollment = { enrollmentId: string; secret: string; otpauthUri: string; account: string }

export function AuthView({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const setUser = useAppStore((state) => state.setUser)
  const pendingView = useAppStore((state) => state.pendingView)
  const setPendingView = useAppStore((state) => state.setPendingView)
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [verification, setVerification] = useState<Verification | null>(null)
  const [adminMfa, setAdminMfa] = useState<AdminLoginMfa | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', avatar: '', role: 'BUYER' as 'BUYER' | 'SHOP_OWNER' })

  const finishLogin = (user: any) => {
    setUser(user)
    const destination = pendingView || { name: user?.role === 'ADMIN' ? 'admin-dashboard' : 'home' as const }
    setPendingView(null)
    router.push(viewToPath(destination as any))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : form) })
      const data = await response.json()
      if (!response.ok) { toast({ title: 'خطأ', description: data.error || 'حدث خطأ', variant: 'destructive' }); return }
      if (data.adminMfaRequired || data.mfaRequired) { setAdminMfa({ challengeId: data.challengeId }); setMfaCode(''); return }
      if (data.adminMfaSetupRequired) {
        const setupResponse = await fetch('/api/auth/admin-mfa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupChallengeId: data.setupChallengeId }) })
        const setup = await setupResponse.json()
        if (!setupResponse.ok) throw new Error(setup.error || 'تعذر بدء إعداد المصادقة')
        setEnrollment(setup); setMfaCode(''); return
      }
      if (data.verificationRequired) {
        setVerification({ challengeId: data.challengeId, emailHint: data.emailHint || form.email, adminBootstrap: Boolean(data.adminBootstrap) }); setVerificationCode('')
        toast({ title: 'تحقق من بريدك', description: 'أرسلنا رمز تحقق من 6 أرقام.' }); return
      }
      if (data.user) finishLogin(data.user)
    } catch { toast({ title: 'تعذر الاتصال', description: 'تحقق من اتصالك وحاول مرة أخرى.', variant: 'destructive' }) } finally { setLoading(false) }
  }

  const handleVerifyEmail = async (event: React.FormEvent) => {
    event.preventDefault(); if (!verification || verificationCode.length !== 6) return; setLoading(true)
    try {
      const response = await fetch('/api/auth/verify-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: verification.challengeId, code: verificationCode }) })
      const data = await response.json()
      if (!response.ok) { setVerificationCode(''); toast({ title: 'تعذر التحقق', description: data.error || 'الرمز غير صحيح', variant: 'destructive' }); return }
      if (data.adminMfaSetupRequired) {
        const setupResponse = await fetch('/api/auth/admin-mfa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bootstrapChallengeId: data.bootstrapChallengeId }) })
        const setup = await setupResponse.json()
        if (!setupResponse.ok) throw new Error(setup.error || 'تعذر بدء إعداد المصادقة')
        setVerification(null); setVerificationCode(''); setEnrollment(setup); setMfaCode(''); return
      }
      finishLogin(data.user)
    } catch (error) { toast({ title: 'تعذر المتابعة', description: error instanceof Error ? error.message : 'تحقق من اتصالك وحاول مرة أخرى.', variant: 'destructive' }) } finally { setLoading(false) }
  }

  const handleAdminMfa = async (event: React.FormEvent) => {
    event.preventDefault(); if (!adminMfa || !mfaCode.trim()) return; setLoading(true)
    try {
      const response = await fetch('/api/auth/verify-admin-mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: adminMfa.challengeId, code: mfaCode }) })
      const data = await response.json()
      if (!response.ok) { setMfaCode(''); toast({ title: 'تعذر التحقق', description: data.error || 'رمز المصادقة غير صحيح', variant: 'destructive' }); return }
      finishLogin(data.user)
    } catch { toast({ title: 'تعذر الاتصال', description: 'حاول مرة أخرى.', variant: 'destructive' }) } finally { setLoading(false) }
  }

  const confirmEnrollment = async (event: React.FormEvent) => {
    event.preventDefault(); if (!enrollment || mfaCode.length !== 6) return; setLoading(true)
    try {
      const response = await fetch('/api/auth/admin-mfa/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId: enrollment.enrollmentId, code: mfaCode }) })
      const data = await response.json()
      if (!response.ok) { setMfaCode(''); toast({ title: 'تعذر التفعيل', description: data.error || 'الرمز غير صحيح', variant: 'destructive' }); return }
      setUser(data.user); setRecoveryCodes(data.recoveryCodes || []); setEnrollment(null); setMfaCode('')
    } catch { toast({ title: 'تعذر الاتصال', description: 'حاول مرة أخرى.', variant: 'destructive' }) } finally { setLoading(false) }
  }

  const resend = async () => {
    if (!verification || loading) return; setLoading(true)
    try {
      const response = await fetch('/api/auth/resend-login-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: verification.challengeId }) })
      const data = await response.json()
      if (!response.ok) { toast({ title: 'تعذر الإرسال', description: data.error || 'حاول لاحقاً.', variant: 'destructive' }); return }
      setVerification((current) => current ? { ...current, challengeId: data.challengeId, emailHint: data.emailHint || current.emailHint } : current); setVerificationCode('')
      toast({ title: 'تم إرسال رمز جديد', description: 'راجع صندوق الوارد والرسائل غير المرغوب فيها.' })
    } catch { toast({ title: 'تعذر الاتصال', description: 'حاول مرة أخرى.', variant: 'destructive' }) } finally { setLoading(false) }
  }

  const copyText = async (value: string) => { try { await navigator.clipboard.writeText(value); toast({ title: 'تم النسخ' }) } catch { toast({ title: 'تعذر النسخ', variant: 'destructive' }) } }
  const completeRecovery = () => { setRecoveryCodes(null); const user = useAppStore.getState().user; router.push(user?.role === 'ADMIN' ? '/admin/users' : '/') }

  const title = recoveryCodes ? 'احفظ رموز الاسترداد' : enrollment ? 'إعداد تطبيق المصادقة' : adminMfa ? 'مصادقة الحساب' : verification ? (verification.adminBootstrap ? 'تأكيد أمان المدير' : 'تأكيد بريدك الإلكتروني') : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'

  return <div className="content-container flex min-h-[calc(100vh-13rem)] items-center justify-center py-10"><div className="w-full max-w-md"><Card className="market-card border-border/60 shadow-xl shadow-primary/5"><CardHeader className="text-center pb-4"><div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><ShieldCheck className="size-8" /></div><h1 className="text-2xl font-semibold leading-none">{title}</h1><CardDescription>{verification ? `أدخل الرمز المرسل إلى ${verification.emailHint}` : adminMfa ? 'أدخل رمز تطبيق المصادقة أو رمز استرداد.' : enrollment ? 'أضف الحساب إلى تطبيق مصادقة مثل Google Authenticator أو Microsoft Authenticator.' : recoveryCodes ? 'هذه الرموز تظهر مرة واحدة. احفظها في مكان آمن بعيداً عن حسابك.' : mode === 'login' ? 'ادخل بياناتك للوصول إلى حسابك' : 'انضم إلى غيار ماركت'}</CardDescription></CardHeader><CardContent>
    {recoveryCodes ? <div className="space-y-5"><div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm leading-6"><strong>مهم:</strong> كل رمز يعمل مرة واحدة عند فقدان تطبيق المصادقة. لا ترسل هذه الرموز لأي شخص.</div><div dir="ltr" className="grid grid-cols-1 gap-2 rounded-2xl border bg-muted/30 p-4 font-mono text-sm">{recoveryCodes.map((code) => <div key={code} className="flex items-center justify-between gap-3"><code>{code}</code><button type="button" onClick={() => copyText(code)} aria-label="نسخ رمز الاسترداد"><Copy className="size-4" /></button></div>)}</div><Button type="button" className="w-full" onClick={completeRecovery}><CheckCircle2 className="ml-2 size-4" />حفظت الرموز — متابعة</Button></div>
    : enrollment ? <form onSubmit={confirmEnrollment} className="space-y-5"><div className="space-y-3 rounded-2xl border p-4"><p className="text-sm font-bold">1. أضف حساباً جديداً في تطبيق المصادقة.</p><p className="text-xs text-muted-foreground">المُصدر: Ghyar Market — الحساب: <span dir="ltr">{enrollment.account}</span></p><Label>المفتاح اليدوي</Label><div className="flex gap-2"><Input readOnly dir="ltr" value={enrollment.secret} className="font-mono" /><Button type="button" variant="outline" size="icon" onClick={() => copyText(enrollment.secret)}><Copy className="size-4" /></Button></div><details className="text-xs"><summary className="cursor-pointer font-medium text-primary">إظهار رابط otpauth المتقدم</summary><div className="mt-2 flex gap-2"><Input readOnly dir="ltr" value={enrollment.otpauthUri} className="text-[10px]" /><Button type="button" variant="outline" size="icon" onClick={() => copyText(enrollment.otpauthUri)}><Copy className="size-4" /></Button></div></details></div><div className="space-y-2"><Label>2. رمز التطبيق المكون من 6 أرقام</Label><SixDigitOtp value={mfaCode} onChange={setMfaCode} disabled={loading} /></div><Button className="w-full" size="lg" disabled={loading || mfaCode.length !== 6}>{loading ? 'جاري التفعيل...' : 'تفعيل المصادقة وحفظ الحساب'}</Button></form>
    : adminMfa ? <form onSubmit={handleAdminMfa} className="space-y-5"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">استخدم رمزاً من تطبيق المصادقة. إذا فقدت التطبيق يمكنك استخدام أحد رموز الاسترداد المحفوظة.</div><div className="space-y-2"><Label>رمز التطبيق أو الاسترداد</Label><Input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoFocus autoComplete="one-time-code" dir="ltr" placeholder="123456 أو XXXX-XXXX-XXXX-XXXX" /></div><Button className="w-full" size="lg" disabled={loading || !mfaCode.trim()}><KeyRound className="ml-2 size-4" />{loading ? 'جاري التحقق...' : 'تأكيد وتسجيل الدخول'}</Button><button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => { setAdminMfa(null); setMfaCode('') }}>العودة لتسجيل الدخول</button></form>
    : verification ? <form onSubmit={handleVerifyEmail} className="space-y-5"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center"><ShieldCheck className="mx-auto mb-3 size-6 text-primary" /><p className="text-sm font-semibold">رمز التحقق مكوّن من 6 أرقام</p><p className="mt-1 text-xs leading-6 text-muted-foreground">ينتهي خلال 10 دقائق وبحد أقصى 5 محاولات.</p></div><div className="space-y-2 text-center"><Label>رمز التحقق</Label><SixDigitOtp value={verificationCode} onChange={setVerificationCode} disabled={loading} /></div><Button className="w-full" size="lg" disabled={loading || verificationCode.length !== 6}>{loading ? 'جاري التحقق...' : verification.adminBootstrap ? 'تأكيد البريد وإعداد تطبيق المصادقة' : mode === 'register' ? 'تأكيد البريد وتفعيل الحساب' : 'تأكيد وتسجيل الدخول'}</Button><div className="flex flex-wrap justify-center gap-4 text-sm"><button type="button" onClick={resend} disabled={loading} className="font-medium text-primary hover:underline disabled:opacity-50">إرسال رمز جديد</button><button type="button" onClick={() => { setVerification(null); setVerificationCode('') }} className="text-muted-foreground hover:text-foreground">العودة</button></div></form>
    : <form onSubmit={handleSubmit} className="space-y-4">{mode === 'register' && <><div className="space-y-2"><Label>صورة الحساب (اختياري)</Label><ProfileAvatarPicker value={form.avatar} onChange={(avatar) => setForm({ ...form, avatar })} /></div><Field label="الاسم الكامل" icon={<User className="size-4" />}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="pr-9" required /></Field><div className="space-y-2"><Label>نوع الحساب</Label><div className="grid grid-cols-2 gap-2"><RoleButton active={form.role === 'BUYER'} onClick={() => setForm({ ...form, role: 'BUYER' })} icon={<User className="size-5" />} label="مشتري" /><RoleButton active={form.role === 'SHOP_OWNER'} onClick={() => setForm({ ...form, role: 'SHOP_OWNER' })} icon={<Store className="size-5" />} label="صاحب محل" /></div></div><Field label="رقم الهاتف (اختياري)" icon={<Phone className="size-4" />}><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="pr-9" type="tel" dir="ltr" placeholder="01********" /></Field></>}<Field label="البريد الإلكتروني" icon={<Mail className="size-4" />}><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="pr-9" required dir="ltr" /></Field>{mode === 'register' && <p className="text-xs text-muted-foreground">يجب تأكيد البريد برمز من 6 أرقام قبل تفعيل الحساب.</p>}<div className="space-y-2"><div className="flex items-center justify-between"><Label>كلمة المرور</Label>{mode === 'login' && <Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>}</div><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="pr-9" required minLength={8} dir="ltr" /></div></div><Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? 'جاري المعالجة...' : mode === 'login' ? 'دخول' : 'تسجيل'}</Button></form>}
    {!verification && !adminMfa && !enrollment && !recoveryCodes && <div className="mt-4 text-center text-sm text-muted-foreground">{mode === 'login' ? <>ليس لديك حساب؟ <Link href="/register" className="font-semibold text-foreground hover:text-primary hover:underline">سجّل الآن</Link></> : <>لديك حساب؟ <Link href="/login" className="font-semibold text-foreground hover:text-primary hover:underline">تسجيل الدخول</Link></>}</div>}
  </CardContent></Card></div></div>
}

function SixDigitOtp({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={value} onChange={onChange} autoFocus containerClassName="justify-center" disabled={disabled}><InputOTPGroup dir="ltr">{[0,1,2,3,4,5].map((index) => <InputOTPSlot key={index} index={index} className="h-12 w-11 text-xl font-bold" />)}</InputOTPGroup></InputOTP>
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  const accessibleChild = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
    : children

  return <div className="space-y-2"><Label>{label}</Label><div className="relative"><span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>{accessibleChild}</div></div>
}
function RoleButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>{icon}<span className="text-sm font-medium">{label}</span></button>
}
