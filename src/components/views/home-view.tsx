'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Store as StoreIcon,
  Package,
  Search,
  ShieldCheck,
  Truck,
  Banknote,
  Star,
  ArrowLeft,
  Wrench,
  TrendingUp,
} from 'lucide-react'
import { Stars, formatPrice } from '@/components/common'
import { FavoriteStoreButton } from '@/components/favorite-store-button'

interface Store {
  id: string
  name: string
  description?: string | null
  address?: string | null
  phone?: string | null
  _count: { parts: number }
  parts: { id: string; name: string; price: number; image?: string | null }[]
  avgRating: number
  reviewCount: number
  image?: string | null
  owner: { name: string; avatar?: string | null }
}

interface Part {
  id: string
  name: string
  description?: string | null
  price: number
  stock: number
  category?: string | null
  brand?: string | null
  image?: string | null
  carModels?: string | null
  store: { id: string; name: string; image?: string | null; owner: { name: string; avatar?: string | null } }
}

export function HomeView() {
  const { setView, setSearchQuery } = useAppStore()
  const [stores, setStores] = useState<Store[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/stores').then((r) => r.json()),
      fetch('/api/parts').then((r) => r.json()),
    ])
      .then(([s, p]) => {
        setStores(s.stores || [])
        setParts((p.parts || []).slice(0, 8))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-16 pb-8">
      {/* Hero */}
      <section className="hero-shell">
        <div className="content-container py-14 md:py-24">
          <div className="mx-auto max-w-4xl space-y-6 text-center">
            <Badge variant="secondary" className="rounded-full border border-primary/15 bg-primary/10 px-4 py-1.5 text-sm text-primary">
              <Wrench className="size-3.5 ml-1" />
              غيار ماركت | قطع غيار موثوقة
            </Badge>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl md:text-4xl">
              قطع غيار موثوقة،{' '}
              <span className="text-primary">في مكان واحد</span>
              <br className="hidden md:block" />
              اطلبها بسهولة من متاجر موثوقة
            </h1>
            <p className="mx-auto max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
              ابحث عن القطعة المناسبة، قارن الأسعار، واطلبها من متجر تثق به.
              توصيل مريح ودفع عند الاستلام.
            </p>
            <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
              <Button size="lg" className="h-12 px-7" onClick={() => setView({ name: 'parts' })}>
                <Search className="size-4 ml-2" />
                تصفح القطع
              </Button>
              <Button size="lg" variant="outline" className="h-12 bg-card/60 px-7" onClick={() => setView({ name: 'stores' })}>
                <StoreIcon className="size-4 ml-2" />
                تصفح المتاجر
              </Button>
            </div>

            {/* Quick search */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                setSearchQuery((fd.get('q') as string) || '')
                setView({ name: 'parts' })
              }}
              className="mx-auto max-w-2xl pt-3"
            >
              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  placeholder="ابحث عن قطعة غيار، ماركة، أو نوع..."
                  className="h-14 w-full rounded-2xl border border-border/80 bg-card/90 px-4 pl-4 pr-12 text-base shadow-lg shadow-primary/5 outline-none transition placeholder:text-muted-foreground/75 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Featured Parts */}
      <section className="content-container">
        <div className="page-heading">
          <div>
            <p className="page-kicker">اختيارات اليوم</p>
            <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">قطع غيار مميزة</h2>
            <p className="text-muted-foreground mt-1">أحدث القطع المضافة من المتاجر</p>
          </div>
          <Button variant="ghost" className="shrink-0" onClick={() => setView({ name: 'parts' })}>
            عرض الكل
            <ArrowLeft className="size-4 mr-1" />
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : parts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد قطع مميزة حالياً</CardContent></Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {parts.map((part) => (
                <PartCard key={part.id} part={part} />
              ))}
            </div>
          )}
      </section>

      {/* Featured Stores */}
      <section className="content-container">
        <div className="page-heading">
          <div>
            <p className="page-kicker">اعرف البائع</p>
            <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">متاجر مميزة</h2>
            <p className="text-muted-foreground mt-1">تعرّف على أفضل المتاجر المعتمدة</p>
          </div>
          <Button variant="ghost" onClick={() => setView({ name: 'stores' })}>
            عرض الكل
            <ArrowLeft className="size-4 mr-1" />
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : stores.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد متاجر مميزة حالياً</CardContent></Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {stores.slice(0, 6).map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
      </section>

      {/* Features */}
      <section className="content-container pb-8">
        <div className="mb-6 text-center">
          <p className="page-kicker">تجربة أوضح</p>
          <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">مميزات الموقع</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, title: 'متاجر موثوقة', desc: 'جميع المتاجر معتمدة وموثقة' },
            { icon: Truck, title: 'توصيل سريع', desc: 'اطلب التوصيل لموقعك بضغطة' },
            { icon: Banknote, title: 'الدفع عند الاستلام', desc: 'ادفع بعد استلام القطعة' },
            { icon: TrendingUp, title: 'تقييمات حقيقية', desc: 'اطلع على تجارب العملاء' },
          ].map((f) => (
            <Card key={f.title} className="market-card border-border/60">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <f.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function PartCard({ part }: { part: Part }) {
  const { setView } = useAppStore()
  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`عرض تفاصيل ${part.name}`}
      className="market-card w-full overflow-hidden cursor-pointer transition group h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => setView({ name: 'part', partId: part.id })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setView({ name: 'part', partId: part.id })
        }
      }}
    >
      <div className="relative flex aspect-[1.15/1] items-center justify-center overflow-hidden bg-muted/25">
        {part.image ? (
           
          <Image
            src={part.image}
            alt={part.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain group-hover:scale-105 transition"
          />
        ) : (
          <Package className="size-16 text-muted-foreground/40" />
        )}
        {part.stock === 0 && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
            نفد
          </span>
        )}
        {part.brand && (
          <span className="absolute top-2 left-2 bg-card/90 backdrop-blur text-xs px-2 py-0.5 rounded-full font-medium">
            {part.brand}
          </span>
        )}
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-2">
        <h3 className="font-semibold line-clamp-2 text-sm leading-relaxed min-h-10">
          {part.name}
        </h3>
        {part.category && (
          <Badge variant="outline" className="text-xs">
            {part.category}
          </Badge>
        )}
        <div className="pt-1">
          <span className="text-lg font-bold text-primary">
            {formatPrice(part.price)}
          </span>
          <span className={`mr-2 text-xs font-semibold ${part.stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {part.stock > 0 ? `متوفر · ${part.stock} قطعة` : 'غير متوفر'}
          </span>
        </div>
        <Button variant="link" size="sm" className="h-auto self-start p-0" onClick={(event) => { event.stopPropagation(); setView({ name: 'part', partId: part.id }) }}>
          عرض التفاصيل
        </Button>
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 pt-2">
          <button type="button" aria-label={`زيارة متجر ${part.store.name}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={(event) => { event.stopPropagation(); setView({ name: 'store', storeId: part.store.id }) }}>
            {part.store.image ? (
              <Image src={part.store.image} alt={part.store.name} fill sizes="160px" quality={100} className="object-cover transition duration-300 hover:scale-105" />
            ) : (
              <StoreIcon className="absolute inset-0 m-auto size-7 text-primary/40" />
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1 text-right">
            <button type="button" className="flex w-full items-center justify-end gap-1 text-sm font-bold text-primary hover:underline" onClick={(event) => { event.stopPropagation(); setView({ name: 'store', storeId: part.store.id }) }}>
              <StoreIcon className="size-4 shrink-0" />
              <span className="truncate">{part.store.name}</span>
            </button>
            <p className="truncate text-xs text-muted-foreground">البائع: {part.store.owner.name}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StoreCard({ store }: { store: Store }) {
  const { setView } = useAppStore()
  return (
    <Card
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
          <div className="relative size-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {store.image ? <Image src={store.image} alt={store.name} fill sizes="64px" className="object-cover" /> : <StoreIcon className="size-8" />}
            <div className="absolute -bottom-1 -left-1 size-7 rounded-full border-2 border-card bg-muted overflow-hidden" title={`صاحب المحل: ${store.owner.name}`}>
              {store.owner.avatar ? <Image src={store.owner.avatar} alt={store.owner.name} fill sizes="28px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold">{store.owner.name.charAt(0)}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base line-clamp-1 group-hover:text-primary transition">{store.name}</CardTitle>
              <div className="mr-auto" onClick={(event) => event.stopPropagation()}>
                <FavoriteStoreButton storeId={store.id} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Stars value={store.avgRating} />
              <span className="text-xs text-muted-foreground">
                ({store.reviewCount})
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {store.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {store.description}
          </p>
        )}
        <div className="flex items-center justify-between pt-2">
          <Badge variant="secondary" className="text-xs">
            <Package className="size-3 ml-1" />
            {store._count.parts} قطعة
          </Badge>
          {store.address && (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {store.address.split('-')[0]}
            </span>
          )}
        </div>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={(event) => { event.stopPropagation(); setView({ name: 'store', storeId: store.id }) }}>
          زيارة المتجر
        </Button>
      </CardContent>
    </Card>
  )
}
