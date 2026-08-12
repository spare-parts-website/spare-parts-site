'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Store as StoreIcon, Package, Search, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { Stars } from '@/components/common'
import { FavoriteStoreButton } from '@/components/favorite-store-button'

interface Store {
  id: string
  name: string
  description?: string | null
  address?: string | null
  phone?: string | null
  _count: { parts: number }
  avgRating: number
  reviewCount: number
  verified: boolean
  completedOrderCount: number
  image?: string | null
  owner: { name: string; avatar?: string | null }
}

export function StoresView() {
  const { setView } = useAppStore()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = (q: string) => {
    setLoading(true)
    fetch(`/api/stores?search=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setStores(data.stores || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setStores(data.stores || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="content-container space-y-7 py-10">
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">البائعون</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">المتاجر</h1>
        <p className="text-muted-foreground mt-1">
          تصفح جميع المتاجر المعتمدة على المنصة
        </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          load(search)
        }}
        className="surface-panel relative max-w-2xl p-2"
      >
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن متجر..."
          className="pr-9"
        />
      </form>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 justify-items-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <StoreIcon className="size-12 mx-auto mb-3 opacity-50" />
            <p>لا توجد متاجر مطابقة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Card
              key={store.id}
              role="link"
              tabIndex={0}
              aria-label={`زيارة ${store.name}`}
              className="market-card w-full cursor-pointer transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setView({ name: 'store', storeId: store.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setView({ name: 'store', storeId: store.id })
                }
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="relative size-24 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                    {store.image ? <Image src={store.image} alt={store.name} fill sizes="160px" quality={100} className="object-cover" /> : <StoreIcon className="size-7" />}
                    <div className="absolute -bottom-1 -left-1 size-8 rounded-full border-2 border-card bg-muted overflow-hidden" title={`صاحب المحل: ${store.owner.name}`}>
                      {store.owner.avatar ? <Image src={store.owner.avatar} alt={store.owner.name} fill sizes="32px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold">{store.owner.name.charAt(0)}</span>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-base line-clamp-1 group-hover:text-primary transition">{store.name}</CardTitle>
                      {store.verified && <ShieldCheck className="size-4 text-emerald-500 shrink-0" aria-label="متجر موثق" />}
                      <div className="mr-auto" onClick={(event) => event.stopPropagation()}>
                        <FavoriteStoreButton storeId={store.id} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Stars value={store.avgRating} />
                      <span className="text-xs text-muted-foreground">
                        ({store.reviewCount} تقييم)
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {store.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {store.description}
                  </p>
                )}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {store.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      <span className="line-clamp-1">{store.address}</span>
                    </div>
                  )}
                  {store.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3.5" />
                      <span dir="ltr">{store.phone}</span>
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Package className="size-3 ml-1" />
                  {store._count.parts} قطعة غيار
                </Badge>
                <p className="text-xs text-muted-foreground">{store.completedOrderCount} طلباً مكتملًا</p>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={(event) => { event.stopPropagation(); setView({ name: 'store', storeId: store.id }) }}>
                  زيارة المتجر
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
