'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Heart, Package, Store as StoreIcon, Trash2, ShoppingCart } from 'lucide-react'
import { formatPrice } from '@/components/common'
import { useToast } from '@/hooks/use-toast'

interface WishlistItem {
  id: string
  part: {
    id: string
    name: string
    price: number
    image?: string | null
    stock: number
    blocked: boolean
    store: { id: string; name: string }
  }
}

export function WishlistView() {
  const { setView, setCartOpen, addToCart, toggleWishlist, setWishlist } = useAppStore()
  const { toast } = useToast()
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    fetch('/api/wishlist', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || [])
        setWishlist((data.items || []).map((i: WishlistItem) => i.part.id))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleRemove = async (partId: string) => {
    await fetch(`/api/wishlist?partId=${partId}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((i) => i.part.id !== partId))
    toggleWishlist(partId)
    toast({ title: 'تم الحذف من المفضلة' })
  }

  const handleAddToCart = (item: WishlistItem) => {
    if (item.part.stock === 0) {
      toast({ title: 'نفد المخزون', variant: 'destructive' })
      return
    }
    addToCart({
      partId: item.part.id,
      name: item.part.name,
      price: item.part.price,
      image: item.part.image,
      storeId: item.part.store.id,
      storeName: item.part.store.name,
      stock: item.part.stock,
    })
    toast({ title: 'تمت الإضافة للسلة', description: item.part.name })
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Heart className="size-7 text-red-500" />
          قائمة المفضلة
        </h1>
        <p className="text-muted-foreground mt-1">
          {items.length === 0 ? 'لا توجد قطع في مفضلتك' : `${items.length} قطعة محفوظة`}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Heart className="size-12 mx-auto mb-3 opacity-40" />
            <p className="mb-4">لم تقم بإضافة أي قطع للمفضلة بعد</p>
            <Button onClick={() => setView({ name: 'parts' })}>
              تصفح قطع الغيار
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden h-full flex flex-col">
              <div
                className="aspect-square bg-muted/30 flex items-center justify-center relative cursor-pointer"
                onClick={() => setView({ name: 'part', partId: item.part.id })}
              >
                {item.part.image ? (
                  <img src={item.part.image} alt={item.part.name} className="w-full h-full object-contain" />
                ) : (
                  <Package className="size-16 text-muted-foreground/40" />
                )}
                {item.part.stock === 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    نفد
                  </span>
                )}
              </div>
              <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StoreIcon className="size-3" />
                  <span className="truncate">{item.part.store.name}</span>
                </div>
                <h3
                  className="font-semibold line-clamp-2 text-sm leading-relaxed min-h-10 cursor-pointer hover:text-primary"
                  onClick={() => setView({ name: 'part', partId: item.part.id })}
                >
                  {item.part.name}
                </h3>
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-lg font-bold text-primary">
                    {formatPrice(item.part.price)}
                  </span>
                  {item.part.stock > 0 ? (
                    <Badge variant="outline" className="text-emerald-600">متوفر</Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-500">نفد</Badge>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={item.part.stock === 0}
                    onClick={() => handleAddToCart(item)}
                  >
                    <ShoppingCart className="size-4 ml-1" />
                    للسلة
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => handleRemove(item.part.id)}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
