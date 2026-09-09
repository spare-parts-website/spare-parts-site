import Image from 'next/image'
import Link from 'next/link'
import Form from 'next/form'
import { ArrowLeft, BadgeCheck, Banknote, CarFront, CircleGauge, Headphones, Package, Search, ShieldCheck, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HomeMarketplaceSectionsLoader } from '@/components/home-marketplace-sections-loader'

const categories = [
  { label: 'المحرك ومكوناته', query: 'محرك', icon: CircleGauge },
  { label: 'الفرامل والتعليق', query: 'فرامل', icon: ShieldCheck },
  { label: 'الجنوط والإطارات', query: 'جنط', icon: CarFront },
  { label: 'الإضاءة والكهرباء', query: 'كهرباء', icon: Package },
]

export function HomeView({ isSeller = false }: { isSeller?: boolean }) {
  return <div className="pb-12">
    <section className="content-container py-8 sm:py-12">
      <div className="grid overflow-hidden rounded-3xl border bg-card lg:grid-cols-[1.2fr_1fr]">
        <div className="p-6 sm:p-10 lg:p-12">
          <p className="eyebrow"><span className="size-2 rounded-full bg-primary" /> سوق قطع الغيار في مصر</p>
          <h1 className="mt-5 max-w-xl text-4xl font-black leading-[1.35] text-balance sm:text-5xl">كل رحلة تبدأ<br /><span className="text-primary">بالقطعة الصح.</span></h1>
          <p className="mt-4 max-w-lg leading-8 text-muted-foreground">ابحث برقم القطعة أو اسمها، راجع توافقها مع سيارتك، وتعرّف على المتجر قبل ما تطلب.</p>
          <Form action="/parts" className="mt-7 space-y-3" role="search" aria-label="البحث في السوق">
            <label htmlFor="market-search" className="block text-sm font-bold">ما القطعة التي تبحث عنها؟</label>
            <div className="flex flex-col gap-2 rounded-2xl border bg-background p-2 sm:flex-row">
              <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute start-3 top-4 size-5 text-muted-foreground" /><input id="market-search" name="search" type="search" maxLength={160} placeholder="مثال: تيل فرامل تويوتا كورولا 2015" className="h-12 w-full rounded-xl bg-transparent pe-3 ps-10 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
              <Button type="submit" className="h-12 rounded-xl px-6">ابحث عن قطعتك <ArrowLeft aria-hidden="true" className="size-4" /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>جرّب البحث:</span>{['تيل فرامل', 'BMW', 'تويوتا'].map(term => <Link key={term} href={'/parts?search=' + encodeURIComponent(term)} prefetch={false} className="rounded-full border px-3 py-1.5 transition-colors hover:border-primary hover:text-primary">{term}</Link>)}</div>
          </Form>
          <div className="mt-7 flex flex-wrap gap-5 border-t pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Banknote className="size-4 text-primary" /> الدفع عند الاستلام</span><span className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" /> توثيق هوية المتجر عند اعتماده</span></div>
        </div>
        <div className="relative min-h-80 overflow-hidden bg-slate-100 dark:bg-[#111c23] lg:min-h-full">
          <Image src="/ghyar-market-hero-light.webp" alt="سيارة وقطع غيار في مركز خدمة" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover object-left dark:hidden" />
          <Image src="/ghyar-market-hero-dark.webp" alt="" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="hidden object-cover object-left dark:block" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-white/5 to-transparent dark:from-black/80 dark:via-black/10" />
          <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-slate-900/10 bg-white/[0.78] p-5 text-slate-950 shadow-xl shadow-slate-950/10 backdrop-blur-md dark:border-white/20 dark:bg-black/30 dark:text-white dark:shadow-black/20 sm:inset-x-6 sm:bottom-6"><p className="text-xs text-slate-600 dark:text-white/75">اختيارك يبدأ بالمعلومة</p><p className="mt-2 text-xl font-bold">قارن التفاصيل. اسأل المتجر. اطلب بثقة.</p><Link href="/parts" prefetch={false} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">استكشف قطع الغيار <ArrowLeft className="size-4" /></Link></div>
        </div>
      </div>
      <div className="mt-8 flex items-end justify-between gap-4"><div><p className="page-kicker">ابدأ من هنا</p><h2 className="mt-1 text-xl font-extrabold">قطعة لكل احتياج</h2></div><Link href="/parts" prefetch={false} className="text-sm font-bold text-primary">كل القطع ←</Link></div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{categories.map(({ label, query, icon: Icon }) => <Link key={label} href={'/parts?search=' + encodeURIComponent(query)} prefetch={false} className="group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 sm:p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><span className="text-sm font-bold">{label}</span></Link>)}</div>
    </section>
    <HomeMarketplaceSectionsLoader />
    <section className="content-container mt-8">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[#162329] p-7 text-white sm:p-10 lg:flex-row lg:items-center"><div><p className="flex items-center gap-2 text-sm text-emerald-300"><Store className="size-4" /> لأصحاب متاجر قطع الغيار</p><h2 className="mt-3 text-2xl font-extrabold">مخزونك يستحق أن يصل لعملاء أكثر.</h2><p className="mt-3 max-w-xl leading-7 text-white/70">اعرض قطعك، تابع الطلبات، وتواصل مع المشترين من مكان واحد.</p></div><Button asChild size="lg" className="shrink-0 bg-emerald-400 text-slate-950 hover:bg-emerald-300"><Link href={isSeller ? '/seller/parts' : '/register'} prefetch={false}>{isSeller ? 'إدارة متجري' : 'ابدأ البيع'} <ArrowLeft className="size-4" /></Link></Button></div>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Headphones className="size-4" /> تحتاج مساعدة؟ <Link href="/support" prefetch={false} className="font-bold text-primary underline underline-offset-4">تواصل مع الدعم</Link></p>
    </section>
  </div>
}
