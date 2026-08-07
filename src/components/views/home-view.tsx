'use client'

import { useEffect, useState } from 'react'
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
  store: { id: string; name: string }
}

export function HomeView() {
  const { setView, setSearchQuery } = useAppStore()
  const [stores, setStores] = useState<Store[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/stores', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/parts', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([s, p]) => {
        setStores(s.stores || [])
        setParts((p.parts || []).slice(0, 8))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-bl from-primary/10 via-accent/30 to-background">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              <Wrench className="size-3.5 ml-1" />
              غيار ماركت | سوق قطع غيار السيارات
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance">
              قطع غيار أصلية من{' '}
              <span className="text-primary">متاجر معتمدة</span>
              <br className="hidden md:block" />
              توصيل سريع والدفع عند الاستلام
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              تصفح آلاف قطع الغيار من مختلف المتاجر، قارن الأسعار، اطلب التوصيل،
              وادفع عند الاستلام بكل وضوح وأمان. تقييمات حقيقية من عملاء سابقين
              تساعدك على اختيار الأفضل.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button size="lg" onClick={() => setView({ name: 'parts' })}>
                <Search className="size-4 ml-2" />
                تصفح قطع الغيار
              </Button>
              <Button size="lg" variant="outline" onClick={() => setView({ name: 'stores' })}>
                <StoreIcon className="size-4 ml-2" />
                استكشف المتاجر
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
              className="max-w-2xl mx-auto pt-6"
            >
              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  placeholder="ابحث عن قطعة غيار، ماركة، أو نوع..."
                  className="w-full pr-12 pl-4 py-4 rounded-xl bg-card border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-base"
                />
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Featured Parts */}
      <section className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">قطع غيار مميزة</h2>
            <p className="text-muted-foreground mt-1">أحدث القطع المضافة من المتاجر</p>
          </div>
          <Button variant="ghost" onClick={() => setView({ name: 'parts' })}>
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {parts.map((part) => (
              <PartCard key={part.id} part={part} />
            ))}
          </div>
        )}
      </section>

      {/* Featured Stores */}
      <section className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">متاجر مميزة</h2>
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.slice(0, 6).map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">مميزات الموقع</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, title: 'متاجر موثوقة', desc: 'جميع المتاجر معتمدة وموثقة' },
            { icon: Truck, title: 'توصيل سريع', desc: 'اطلب التوصيل لموقعك بضغطة' },
            { icon: Banknote, title: 'الدفع عند الاستلام', desc: 'ادفع بعد استلام القطعة' },
            { icon: TrendingUp, title: 'تقييمات حقيقية', desc: 'اطلع على تجارب العملاء' },
          ].map((f) => (
            <Card key={f.title} className="border-border/60 hover:shadow-md transition">
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
      className="overflow-hidden cursor-pointer hover:shadow-md transition group h-full"
      onClick={() => setView({ name: 'part', partId: part.id })}
    >
      <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
        {part.image ? (
           
          <img
            src={part.image}
            alt={part.name}
            className="w-full h-full object-contain group-hover:scale-105 transition"
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
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StoreIcon className="size-3" />
          <span className="truncate">{part.store.name}</span>
        </div>
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
        </div>
      </CardContent>
    </Card>
  )
}

function StoreCard({ store }: { store: Store }) {
  const { setView } = useAppStore()
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition group"
      onClick={() => setView({ name: 'store', storeId: store.id })}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="relative size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
            {store.image ? <img src={store.image} alt="" className="w-full h-full object-cover" /> : <StoreIcon className="size-6" />}
            <div className="absolute -bottom-1 -left-1 size-6 rounded-full border-2 border-card bg-muted overflow-hidden" title={`صاحب المحل: ${store.owner.name}`}>
              {store.owner.avatar ? <img src={store.owner.avatar} alt={store.owner.name} className="w-full h-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold">{store.owner.name.charAt(0)}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base line-clamp-1 group-hover:text-primary transition">
              {store.name}
            </CardTitle>
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
      </CardContent>
    </Card>
  )
}
