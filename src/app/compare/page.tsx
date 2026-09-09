import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getAnonymousPublicPart } from '@/lib/public-marketplace'
import { comparisonIds } from '@/lib/comparison'
import { formatPrice } from '@/lib/format-price'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'مقارنة قطع الغيار', robots: { index: false, follow: true } }
export const dynamic = 'force-dynamic'

export default async function ComparisonPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const query = await searchParams
  const ids = comparisonIds(typeof query.ids === 'string' ? query.ids : '')
  const results = await Promise.all(ids.map(id => getAnonymousPublicPart(id)))
  const parts = results.flatMap(result => result.part ? [result.part] : [])
  const rows = [
    { label: 'السعر', values: parts.map(part => formatPrice(part.price)) },
    { label: 'التوفر', values: parts.map(part => part.stock > 0 ? 'متوفر' : 'غير متوفر') },
    { label: 'الحالة', values: parts.map(part => part.condition || 'غير محددة') },
    { label: 'الماركة', values: parts.map(part => part.brand || 'غير محددة') },
    { label: 'رقم القطعة', values: parts.map(part => part.partNumber || 'غير متاح') },
    { label: 'رقم OEM', values: parts.map(part => part.oemNumber || 'غير متاح') },
    { label: 'التوافق المعلن', values: parts.map(part => part.universal ? 'يصفها البائع بأنها عامة؛ تأكد قبل الطلب' : part.compatibilities.length ? part.compatibilities.map(item => [item.make, item.model, item.generation, item.yearFrom && item.yearTo ? `${item.yearFrom}–${item.yearTo}` : 'سنوات غير مكتملة'].filter(Boolean).join(' ')).join('، ') : 'لم يحدد البائع توافقاً؛ اسأله قبل الطلب') },
    { label: 'المتجر', values: parts.map(part => part.store.name) },
    { label: 'توثيق هوية المتجر', values: parts.map(part => part.store.verified ? 'موثقة — لا تعني ضمان القطعة' : 'غير موثقة') },
  ]
  return <div className="content-container space-y-6 py-10">
    <div className="page-heading"><div><p className="page-kicker">اختيار على بيّنة</p><h1 className="mt-2 text-3xl font-black">قارن قبل ما تختار</h1><p className="mt-3 text-muted-foreground">حتى أربع قطع جنباً إلى جنب. راجع التوافق مع المتجر قبل الطلب.</p></div><Button asChild variant="outline"><Link href="/parts" prefetch={false}>اختيار قطع أخرى</Link></Button></div>
    {parts.length !== ids.length && <p role="status" className="rounded-xl border p-4 text-sm">بعض القطع لم تعد متاحة للعرض وتم استبعادها من المقارنة.</p>}
    {!parts.length ? <div className="surface-panel p-10 text-center"><h2 className="text-xl font-bold">ابدأ باختيار قطع للمقارنة</h2><p className="mt-3 text-muted-foreground">ستجد زر المقارنة على بطاقات قطع الغيار.</p></div> :
      <div className="overflow-x-auto rounded-2xl border bg-card" role="region" aria-label="جدول مقارنة القطع" tabIndex={0}>
        <table className="w-full min-w-[38rem] border-collapse text-start text-sm">
          <caption className="sr-only">مقارنة مواصفات وأسعار قطع الغيار المختارة</caption>
          <thead><tr><th scope="col" className="w-40 p-5 text-start">التفاصيل</th>{parts.map(part => <th key={part.id} scope="col" className="min-w-52 max-w-72 border-s p-5 text-start"><div className="relative mb-4 h-36 rounded-xl bg-muted">{part.image && <Image src={part.image} alt={part.name} fill sizes="240px" className="object-contain p-3" />}</div><Link href={'/parts/' + encodeURIComponent(part.id)} prefetch={false} className="text-base font-bold text-primary underline underline-offset-4">{part.name}</Link></th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} className="border-t"><th scope="row" className="p-5 text-start font-semibold">{row.label}</th>{row.values.map((value, index) => <td key={parts[index].id} className="max-w-72 border-s p-5 leading-7">{value}</td>)}</tr>)}</tbody>
        </table>
      </div>}
  </div>
}
