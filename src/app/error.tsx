'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="content-container grid min-h-[60vh] place-items-center py-16" dir="rtl"><div className="max-w-lg text-center"><span className="mx-auto grid size-20 place-items-center rounded-3xl bg-destructive/10 text-destructive"><AlertTriangle className="size-9" /></span><h1 className="mt-6 text-3xl font-black">حدث خطأ غير متوقع</h1><p className="mt-3 leading-7 text-muted-foreground">لم نتمكن من عرض هذه الصفحة الآن. بياناتك لم تتأثر، ويمكنك المحاولة مرة أخرى.</p><Button className="mt-7" onClick={reset}><RefreshCw className="ml-2 size-4" />إعادة المحاولة</Button></div></main>
}
