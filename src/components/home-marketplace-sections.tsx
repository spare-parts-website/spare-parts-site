'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, Package, RefreshCw, Star, Store as StoreIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FavoriteStoreButton } from '@/components/favorite-store-button'
import { UserAvatar } from '@/components/user-avatar'

type Part = {
  id: string
  name: string
  price: number
  stock: number
  brand: string | null
  condition: string | null
  image: string | null
  store: { id: string; name: string; image: string | null; verified: boolean }
}

type Store = {
  id: string
  name: string
  description: string | null
  image: string | null
  verified: boolean
  _count: { parts: number }
  avgRating: number
  reviewCount: number
}

type Payload = { parts: Part[]; stores: Store[] }

export function HomeMarketplaceSections() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)

    fetch('/api/home-marketplace', {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('home-marketplace-failed')
        return response.json() as Promise<Payload>
      })
      .then((data) => setPayload({ parts: data.parts || [], stores: data.stores || [] }))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setFailed(true)
      })

    return () => controller.abort()
  }, [retryKey])

  return (
    <>
      <section
        className="bg-slate-100/70 dark:bg-slate-950/35"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '760px' }}
      >
        <div className="content-container section-space">
          <SectionHeading eyebrow="وصل حديثاً" title="قطع تستحق المشاهدة" description="أحدث عروض المتاجر على غيار ماركت" href="/parts" />
          {!payload && !failed ? <PartSkeleton /> : failed ? <LoadError onRetry={() => setRetryKey((value) => value + 1)} /> : payload!.parts.length === 0 ? <EmptyState text="لا توجد قطع معروضة حالياً" /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{payload!.parts.map((part) => <PartCard key={part.id} part={part} />)}</div>
          )}
        </div>
      </section>

      <section
        className="content-container section-space"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '640px' }}
      >
        <SectionHeading eyebrow="البائع يصنع الفرق" title="متاجر قطع غيار على المنصة" description="قارن معلومات المتاجر وعلامة التوثيق والتقييمات عند توفرها" href="/stores" />
        {!payload && !failed ? <StoreSkeleton /> : failed ? <LoadError onRetry={() => setRetryKey((value) => value + 1)} /> : payload!.stores.length === 0 ? <EmptyState text="لا توجد متاجر لديها قطع معروضة حالياً" /> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{payload!.stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>
        )}
      </section>
    </>
  )
}

function SectionHeading({ eyebrow, title, description, href }: { eyebrow: string; title: string; description: string; href: string }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h2 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h2><p className="mt-2 text-muted-foreground">{description}</p></div><Button asChild variant="ghost"><Link href={href}>عرض الكل <ArrowLeft className="mr-1 size-4" /></Link></Button></div>
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <Card className="border-destructive/20"><CardContent className="flex flex-col items-center py-12 text-center"><h3 className="font-black">تعذر تحميل المحتوى</h3><p className="mt-2 text-sm text-muted-foreground">يمكنك المحاولة مرة أخرى أو تصفح السوق مباشرة.</p><div className="mt-5 flex gap-2"><Button variant="outline" onClick={onRetry}><RefreshCw className="ml-2 size-4" />إعادة المحاولة</Button><Button asChild><Link href="/parts">تصفح قطع الغيار</Link></Button></div></CardContent></Card>
}

function EmptyState({ text }: { text: string }) {
  return <Card><CardContent className="py-12 text-center text-muted-foreground">{text}</CardContent></Card>
}

function PartSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="overflow-hidden rounded-3xl border bg-card"><div className="aspect-[4/3] animate-pulse bg-muted/70" /><div className="space-y-3 p-5"><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /><div className="h-5 w-4/5 animate-pulse rounded bg-muted" /><div className="h-6 w-1/3 animate-pulse rounded bg-muted" /></div></div>)}</div>
}

function StoreSkeleton() {
  return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="rounded-3xl border bg-card p-5"><div className="flex items-center gap-4"><div className="size-20 animate-pulse rounded-2xl bg-muted" /><div className="flex-1 space-y-3"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /></div></div><div className="mt-5 h-12 animate-pulse rounded bg-muted/70" /></div>)}</div>
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(price)} ج.م`
}

function RatingStars({ value }: { value: number }) {
  return <div className="flex items-center gap-0.5" aria-label={`التقييم ${value.toFixed(1)} من 5`}>{[1, 2, 3, 4, 5].map((rating) => <Star key={rating} className={`size-3.5 ${rating <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted'}`} />)}</div>
}

function PartCard({ part }: { part: Part }) {
  return (
    <Link prefetch={false} href={`/parts/${part.id}`} className="group overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-white dark:bg-slate-900">
        {part.image ? <Image src={part.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-contain p-4 transition duration-300 group-hover:scale-105" /> : <Package className="absolute inset-0 m-auto size-14 text-muted-foreground/30" />}
        <div className="absolute inset-x-3 top-3 flex justify-between gap-2">
          {part.condition && <Badge className="bg-slate-950/80 text-white">{part.condition}</Badge>}
          <Badge variant={part.stock > 0 ? 'secondary' : 'destructive'} className="mr-auto">{part.stock > 0 ? 'متوفر' : 'نفد'}</Badge>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><UserAvatar name={part.store.name} src={part.store.image} className="size-7 text-[10px]" /><span className="min-w-0 truncate font-bold text-foreground">{part.store.name}</span>{part.store.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="متجر موثق" />}</div>
        <h3 className="mt-3 line-clamp-2 min-h-12 font-black leading-6 transition group-hover:text-primary">{part.name}</h3>
        <div className="mt-4 flex items-end justify-between gap-3"><strong className="text-xl text-primary">{formatPrice(part.price)}</strong>{part.brand && <span className="text-xs text-muted-foreground">{part.brand}</span>}</div>
      </div>
    </Link>
  )
}

function StoreCard({ store }: { store: Store }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      <div className="absolute left-4 top-4 z-10"><FavoriteStoreButton storeId={store.id} /></div>
      <Link prefetch={false} href={`/stores/${store.id}`} className="block">
        <div className="flex items-center gap-4">
          <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted text-primary">
            {store.image ? <Image src={store.image} alt="" fill sizes="80px" className="object-cover" /> : <StoreIcon className="size-8" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><h3 className="truncate text-lg font-black group-hover:text-primary">{store.name}</h3>{store.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="متجر موثق" />}</div>
            {store.reviewCount > 0 ? <div className="mt-2 flex items-center gap-2"><RatingStars value={store.avgRating} /><span className="text-xs text-muted-foreground">({store.reviewCount} تقييم)</span></div> : <p className="mt-2 text-xs text-muted-foreground">لا توجد تقييمات بعد</p>}
          </div>
        </div>
        <p className="mt-5 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">{store.description || 'لم يضف المتجر وصفاً بعد.'}</p>
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Package className="size-4" /> {store._count.parts} قطعة</span><span className="font-bold text-primary">زيارة المتجر <ArrowLeft className="mr-1 inline size-4" /></span></div>
      </Link>
    </div>
  )
}
