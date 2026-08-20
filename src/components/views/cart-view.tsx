'use client'

import { Minus, Package, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/components/common'
import { useAppStore } from '@/lib/store'

export function CartView() {
  const { cart, removeFromCart, updateCartQuantity, setView, user } = useAppStore()
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  if (cart.length === 0) {
    return (
      <section className="content-container py-16 sm:py-24">
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border bg-card p-10 text-center shadow-sm">
          <span className="mb-5 grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary">
            <ShoppingCart className="size-9" />
          </span>
          <h1 className="text-2xl font-black">سلة المشتريات فارغة</h1>
          <p className="mt-3 text-muted-foreground">اكتشف قطع الغيار المتاحة من المتاجر الموثوقة وأضف ما يناسب سيارتك.</p>
          <Button className="mt-7" onClick={() => setView({ name: 'parts' })}>تصفح قطع الغيار</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="content-container py-8 sm:py-12">
      <div className="mb-8">
        <p className="text-sm font-bold text-primary">راجع طلبك</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">سلة المشتريات</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {cart.map((item) => (
            <Card key={item.partId} className="overflow-hidden">
              <CardContent className="flex gap-4 p-4 sm:p-5">
                <button
                  className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted sm:size-28"
                  onClick={() => setView({ name: 'part', partId: item.partId })}
                >
                  {item.image ? <img src={item.image} alt={item.name} className="size-full object-contain" /> : <Package className="size-9 text-muted-foreground" />}
                </button>
                <div className="min-w-0 flex-1">
                  <button className="line-clamp-2 text-right font-bold hover:text-primary" onClick={() => setView({ name: 'part', partId: item.partId })}>{item.name}</button>
                  <p className="mt-1 text-sm text-muted-foreground">{item.storeName}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="size-8" disabled={item.quantity <= 1} onClick={() => updateCartQuantity(item.partId, item.quantity - 1)}><Minus className="size-3.5" /></Button>
                      <Input className="h-8 w-14 text-center" type="number" min={1} max={item.stock} value={item.quantity} onChange={(event) => updateCartQuantity(item.partId, Number(event.target.value) || 1)} />
                      <Button size="icon" variant="outline" className="size-8" disabled={item.quantity >= item.stock} onClick={() => updateCartQuantity(item.partId, item.quantity + 1)}><Plus className="size-3.5" /></Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-primary">{formatPrice(item.price * item.quantity)}</strong>
                      <Button size="icon" variant="ghost" onClick={() => removeFromCart(item.partId)}><Trash2 className="size-4 text-destructive" /></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit lg:sticky lg:top-24">
          <CardContent className="p-6">
            <h2 className="text-lg font-black">ملخص الطلب</h2>
            <div className="my-5 flex items-center justify-between border-y py-4">
              <span className="text-muted-foreground">الإجمالي</span>
              <strong className="text-2xl text-primary">{formatPrice(total)}</strong>
            </div>
            <Button className="w-full" size="lg" onClick={() => setView(user ? { name: 'checkout' } : { name: 'login' })}>متابعة إتمام الطلب</Button>
            <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">الدفع عند الاستلام متاح. يؤكد كل متجر طلبه بشكل مستقل.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
