'use client'

import Link from 'next/link'
import { BadgeCheck, Banknote, Mail, MapPin, PackageCheck, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'

const marketplaceLinks = [
  { href: '/parts', label: 'قطع الغيار' }, { href: '/stores', label: 'المتاجر' },
  { href: '/account/orders', label: 'متابعة الطلبات' }, { href: '/account/wishlist', label: 'المفضلة' },
]
const policyLinks = [
  { href: '/privacy', label: 'سياسة الخصوصية' }, { href: '/terms', label: 'شروط الاستخدام' },
  { href: '/returns', label: 'الاسترجاع والاستبدال' }, { href: '/contact', label: 'تواصل معنا' },
]

export function Footer() {
  const user = useAppStore((state) => state.user)
  return (
    <footer className="mt-16 bg-[#07111f] text-white">
      <div className="border-b border-white/10">
        <div className="content-container grid gap-5 py-8 sm:grid-cols-3">
          {[
            { icon: BadgeCheck, title: 'تعامل أوضح', text: 'بيانات المتجر والتقييمات أمامك' },
            { icon: Banknote, title: 'الدفع عند الاستلام', text: 'ادفع عند وصول طلبك' },
            { icon: PackageCheck, title: 'متابعة الطلب', text: 'اعرف حالة طلبك من حسابك' },
          ].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-center gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-6" /></span><div><strong>{title}</strong><p className="mt-1 text-sm text-white/50">{text}</p></div></div>)}
        </div>
      </div>
      <div className="content-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3"><span className="grid size-14 place-items-center rounded-2xl bg-white"><img src="/ghyar-market-logo.png" alt="غيار ماركت" className="size-12 object-contain" /></span><div><strong className="block text-xl font-black">غيار ماركت</strong><span className="text-xs text-primary">قطعك أقرب مما تتخيل</span></div></Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">سوق متخصص يربط أصحاب السيارات بمتاجر قطع الغيار، بمعلومات واضحة وتجربة شراء تناسب السوق المصري.</p>
          <div className="mt-5 flex items-center gap-2 text-sm text-white/60"><MapPin className="size-4 text-primary" /> نخدم عملاء ومتاجر داخل مصر</div>
        </div>
        <FooterColumn title="السوق" links={marketplaceLinks} />
        <FooterColumn title="المساعدة والسياسات" links={policyLinks} />
        <div>
          <h3 className="font-black">هل تملك متجر قطع غيار؟</h3>
          <p className="mt-3 text-sm leading-7 text-white/55">اعرض مخزونك واستقبل طلبات ورسائل عملاء جدد.</p>
          <Button asChild variant="secondary" className="mt-5"><Link href={user?.role === 'SHOP_OWNER' ? '/seller/parts' : '/register'}>{user?.role === 'SHOP_OWNER' ? 'فتح لوحة المتجر' : 'انضم كبائع'}</Link></Button>
          <div className="mt-5 flex items-center gap-2 text-xs text-white/45"><Mail className="size-4" /> الدعم متاح من صفحة التواصل</div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="content-container flex flex-col items-center justify-between gap-3 py-5 text-xs text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} غيار ماركت. جميع الحقوق محفوظة.</p>
          <p className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-primary" /> نحمي الحسابات والطلبات بإجراءات أمان متعددة</p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return <div><h3 className="font-black">{title}</h3><ul className="mt-4 space-y-3">{links.map((link) => <li key={link.href}><Link href={link.href} className="text-sm text-white/55 transition hover:text-primary">{link.label}</Link></li>)}</ul></div>
}
