'use client'

import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, ShieldCheck, FileText, RotateCcw, Mail } from 'lucide-react'

const pages = {
  privacy: { title: 'سياسة الخصوصية', icon: ShieldCheck, paragraphs: ['نحفظ بيانات الحساب والطلبات اللازمة لتشغيل المنصة وخدمة التوصيل.', 'لا نبيع بياناتك الشخصية. نشارك فقط بيانات الطلب الضرورية مع المتجر وشركة التوصيل عند الحاجة.', 'يمكنك طلب تعديل بياناتك أو حذف حسابك من خلال التواصل مع الدعم.'] },
  terms: { title: 'شروط الاستخدام', icon: FileText, paragraphs: ['باستخدام المنصة، توافق على تقديم بيانات صحيحة وعدم استخدام الموقع في الاحتيال أو نشر منتجات مخالفة.', 'المتاجر مسؤولة عن دقة الأسعار والمخزون ووصف المنتجات، والعميل مسؤول عن عنوان التوصيل.', 'نحتفظ بحق تعليق الحسابات أو المتاجر التي تخالف القواعد أو تضر بالمستخدمين.'] },
  returns: { title: 'سياسة الاسترجاع', icon: RotateCcw, paragraphs: ['يمكن طلب الاسترجاع بعد تأكيد التوصيل وفق حالة المنتج والمدة التي يحددها المتجر.', 'يجب أن تكون القطعة غير مستخدمة وبحالتها الأصلية ما لم يكن العيب من المنتج نفسه.', 'تواصل مع المتجر من خلال محادثة الطلب، وسنراجع النزاعات عند الحاجة.'] },
  contact: { title: 'تواصل معنا', icon: Mail, paragraphs: ['للمساعدة في الطلبات أو الحسابات أو البلاغات، استخدم محادثة الطلب أو تواصل مع إدارة المنصة.', 'عند التواصل، أرسل رقم الطلب وصورة المشكلة دون مشاركة كلمة المرور أو مفاتيح API.', 'سنضيف بريد الدعم الرسمي قبل الإطلاق التجاري.'] },
} as const

export function LegalView({ page }: { page: keyof typeof pages }) {
  const { setView } = useAppStore()
  const content = pages[page]
  const Icon = content.icon
  return <div className="container mx-auto px-4 py-8 max-w-3xl space-y-5">
    <Button variant="ghost" size="sm" onClick={() => setView({ name: 'home' })}><ArrowRight className="size-4 ml-1" />العودة</Button>
    <Card><CardContent className="p-6 md:p-8 space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Icon className="size-6 text-primary" />{content.title}</h1>
      <div className="space-y-4 text-muted-foreground leading-8">{content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    </CardContent></Card>
  </div>
}
