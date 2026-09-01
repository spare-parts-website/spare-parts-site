import 'server-only'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CircleGauge,
  Headphones,
  Package,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store as StoreIcon,
} from 'lucide-react'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FavoriteStoreButton } from '@/components/favorite-store-button'
import { UserAvatar } from '@/components/user-avatar'

interface Store {
  id: string
  name: string
  description?: string | null
  image?: string | null
  verified: boolean
  _count: { parts: number }
  avgRating: number
  reviewCount: number
}

interface Part {
  id: string
  name: string
  price: number
  stock: number
  brand?: string | null
  condition?: string | null
  image?: string | null
  store: { id: string; name: string; image?: string | null; verified: boolean }
}

async function loadHomeMarketplace(): Promise<{ parts: Part[]; stores: Store[]; failed: boolean }> {
  try {
    const [recentParts, recentStores] = await Promise.all([
      db.part.findMany({
        where: { blocked: false },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          brand: true,
          condition: true,
          image: true,
          store: { select: { id: true, name: true, image: true, verified: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 16,
      }),
      db.store.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          verified: true,
          _count: { select: { parts: { where: { blocked: false } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])

    const parts = recentParts.filter((part) => !isBlockedStoreName(part.store.name)).slice(0, 8)
    const visibleStores = recentStores.filter((store) => !isBlockedStoreName(store.name)).slice(0, 6)
    const ratingGroups = visibleStores.length
      ? await db.storeReview.groupBy({
          by: ['storeId'],
          where: { storeId: { in: visibleStores.map((store) => store.id) }, blocked: false },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : []
    const ratingByStore = new Map(ratingGroups.map((rating) => [rating.storeId, rating]))
    const stores = visibleStores.map((store) => {
      const rating = ratingByStore.get(store.id)
      return {
        ...store,
        avgRating: rating?._avg.rating || 0,
        reviewCount: rating?._count._all || 0,
      }
    })

    return { parts, stores, failed: false }
  } catch (error) {
    console.error('Failed to render homepage marketplace data', error)
    return { parts: [], stores: [], failed: true }
  }
}

export async function HomeView({ isSeller = false }: { isSeller?: boolean }) {
  const { parts, stores, failed } = await loadHomeMarketplace()

  return (
    <div className="overflow-hidden pb-8">
      <section className="relative isolate min-h-[38rem] overflow-hidden bg-[#07111f] text-white sm:min-h-[42rem]">
        <Image src="/ghyar-market-hero.png" alt="سيارة وقطع غيار داخل مركز خدمة حديث" fill priority sizes="100vw" className="-z-20 object-cover object-[42%_center] opacity-75" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-l from-[#07111f] via-[#07111f]/90 to-[#07111f]/15" />
        <div className="absolute inset-0 -z-10 premium-grid opacity-30" />
        <div className="content-container flex min-h-[38rem] items-center py-16 sm:min-h-[42rem]">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary backdrop-blur">
              <ShieldCheck className="size-4" /> منصة مصرية لقطع غيار السيارات
            </span>
            <h1 className="mt-6 text-4xl font-black leading-[1.2] tracking-[-0.045em] text-balance sm:text-5xl lg:text-6xl">
              القطعة الصح لسيارتك،
              <span className="block text-primary">من متجر تعرف تفاصيله.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/70 sm:text-lg">
              ابحث وقارن واختر من متاجر متخصصة. معلومات واضحة، تقييمات حقيقية، ودفع آمن عند الاستلام.
            </p>
            <form action="/parts" method="get" className="mt-8 rounded-2xl border border-white/15 bg-white p-2 shadow-2xl shadow-black/30 sm:flex">
              <label className="relative block min-w-0 flex-1">
                <Search className="absolute right-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">ابحث عن قطعة غيار</span>
                <input name="search" type="search" className="h-14 w-full rounded-xl bg-transparent pr-12 pl-4 text-base text-slate-950 outline-none placeholder:text-slate-500" placeholder="مثال: تيل فرامل تويوتا كورولا 2020" />
              </label>
              <Button type="submit" size="lg" className="h-14 w-full rounded-xl px-7 sm:w-auto">ابحث الآن</Button>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/65">
              <span className="flex items-center gap-1.5"><BadgeCheck className="size-4 text-primary" /> توثيق ظاهر عند اعتماده</span>
              <span className="flex items-center gap-1.5"><Banknote className="size-4 text-primary" /> دفع عند الاستلام</span>
              <span className="flex items-center gap-1.5"><Headphones className="size-4 text-primary" /> تواصل مباشر</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-card">
        <div className="content-container grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
          {[
            { value: 'اختيار أوضح', label: 'تفاصيل وتوافق القطعة قبل الطلب' },
            { value: 'متاجر متخصصة', label: 'تعرف على المتجر وتقييماته' },
            { value: 'طلب مطمئن', label: 'تابع حالة الطلب من حسابك' },
          ].map((item) => <div key={item.value} className="px-4 py-6 text-center"><strong className="block text-lg font-black">{item.value}</strong><span className="mt-1 block text-sm text-muted-foreground">{item.label}</span></div>)}
        </div>
      </section>

      <section className="bg-slate-100/70 dark:bg-slate-950/35">
        <div className="content-container section-space">
          <SectionHeading eyebrow="وصل حديثاً" title="قطع تستحق المشاهدة" description="أحدث عروض المتاجر على غيار ماركت" href="/parts" />
          {failed ? <LoadError /> : parts.length === 0 ? <EmptyState text="لا توجد قطع معروضة حالياً" /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{parts.map((part) => <PartCard key={part.id} part={part} />)}</div>
          )}
        </div>
      </section>

      <section className="content-container section-space">
        <SectionHeading eyebrow="البائع يصنع الفرق" title="متاجر قطع غيار على المنصة" description="قارن التقييمات وتحقق من علامة التوثيق قبل الاختيار" href="/stores" />
        {failed ? <LoadError /> : stores.length === 0 ? <EmptyState text="لا توجد متاجر معروضة حالياً" /> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>
        )}
      </section>

      <section className="content-container pb-20">
        <div className="relative overflow-hidden rounded-[2rem] border bg-card text-card-foreground shadow-xl shadow-slate-900/5 dark:shadow-black/20">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary/10 via-transparent to-primary/[.04]" />
          <SellerCallout isSeller={isSeller} />
        </div>
      </section>
    </div>
  )
}

function SellerCallout({ isSeller }: { isSeller: boolean }) {
  const shortcuts = [{ href: '/seller/parts', icon: Package, title: 'إدارة المخزون' }, { href: '/seller/orders', icon: ShoppingCart, title: 'متابعة الطلبات' }, { href: '/seller/messages', icon: Headphones, title: 'رسائل العملاء' }, { href: '/seller/analytics', icon: CircleGauge, title: 'ملخص الأداء' }]
  return <div className="relative grid lg:grid-cols-[1.15fr_.85fr]"><div className="border-b p-8 sm:p-12 lg:border-b-0 lg:border-l lg:p-16"><span className="eyebrow"><StoreIcon className="size-4" /> لأصحاب محلات قطع الغيار</span><h2 className="mt-4 text-3xl font-black sm:text-4xl">حوّل مخزونك إلى متجر يصل لعملاء أكثر.</h2><p className="mt-4 max-w-xl leading-8 text-muted-foreground">اعرض قطعك، استقبل الطلبات، وتابع رسائل العملاء من صفحة واحدة واضحة.</p><Button asChild size="lg" className="mt-7 rounded-xl px-7 shadow-lg shadow-primary/15"><Link href={isSeller ? '/seller/parts' : '/register'}>{isSeller ? 'فتح صفحة المحل' : 'ابدأ بيع قطعك'}</Link></Button></div><div className="grid grid-cols-2 gap-px bg-border">{shortcuts.map(({ href, icon: Icon, title }) => isSeller ? <Link key={href} href={href} className="flex min-h-40 flex-col justify-end bg-card/95 p-6 transition-colors hover:bg-primary/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-7"><span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm"><Icon className="size-6" /></span><strong className="mt-5 text-base font-black sm:text-lg">{title}</strong></Link> : <div key={href} className="flex min-h-40 flex-col justify-end bg-card/95 p-6 sm:p-7"><span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm"><Icon className="size-6" /></span><strong className="mt-5 text-base font-black sm:text-lg">{title}</strong></div>)}</div></div>
}

function SectionHeading({ eyebrow, title, description, href }: { eyebrow: string; title: string; description: string; href: string }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h2 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h2><p className="mt-2 text-muted-foreground">{description}</p></div><Button asChild variant="ghost"><Link href={href}>عرض الكل <ArrowLeft className="mr-1 size-4" /></Link></Button></div>
}

function LoadError() {
  return <Card className="border-destructive/20"><CardContent className="flex flex-col items-center py-12 text-center"><h3 className="font-black">تعذر تحميل المحتوى</h3><p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة أو تصفح السوق مباشرة.</p><Button asChild variant="outline" className="mt-5"><Link href="/parts">تصفح قطع الغيار</Link></Button></CardContent></Card>
}

function EmptyState({ text }: { text: string }) {
  return <Card><CardContent className="py-12 text-center text-muted-foreground">{text}</CardContent></Card>
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(price)} ج.م`
}

function RatingStars({ value }: { value: number }) {
  return <div className="flex items-center gap-0.5" aria-label={`التقييم ${value.toFixed(1)} من 5`}>{[1, 2, 3, 4, 5].map((rating) => <Star key={rating} className={`size-3.5 ${rating <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted'}`} />)}</div>
}

function PartCard({ part }: { part: Part }) {
  return (
    <Link href={`/parts/${part.id}`} className="group overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-white dark:bg-slate-900">
        {part.image ? <Image src={part.image} alt={part.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-contain p-4 transition duration-300 group-hover:scale-105" /> : <Package className="absolute inset-0 m-auto size-14 text-muted-foreground/30" />}
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
      <Link href={`/stores/${store.id}`} className="block">
        <div className="flex items-center gap-4">
          <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted text-primary">
            {store.image ? <Image src={store.image} alt={store.name} fill sizes="80px" className="object-cover" /> : <StoreIcon className="size-8" />}
          </div>
          <div className="min-w-0"><div className="flex items-center gap-1.5"><h3 className="truncate text-lg font-black group-hover:text-primary">{store.name}</h3>{store.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="متجر موثق" />}</div><div className="mt-2 flex items-center gap-2"><RatingStars value={store.avgRating} /><span className="text-xs text-muted-foreground">({store.reviewCount})</span></div></div>
        </div>
        <p className="mt-5 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">{store.description || 'متجر متخصص في بيع قطع غيار السيارات.'}</p>
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Package className="size-4" /> {store._count.parts} قطعة</span><span className="font-bold text-primary">زيارة المتجر <ArrowLeft className="mr-1 inline size-4" /></span></div>
      </Link>
    </div>
  )
}
