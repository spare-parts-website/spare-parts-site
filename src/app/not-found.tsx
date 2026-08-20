import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return <main className="content-container grid min-h-[65vh] place-items-center py-16" dir="rtl"><div className="max-w-lg text-center"><span className="mx-auto grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary"><SearchX className="size-9" /></span><p className="mt-6 text-sm font-black text-primary">خطأ 404</p><h1 className="mt-2 text-3xl font-black">الصفحة غير موجودة</h1><p className="mt-3 leading-7 text-muted-foreground">ربما تغير الرابط أو تم حذف المحتوى. يمكنك العودة للرئيسية أو تصفح قطع الغيار.</p><div className="mt-7 flex justify-center gap-3"><Button asChild><Link href="/">الرئيسية</Link></Button><Button asChild variant="outline"><Link href="/parts">تصفح القطع</Link></Button></div></div></main>
}
