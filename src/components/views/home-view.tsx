import Image from 'next/image'
import Link from 'next/link'
import Form from 'next/form'
import {
  BadgeCheck,
  Banknote,
  CircleGauge,
  Headphones,
  Package,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HomeMarketplaceSections } from '@/components/home-marketplace-sections'

export function HomeView({ isSeller = false }: { isSeller?: boolean }) {
  return (
    <div className="overflow-hidden pb-8">
      <section className="relative isolate min-h-[38rem] overflow-hidden bg-[#07111f] text-white sm:min-h-[42rem]">
        <Image src="/ghyar-market-hero.webp" alt="سيارة وقطع غيار داخل مركز خدمة حديث" fill priority sizes="100vw" className="-z-20 object-cover object-[42%_center] opacity-75" />
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
              ابحث وقارن واختر من متاجر متخصصة. معلومات واضحة، وتقييمات من المشترين عند توفرها، والدفع عند الاستلام.
            </p>
            <Form action="/parts" className="mt-8 rounded-2xl border border-white/15 bg-white p-2 shadow-2xl shadow-black/30 sm:flex">
              <label className="relative block min-w-0 flex-1">
                <Search className="absolute right-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">ابحث عن قطعة غيار</span>
                <input name="search" type="search" className="h-14 w-full rounded-xl bg-transparent pr-12 pl-4 text-base text-slate-950 outline-none placeholder:text-slate-500" placeholder="مثال: تيل فرامل تويوتا كورولا 2020" />
              </label>
              <Button type="submit" size="lg" className="h-14 w-full rounded-xl px-7 sm:w-auto">ابحث الآن</Button>
            </Form>
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

      <HomeMarketplaceSections />

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
  const shortcuts = [
    { href: '/seller/parts', icon: Package, title: 'إدارة المخزون' },
    { href: '/seller/orders', icon: ShoppingCart, title: 'متابعة الطلبات' },
    { href: '/seller/messages', icon: Headphones, title: 'رسائل العملاء' },
    { href: '/seller/analytics', icon: CircleGauge, title: 'ملخص الأداء' },
  ]

  return <div className="relative grid lg:grid-cols-[1.15fr_.85fr]"><div className="border-b p-8 sm:p-12 lg:border-b-0 lg:border-l lg:p-16"><span className="eyebrow"><StoreIcon className="size-4" /> لأصحاب محلات قطع الغيار</span><h2 className="mt-4 text-3xl font-black sm:text-4xl">حوّل مخزونك إلى متجر يصل لعملاء أكثر.</h2><p className="mt-4 max-w-xl leading-8 text-muted-foreground">اعرض قطعك، استقبل الطلبات، وتابع رسائل العملاء من صفحة واحدة واضحة.</p><Button asChild size="lg" className="mt-7 rounded-xl px-7 shadow-lg shadow-primary/15"><Link href={isSeller ? '/seller/parts' : '/register'}>{isSeller ? 'فتح صفحة المحل' : 'ابدأ بيع قطعك'}</Link></Button></div><div className="grid grid-cols-2 gap-px bg-border">{shortcuts.map(({ href, icon: Icon, title }) => isSeller ? <Link key={href} href={href} className="flex min-h-40 flex-col justify-end bg-card/95 p-6 transition-colors hover:bg-primary/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-7"><span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm"><Icon className="size-6" /></span><strong className="mt-5 text-base font-black sm:text-lg">{title}</strong></Link> : <div key={href} className="flex min-h-40 flex-col justify-end bg-card/95 p-6 sm:p-7"><span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm"><Icon className="size-6" /></span><strong className="mt-5 text-base font-black sm:text-lg">{title}</strong></div>)}</div></div>
}
