'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled page error', error)
  }, [error])

  return (
    <main className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md space-y-4">
        <AlertTriangle className="mx-auto size-14 text-amber-500" />
        <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
        <p className="text-muted-foreground">لم نتمكن من تحميل هذه الصفحة. حاول مرة أخرى.</p>
        <Button onClick={() => reset()}>
          <RefreshCw className="size-4 ml-2" />
          إعادة المحاولة
        </Button>
      </div>
    </main>
  )
}
