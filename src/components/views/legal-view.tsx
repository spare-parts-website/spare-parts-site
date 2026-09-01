'use client'

import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, ShieldCheck, FileText, RotateCcw, Mail } from 'lucide-react'

const pages = {
  privacy: { title: 'سياسة الخصوصية', icon: ShieldCheck, paragraphs: ['نحفظ بيانات الحساب والطلبات والعنوان اللازمة لتشغيل المنصة ومعالجة التوصيل.', 'لا نبيع بياناتك الشخصية. نشارك بيانات الطلب الضرورية فقط مع المتجر أو شركة التوصيل لتنفيذ الطلب.', 'تُحفظ رسائل المحادثة والصور المرتبطة بالطلبات للمساعدة في حل النزاعات ومكافحة الاحتيال.', 'يمكنك طلب تصحيح بياناتك أو حذف حسابك من خلال إدارة المنصة. لا تشارك كلمة المرور أو مفاتيح API مع أي شخص.'] },
  terms: { title: 'شروط الاستخدام', icon: FileText, paragraphs: ['باستخدام المنصة، توافق على تقديم بيانات صحيحة وعدم استخدام الموقع في الاحتيال أو نشر منتجات مخالفة أو مضللة.', 'المتاجر مسؤولة عن دقة الأسعار والمخزون ووصف المنتجات، وعن الالتزام بالأنظمة المعمول بها. العميل مسؤول عن صحة عنوان التوصيل وبيانات التواصل.', 'المنصة تسهّل التواصل بين المشترين والمتاجر ولا تضمن جودة قطعة لم يتم التحقق منها. استخدم البلاغات والمحادثة عند وجود مشكلة.', 'نحتفظ بحق تعليق الحسابات أو المتاجر التي تخالف القواعد أو تضر بالمستخدمين، مع مراجعة البلاغات من الإدارة.'] },
  returns: { title: 'سياسة الاسترجاع', icon: RotateCcw, paragraphs: ['يمكن طلب الاسترجاع بعد تأكيد التوصيل من خلال محادثة الطلب، وفق حالة المنتج والمدة والشروط التي يحددها المتجر.', 'يجب أن تكون القطعة غير مستخدمة وبحالتها الأصلية، ما لم يكن السبب عيباً أو عدم مطابقة الوصف.', 'لا تعتبر حالة الطلب مسترجعة إلا بعد تحديثها داخل المنصة. يحتفظ المشتري بصور المنتج والمحادثة كدليل عند الحاجة.', 'قد تختلف حقوق المستهلك الإلزامية حسب بلدك؛ هذه الصفحة عامة وتحتاج مراجعة قانونية محلية قبل الإطلاق التجاري.'] },
  contact: { title: 'تواصل معنا', icon: Mail, paragraphs: ['للمساعدة في الطلبات أو الحسابات أو البلاغات، افتح صفحة الدعم وأنشئ تذكرة يتابعها فريق غيار ماركت.', 'عند التواصل، أرسل رقم الطلب ووصف المشكلة أو صورة مناسبة، دون مشاركة كلمة المرور أو مفاتيح API.', 'يمكن للمتاجر والمشترين الإبلاغ عن المنتجات أو الحسابات المخالفة، وتراجع الإدارة البلاغات من صندوق الدعم.', 'تبقى المحادثة والردود داخل حسابك، ويمكنك متابعة حالة التذكرة حتى إغلاقها.'] },
} as const

export function LegalView({ page }: { page: keyof typeof pages }) {
  const navigate = useAppNavigation()
  const content = pages[page]
  const Icon = content.icon
  return <div className="container mx-auto px-4 py-8 max-w-3xl space-y-5">
    <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'home' })}><ArrowRight className="size-4 ml-1" />العودة</Button>
    <Card><CardContent className="p-6 md:p-8 space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Icon className="size-6 text-primary" />{content.title}</h1>
      <p className="text-xs text-muted-foreground">آخر تحديث: 7 أغسطس 2026 • هذه المعلومات عامة وليست استشارة قانونية.</p>
      <div className="space-y-4 text-muted-foreground leading-8">{content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    </CardContent></Card>
  </div>
}
