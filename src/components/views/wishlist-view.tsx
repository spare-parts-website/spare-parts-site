'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Heart, Store as StoreIcon, ShieldCheck } from 'lucide-react'
import { FavoriteStoreButton } from '@/components/favorite-store-button'

interface FavoriteStore {
  id: string
  store: {
    id: string
    name: string
    description?: string | null
    address?: string | null
    phone?: string | null
    image?: string | null
    verified: boolean
    _count: { parts: number }
    owner: { name: string; avatar?: string | null }
  }
}

export function WishlistView() {
  const { user, setView, setFavoriteStores } = useAppStore()
  const [items, setItems] = useState<FavoriteStore[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    fetch('/api/wishlist', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || [])
        setFavoriteStores((data.items || []).map((item: FavoriteStore) => item.store.id))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user && ['BUYER', 'SHOP_OWNER'].includes(user.role)) load()
  }, [user])

  if (!user) {
    return <div className="container mx-auto px-4 py-16 text-center"><Heart className="size-12 mx-auto mb-3 opacity-40" /><h2 className="text-xl font-semibold">سجّل الدخول لعرض المفضلة</h2><Button className="mt-4" onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button></div>
  }

  if (!['BUYER', 'SHOP_OWNER'].includes(user.role)) {
    return <div className="container mx-auto px-4 py-16 text-center"><Heart className="size-12 mx-auto mb-3 opacity-40" /><h2 className="text-xl font-semibold">هذه الصفحة مخصصة للمشترين وأصحاب المحلات</h2></div>
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8"><Skeleton className="h-10 w-48 mb-6" /><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div></div>
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Heart className="size-7 text-red-500" />قائمة المفضلة</h1>
        <p className="text-muted-foreground mt-1">{items.length === 0 ? 'لا توجد متاجر في مفضلتك' : `${items.length} متجر محفوظ`}</p>
      </div>
      {items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground"><Heart className="size-12 mx-auto mb-3 opacity-40" /><p className="mb-4">لم تقم بإضافة أي متجر للمفضلة بعد</p><Button onClick={() => setView({ name: 'stores' })}>تصفح المتاجر</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => <Card key={item.id} className="overflow-hidden"><CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setView({ name: 'store', storeId: item.store.id })}>
              <div className="relative size-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">{item.store.image ? <Image src={item.store.image} alt={item.store.name} fill sizes="64px" className="object-cover" /> : <StoreIcon className="size-8" />}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h2 className="font-bold truncate">{item.store.name}</h2>{item.store.verified && <ShieldCheck className="size-4 text-emerald-500 shrink-0" />}</div><p className="text-sm text-muted-foreground mt-1">{item.store._count.parts} قطعة غيار</p></div>
            </div>
            {item.store.description && <p className="text-sm text-muted-foreground line-clamp-2">{item.store.description}</p>}
            <div className="flex gap-2"><Button className="flex-1" onClick={() => setView({ name: 'store', storeId: item.store.id })}>زيارة المتجر</Button><FavoriteStoreButton storeId={item.store.id} /></div>
          </CardContent></Card>)}
        </div>
      )}
    </div>
  )
}
