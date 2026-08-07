'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Mail, Lock, User, Phone, Store } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function AuthView({ mode }: { mode: 'login' | 'register' }) {
  const { setView, setUser, pendingView } = useAppStore()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
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
      setUser(data)
      toast({
        title: mode === 'login' ? 'مرحباً بعودتك' : 'تم التسجيل بنجاح',
        description: `أهلاً ${data.name}`,
      })
      setView(pendingView || { name: 'home' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="text-center pb-4">
            <div className="size-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-3 shadow-sm">
              <img src="/ghyar-market-logo.png" alt="غيار ماركت" className="size-14 rounded-2xl object-contain drop-shadow-sm" />
            </div>
            <CardTitle className="text-2xl">
              {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'ادخل بياناتك للوصول إلى حسابك'
                : 'انضم إلى غيار ماركت'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
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
                        placeholder="05xxxxxxxx"
                        type="tel"
                      />
                    </div>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="pr-9"
                        placeholder="••••••••"
                        required
                        minLength={8}
                        dir="ltr"
                      />
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

            <div className="text-center text-sm text-muted-foreground mt-4">
              {mode === 'login' ? (
                <>
                  ليس لديك حساب؟{' '}
                  <button
                    onClick={() => setView({ name: 'register' })}
                    className="text-primary hover:underline font-medium"
                  >
                    سجّل الآن
                  </button>
                </>
              ) : (
                <>
                  لديك حساب؟{' '}
                  <button
                    onClick={() => setView({ name: 'login' })}
                    className="text-primary hover:underline font-medium"
                  >
                    سجّل الدخول
                  </button>
                </>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
