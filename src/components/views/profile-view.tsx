'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Mail, Phone, ShieldCheck, Store as StoreIcon, ShoppingBag, LayoutDashboard, Save, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'مشتري',
  ADMIN: 'مدير النظام',
  SHOP_OWNER: 'صاحب محل',
}

export function ProfileView() {
  const { user, setUser, setView } = useAppStore()
  const { toast } = useToast()
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', currentPassword: '', newPassword: '' })
  const [saving, setSaving] = useState(false)

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-semibold mb-4">سجّل الدخول لعرض ملفك</h2>
        <Button onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button>
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر حفظ الحساب', description: data.error, variant: 'destructive' })
        return
      }
      setUser(data.user)
      setForm((current) => ({ ...current, currentPassword: '', newPassword: '' }))
      toast({ title: 'تم تحديث الحساب', description: 'تم حفظ معلوماتك بنجاح' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">الملف الشخصي</h1>
        <p className="text-muted-foreground mt-1">معلومات حسابك</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <Avatar className="size-20">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                {user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <Badge variant="secondary" className="mt-1">
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-4 text-primary" />
                  <span dir="ltr">{user.email}</span>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-4 text-primary" />
                    <span dir="ltr">{user.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>تعديل الحساب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>كلمة المرور الحالية</Label><Input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} placeholder="مطلوبة عند تغيير كلمة المرور" /></div>
            <div className="space-y-2"><Label>كلمة المرور الجديدة</Label><Input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} placeholder="8 أحرف على الأقل" /></div>
          </div>
          <Button onClick={save} disabled={saving}><Save className="size-4 ml-1" />{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="size-3" /> لا نطلب كلمة المرور الحالية إلا عند تغيير كلمة المرور.</p>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {(user.role === 'BUYER' || user.role === 'SHOP_OWNER') && (
            <Button variant="outline" onClick={() => setView({ name: 'orders' })} className="justify-start h-auto p-4">
              <ShoppingBag className="size-5 ml-2" />
              <div className="text-right">
                <p className="font-medium">طلباتي</p>
                <p className="text-xs text-muted-foreground">عرض ومتابعة طلباتك</p>
              </div>
            </Button>
          )}
          {user.role === 'SHOP_OWNER' && (
            <Button variant="outline" onClick={() => setView({ name: 'shop-dashboard' })} className="justify-start h-auto p-4">
              <LayoutDashboard className="size-5 ml-2" />
              <div className="text-right">
                <p className="font-medium">لوحة تحكم المحل</p>
                <p className="text-xs text-muted-foreground">إدارة قطع الغيار والطلبات</p>
              </div>
            </Button>
          )}
          {user.role === 'ADMIN' && (
            <Button variant="outline" onClick={() => setView({ name: 'admin-dashboard' })} className="justify-start h-auto p-4">
              <ShieldCheck className="size-5 ml-2" />
              <div className="text-right">
                <p className="font-medium">لوحة المدير</p>
                <p className="text-xs text-muted-foreground">إدارة شاملة للنظام</p>
              </div>
            </Button>
          )}
          <Button variant="outline" onClick={() => setView({ name: 'parts' })} className="justify-start h-auto p-4">
            <StoreIcon className="size-5 ml-2" />
            <div className="text-right">
              <p className="font-medium">تصفح قطع الغيار</p>
              <p className="text-xs text-muted-foreground">استكشف المتاجر والقطع</p>
            </div>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
