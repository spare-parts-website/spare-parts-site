'use client'

import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  ShoppingCart,
  Package,
  Store as StoreIcon,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Truck,
  ShieldCheck,
} from 'lucide-react'
import { formatPrice } from '@/components/common'
import { useToast } from '@/hooks/use-toast'

export function CheckoutView() {
  const { cart, user, setView, clearCart, setCartOpen } = useAppStore()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const checkoutId = useRef<string | null>(null)
  const [form, setForm] = useState({
    deliveryAddress: '',
    notes: '',
    couponCode: '',
  })

  // Group cart items by store
  const storeGroups = useMemo<Record<string, { storeName: string; items: typeof cart; subtotal: number }>>(() => cart.reduce((acc, item) => {
    if (!acc[item.storeId]) {
      acc[item.storeId] = { storeName: item.storeName, items: [], subtotal: 0 }
    }
    acc[item.storeId].items.push(item)
    acc[item.storeId].subtotal += item.price * item.quantity
    return acc
  }, {} as Record<string, { storeName: string; items: typeof cart; subtotal: number }>), [cart])

  const { total, totalItems } = useMemo(() => cart.reduce(
    (summary, item) => ({
      total: summary.total + item.price * item.quantity,
      totalItems: summary.totalItems + item.quantity,
    }),
    { total: 0, totalItems: 0 },
  ), [cart])

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingCart className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-2">سجّل الدخول لإتمام الطلب</h2>
        <p className="text-muted-foreground mb-4">يجب تسجيل الدخول قبل إرسال طلب التوصيل.</p>
        <Button onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button>
      </div>
    )
  }

  if (!['BUYER', 'SHOP_OWNER'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingCart className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">الشراء متاح للمشترين وأصحاب المحلات فقط</h2>
      </div>
    )
  }

  const handleCheckout = async () => {
    if (!form.deliveryAddress) {
      toast({ title: 'خطأ', description: 'عنوان التوصيل مطلوب', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      checkoutId.current ||= crypto.randomUUID()
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId: checkoutId.current,
          items: cart.map((item) => ({ partId: item.partId, quantity: item.quantity })),
          deliveryAddress: form.deliveryAddress,
          notes: form.notes,
          couponCode: form.couponCode.trim() || undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        toast({
          title: 'لم يتم إنشاء الطلبات',
          description: result.error || 'تعذر إتمام الطلب. حاول مرة أخرى.',
          variant: 'destructive',
        })
      } else {
        const discount = (result.orders || []).reduce((sum: number, order: { discount?: number }) => sum + Number(order.discount || 0), 0)
        toast({
          title: 'تم إرسال الطلبات بنجاح',
          description: `تم إنشاء ${(result.orders || []).length} طلب لـ ${Object.keys(storeGroups).length} متجر${discount ? `، الخصم ${formatPrice(discount)}` : ''}`,
        })
        checkoutId.current = null
        clearCart()
        setView({ name: 'orders' })
      }
    } catch {
      toast({ title: 'تعذر الاتصال', description: 'لم نتمكن من إرسال الطلب. حاول مرة أخرى دون تحديث الصفحة.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingCart className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-2">سلتك فارغة</h2>
        <p className="text-muted-foreground mb-4">أضف قطع غيار إلى السلة أولاً</p>
        <Button onClick={() => setView({ name: 'parts' })}>تصفح قطع الغيار</Button>
      </div>
    )
  }

  return (
    <div className="content-container space-y-7 py-10">
      <Button variant="ghost" size="sm" onClick={() => setView({ name: 'parts' })}>
        <ArrowRight className="size-4 ml-1" />
        متابعة التسوق
      </Button>

      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">الخطوة الأخيرة</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">إتمام الطلب</h1>
        <p className="text-muted-foreground mt-1">
          {totalItems} قطعة من {Object.keys(storeGroups).length} متجر • الإجمالي: {formatPrice(total)}
        </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery address */}
          <Card className="market-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="size-5 text-primary" />
                عنوان التوصيل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={form.deliveryAddress}
                onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                placeholder="المدينة - الحي - الشارع - تفاصيل الموقع"
                rows={3}
                required
              />
            </CardContent>
          </Card>

          <Card className="market-card">
            <CardHeader><CardTitle className="text-lg">كوبون الخصم</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} placeholder="أدخل الكود إن وجد" dir="ltr" />
              <p className="text-xs text-muted-foreground">سيُطبّق الكوبون على المنتجات التابعة للمتجر الذي أصدره.</p>
            </CardContent>
          </Card>

          {/* Payment method */}
          <Card className="market-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="size-5 text-primary" />
                طريقة الدفع
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 rounded-lg border-2 border-primary bg-primary/5 flex items-start gap-3">
                <Truck className="size-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">الدفع عند الاستلام</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ادفع للمحل عند استلام القطعة. سيتم تأكيد المبلغ والطلب قبل التوصيل.
                  </p>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="market-card">
            <CardHeader>
              <CardTitle className="text-lg">ملاحظات (اختياري)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أي تفاصيل إضافية لكل المتاجر..."
                rows={2}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Order summary */}
        <div className="space-y-4">
          <Card className="market-card lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle className="text-lg">ملخص الطلب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Group by store */}
              {Object.entries(storeGroups).map(([storeId, group]) => (
                <div key={storeId} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <StoreIcon className="size-4 text-primary" />
                    <span className="line-clamp-1">{group.storeName}</span>
                  </div>
                  <div className="space-y-1.5 pr-6">
                    {group.items.map((item) => (
                      <div key={item.partId} className="flex items-start justify-between gap-2 text-sm">
                        <span className="line-clamp-1 text-muted-foreground">
                          {item.name} × {item.quantity}
                        </span>
                        <span className="font-medium shrink-0">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pr-6 pt-1 border-t border-dashed">
                    <span>الإجمالي الفرعي</span>
                    <span>{formatPrice(group.subtotal)}</span>
                  </div>
                </div>
              ))}

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">عدد القطع</span>
                  <span>{totalItems}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">عدد الطلبات</span>
                  <span>{cart.length}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>الإجمالي</span>
                  <span className="text-primary">{formatPrice(total)}</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={submitting || !form.deliveryAddress}
              >
                {submitting ? (
                  'جاري إرسال الطلبات...'
                ) : (
                  <>
                    <CheckCircle2 className="size-4 ml-2" />
                    تأكيد وإرسال الطلبات
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
                <div className="flex items-center gap-1">
                  <Truck className="size-3.5" />
                  <span>توصيل سريع</span>
                </div>
                <div className="flex items-center gap-1">
                  <ShieldCheck className="size-3.5" />
                  <span>دفع عند الاستلام</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
