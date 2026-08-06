'use client'

import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Mail, Phone, ShieldCheck, Store as StoreIcon, ShoppingBag, LayoutDashboard } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'مشتري',
  ADMIN: 'مدير النظام',
  SHOP_OWNER: 'صاحب محل',
}

export function ProfileView() {
  const { user, setView } = useAppStore()

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-semibold mb-4">سجّل الدخول لعرض ملفك</h2>
        <Button onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button>
      </div>
    )
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
