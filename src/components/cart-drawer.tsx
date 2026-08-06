'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, ShoppingCart, Plus, Minus, Package, Store as StoreIcon } from 'lucide-react'
import { formatPrice } from '@/components/common'
import { useToast } from '@/hooks/use-toast'

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateCartQuantity, setView, user, clearCart } = useAppStore()
  const { toast } = useToast()

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)

  const handleCheckout = () => {
    if (!user) {
      setView({ name: 'login' })
      setCartOpen(false)
      toast({
        title: 'سجّل الدخول أولاً',
        description: 'يجب تسجيل الدخول لإتمام الطلب',
      })
      return
    }
    setView({ name: 'checkout' })
    setCartOpen(false)
  }

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent side="left" className="w-full sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" />
            سلة التسوق
            {totalItems > 0 && (
              <Badge variant="secondary">{totalItems} قطعة</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center">
              <ShoppingCart className="size-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">سلتك فارغة</p>
              <p className="text-sm text-muted-foreground mt-1">
                أضف قطع الغيار التي تريدها إلى السلة
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setCartOpen(false)
                setView({ name: 'parts' })
              }}
            >
              تصفح قطع الغيار
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {cart.map((item) => (
                  <div key={item.partId} className="p-4 flex gap-3">
                    <div className="size-20 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <Package className="size-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <button
                        className="font-medium text-sm line-clamp-2 text-right hover:text-primary"
                        onClick={() => {
                          setCartOpen(false)
                          setView({ name: 'part', partId: item.partId })
                        }}
                      >
                        {item.name}
                      </button>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <StoreIcon className="size-3" />
                        <span className="line-clamp-1">{item.storeName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => updateCartQuantity(item.partId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.partId, parseInt(e.target.value) || 1)}
                            className="w-14 h-7 text-center px-1"
                            min={1}
                            max={item.stock}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => updateCartQuantity(item.partId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                        <span className="font-semibold text-primary">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      onClick={() => removeFromCart(item.partId)}
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border-t p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">الإجمالي</span>
                <span className="text-xl font-bold text-primary">
                  {formatPrice(total)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" size="lg" onClick={handleCheckout}>
                  <ShoppingCart className="size-4 ml-2" />
                  إتمام الطلب
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    if (confirm('هل تريد إفراغ السلة؟')) clearCart()
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
