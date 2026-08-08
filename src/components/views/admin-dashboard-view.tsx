'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Users,
  Package,
  ShoppingBag,
  Star,
  Store as StoreIcon,
  Trash2,
  Ban,
  CheckCircle,
  ShieldCheck,
  Mail,
  Phone,
  Calendar,
  Flag,
} from 'lucide-react'
import { StatusBadge, formatPrice, Stars } from '@/components/common'
import { useToast } from '@/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'مشتري',
  ADMIN: 'مدير',
  SHOP_OWNER: 'صاحب محل',
}

export function AdminDashboardView({ tab: initialTab }: { tab?: 'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports' }) {
  const { user } = useAppStore()
  const { toast } = useToast()
  const [tab, setTab] = useState<'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports'>(initialTab || 'users')
  const [users, setUsers] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [productReviews, setProductReviews] = useState<any[]>([])
  const [storeReviews, setStoreReviews] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    const [u, p, s, o, r, b] = await Promise.all([
      fetch('/api/admin/users', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/parts', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/stores', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/orders?scope=admin', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/reviews', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/reports', { cache: 'no-store' }).then((r) => r.json()),
    ])
    setUsers(u.users || [])
    setParts(p.parts || [])
    setStores(s.stores || [])
    setOrders(o.orders || [])
    setProductReviews(r.productReviews || [])
    setStoreReviews(r.storeReviews || [])
    setReports(b.reports || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') loadAll()
  }, [user])

  const handleRoleChange = async (id: string, role: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم التحديث', description: 'تم تغيير دور المستخدم' })
      loadAll()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return
    const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      toast({ title: 'تم الحذف', description: 'تم حذف المستخدم' })
      loadAll()
    } else {
      toast({ title: 'تعذر الحذف', description: data.error || 'حدث خطأ أثناء حذف المستخدم', variant: 'destructive' })
    }
  }

  const handleDeleteStore = async (id: string) => {
    if (!confirm('سيتم حذف المتجر وقطعه وتقييماته نهائياً. هل أنت متأكد؟')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/stores?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر حذف المتجر', description: data.error || 'حدث خطأ أثناء حذف المتجر', variant: 'destructive' })
        return
      }
      toast({ title: 'تم حذف المتجر', description: 'تم حذف المتجر وبياناته التابعة' })
      loadAll()
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyStore = async (id: string, verified: boolean) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/stores', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, verified: !verified }) })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر تحديث المتجر', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: data.store.verified ? 'تم توثيق المتجر' : 'تم إلغاء التوثيق' })
      loadAll()
    } finally {
      setSubmitting(false)
    }
  }

  const handleTogglePartBlock = async (id: string, blocked: boolean) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/parts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, blocked: !blocked }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: blocked ? 'تم رفع الحظر' : 'تم الحظر', description: 'تم تحديث حالة القطعة' })
      loadAll()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePart = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه القطعة نهائياً؟')) return
    const res = await fetch(`/api/parts?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      toast({ title: 'تم الحذف', description: 'تم حذف القطعة' })
      loadAll()
    } else {
      toast({ title: 'تعذر حذف القطعة', description: data.error || 'حدث خطأ أثناء حذف القطعة', variant: 'destructive' })
    }
  }

  const handleToggleReviewBlock = async (id: string, type: string, blocked: boolean) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, blocked: !blocked }),
      })
      if (res.ok) {
        toast({ title: blocked ? 'تم إلغاء الحجب' : 'تم الحجب' })
        loadAll()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteReview = async (id: string, type: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم؟')) return
    const res = await fetch(`/api/reviews?id=${id}&type=${type}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'تم الحذف' })
      loadAll()
    }
  }

  const handleReportDecision = async (id: string, status: 'REVIEWED' | 'DISMISSED' | 'BLOCKED') => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر تحديث البلاغ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم تحديث البلاغ' })
      loadAll()
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShieldCheck className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">هذه الصفحة مخصصة للمدير فقط</h2>
      </div>
    )
  }

  const stats = {
    users: users.length,
    stores: stores.length,
    parts: parts.length,
    orders: orders.length,
    blockedParts: parts.filter((part) => part.blocked).length,
    pendingReviews: productReviews.filter((r) => !r.blocked).length + storeReviews.filter((r) => !r.blocked).length,
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">لوحة تحكم المدير</h1>
        <p className="text-muted-foreground mt-1">إدارة شاملة للنظام</p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: 'المستخدمون', value: stats.users, icon: Users },
          { label: 'المتاجر', value: stats.stores, icon: StoreIcon },
          { label: 'قطع الغيار', value: stats.parts, icon: Package },
          { label: 'الطلبات', value: stats.orders, icon: ShoppingBag },
          { label: 'قطع محجوبة', value: stats.blockedParts, icon: Ban },
          { label: 'تقييمات نشطة', value: stats.pendingReviews, icon: Star },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <stat.icon className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full max-w-3xl grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="users" className="gap-1 text-xs sm:text-sm">
            <Users className="size-4" />
            <span className="hidden sm:inline">المستخدمون</span>
          </TabsTrigger>
          <TabsTrigger value="stores" className="gap-1 text-xs sm:text-sm">
            <StoreIcon className="size-4" />
            <span className="hidden sm:inline">المتاجر</span>
          </TabsTrigger>
          <TabsTrigger value="parts" className="gap-1 text-xs sm:text-sm">
            <Package className="size-4" />
            <span className="hidden sm:inline">القطع</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1 text-xs sm:text-sm">
            <ShoppingBag className="size-4" />
            <span className="hidden sm:inline">الطلبات</span>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="gap-1 text-xs sm:text-sm">
            <Star className="size-4" />
            <span className="hidden sm:inline">التقييمات</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1 text-xs sm:text-sm">
            <Flag className="size-4" />
            <span className="hidden sm:inline">البلاغات</span>
          </TabsTrigger>
        </TabsList>

        {/* Users */}
        <TabsContent value="users" className="space-y-4">
          <h2 className="text-lg font-semibold">إدارة المستخدمين ({users.length})</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[920px] table-fixed text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="w-44 text-right p-3 font-semibold">الاسم</th>
                        <th className="w-64 text-right p-3 font-semibold">البريد</th>
                        <th className="w-40 text-right p-3 font-semibold">الهاتف</th>
                        <th className="w-36 text-right p-3 font-semibold">الدور</th>
                        <th className="w-36 text-right p-3 font-semibold">تاريخ التسجيل</th>
                        <th className="w-24 text-right p-3 font-semibold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                {u.name.charAt(0)}
                              </div>
                              <span className="font-medium truncate" title={u.name}>{u.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap" dir="ltr"><span className="block truncate" title={u.email}>{u.email}</span></td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap" dir="ltr">{u.phone || '—'}</td>
                          <td className="p-3 whitespace-nowrap">
                            <Select
                              value={u.role}
                              onValueChange={(v) => handleRoleChange(u.id, v)}
                              disabled={submitting || u.id === user.id}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BUYER">مشتري</SelectItem>
                                <SelectItem value="SHOP_OWNER">صاحب محل</SelectItem>
                                <SelectItem value="ADMIN">مدير</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString('ar-SA')}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={u.id === user.id}
                            >
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="space-y-4">
          <h2 className="text-lg font-semibold">بلاغات المستخدمين ({reports.filter((r) => r.status === 'OPEN').length} مفتوحة)</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : reports.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بلاغات</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <Card key={report.id} className={report.status !== 'OPEN' ? 'opacity-70' : ''}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={report.status === 'OPEN' ? 'destructive' : 'outline'}>{report.status === 'OPEN' ? 'مفتوح' : report.status}</Badge>
                          <Badge variant="secondary">{report.targetType === 'part' ? 'قطعة' : report.targetType === 'store' ? 'متجر' : 'مستخدم'}</Badge>
                          <span className="font-semibold break-words">{report.target?.name || report.targetId}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">من: {report.reporter?.name} ({report.reporter?.email}) • {new Date(report.createdAt).toLocaleString('ar-SA')}</p>
                      </div>
                      <Flag className="size-5 text-amber-500 shrink-0 self-end sm:self-start" />
                    </div>
                    <p className="font-medium">{report.reason}</p>
                    {report.details && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.details}</p>}
                    {report.status === 'OPEN' && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button size="sm" variant="outline" onClick={() => handleReportDecision(report.id, 'DISMISSED')} disabled={submitting}>رفض البلاغ</Button>
                        <Button size="sm" onClick={() => handleReportDecision(report.id, 'REVIEWED')} disabled={submitting}>تمت المراجعة</Button>
                        {report.targetType === 'part' && <Button size="sm" variant="destructive" onClick={() => handleReportDecision(report.id, 'BLOCKED')} disabled={submitting}>حظر القطعة</Button>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Stores */}
        <TabsContent value="stores" className="space-y-4">
          <h2 className="text-lg font-semibold">المتاجر ({stores.length})</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <StoreIcon className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold line-clamp-1">{s.name}</h3>
                          {s.verified && <ShieldCheck className="size-4 text-emerald-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {s.address || 'بدون عنوان'}
                        </p>
                      </div>
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {s.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="secondary">
                        <Package className="size-3 ml-1" />
                        {s._count?.parts || 0} قطعة
                      </Badge>
                      <Stars value={s.avgRating || 0} size={12} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                      <div className="w-full sm:flex-1 min-w-0 text-xs text-muted-foreground truncate" dir="ltr">
                        {s.owner?.email || 'بدون مالك'}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleVerifyStore(s.id, s.verified)} disabled={submitting} className="shrink-0 gap-1">
                        <ShieldCheck className="size-3.5" />
                        {s.verified ? 'إلغاء التوثيق' : 'توثيق'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteStore(s.id)}
                        disabled={submitting}
                        className="shrink-0 gap-1"
                      >
                        <Trash2 className="size-3.5" />
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Parts */}
        <TabsContent value="parts" className="space-y-4">
          <h2 className="text-lg font-semibold">قطع الغيار ({parts.length})</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-right p-3 font-semibold">القطعة</th>
                        <th className="text-right p-3 font-semibold">المتجر</th>
                        <th className="text-right p-3 font-semibold">السعر</th>
                        <th className="text-right p-3 font-semibold">المخزون</th>
                        <th className="text-right p-3 font-semibold">الحالة</th>
                        <th className="text-right p-3 font-semibold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-medium max-w-56 truncate whitespace-nowrap" title={p.name}>{p.name}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{p.store?.name}</td>
                          <td className="p-3 text-primary font-medium whitespace-nowrap">{formatPrice(p.price)}</td>
                          <td className="p-3 whitespace-nowrap">{p.stock}</td>
                          <td className="p-3 whitespace-nowrap">
                            {p.blocked ? (
                              <Badge variant="destructive">محظور</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-200">نشط</Badge>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleTogglePartBlock(p.id, p.blocked)}
                                disabled={submitting}
                                title={p.blocked ? 'رفع الحظر' : 'حظر'}
                              >
                                {p.blocked ? (
                                  <CheckCircle className="size-4 text-emerald-500" />
                                ) : (
                                  <Ban className="size-4 text-amber-500" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeletePart(p.id)}
                              >
                                <Trash2 className="size-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="space-y-4">
          <h2 className="text-lg font-semibold">الطلبات ({orders.length})</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-right p-3 font-semibold">القطعة</th>
                        <th className="text-right p-3 font-semibold">المتجر</th>
                        <th className="text-right p-3 font-semibold">العميل</th>
                        <th className="text-right p-3 font-semibold">الإجمالي</th>
                        <th className="text-right p-3 font-semibold">الحالة</th>
                        <th className="text-right p-3 font-semibold">الدفع</th>
                        <th className="text-right p-3 font-semibold">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-medium max-w-40 truncate whitespace-nowrap" title={o.part.name}>{o.part.name}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{o.store.name}</td>
                          <td className="p-3 whitespace-nowrap">{o.buyer.name}</td>
                          <td className="p-3 text-primary font-medium whitespace-nowrap">{formatPrice(o.totalPrice)}</td>
                          <td className="p-3 whitespace-nowrap"><StatusBadge status={o.status} /></td>
                          <td className="p-3 whitespace-nowrap"><StatusBadge status={o.paymentStatus} /></td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(o.createdAt).toLocaleDateString('ar-SA')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reviews */}
        <TabsContent value="reviews" className="space-y-4">
          <h2 className="text-lg font-semibold">مراجعة التقييمات</h2>
          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <div className="space-y-4">
              {/* Product reviews */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="size-4" />
                    تقييمات القطع ({productReviews.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {productReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">لا توجد تقييمات</p>
                  ) : (
                    productReviews.map((r) => (
                      <div key={r.id} className={`p-3 rounded-lg border ${r.blocked ? 'bg-muted/30 opacity-60' : ''}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm break-words">{r.user.name}</span>
                              <Stars value={r.rating} size={12} />
                              {r.blocked && <Badge variant="destructive" className="text-xs">محجوب</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 break-words">
                              على: {r.part.name} • {new Date(r.createdAt).toLocaleDateString('ar-SA')}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0 self-end sm:self-start">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleToggleReviewBlock(r.id, 'product', r.blocked)}
                              disabled={submitting}
                              title={r.blocked ? 'إلغاء الحجب' : 'حجب'}
                            >
                              {r.blocked ? (
                                <CheckCircle className="size-4 text-emerald-500" />
                              ) : (
                                <Ban className="size-4 text-amber-500" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteReview(r.id, 'product')}
                            >
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                        {r.comment && (
                          <p className="text-sm text-muted-foreground">{r.comment}</p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Store reviews */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <StoreIcon className="size-4" />
                    تقييمات المتاجر ({storeReviews.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {storeReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">لا توجد تقييمات</p>
                  ) : (
                    storeReviews.map((r) => (
                      <div key={r.id} className={`p-3 rounded-lg border ${r.blocked ? 'bg-muted/30 opacity-60' : ''}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm break-words">{r.user.name}</span>
                              <Stars value={r.rating} size={12} />
                              {r.blocked && <Badge variant="destructive" className="text-xs">محجوب</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 break-words">
                              على: {r.store.name} • {new Date(r.createdAt).toLocaleDateString('ar-SA')}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0 self-end sm:self-start">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleToggleReviewBlock(r.id, 'store', r.blocked)}
                              disabled={submitting}
                            >
                              {r.blocked ? (
                                <CheckCircle className="size-4 text-emerald-500" />
                              ) : (
                                <Ban className="size-4 text-amber-500" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteReview(r.id, 'store')}
                            >
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                        {r.comment && (
                          <p className="text-sm text-muted-foreground">{r.comment}</p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
