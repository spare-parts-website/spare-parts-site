import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return <div className="content-container py-12" dir="rtl"><div className="mb-8 space-y-3"><Skeleton className="h-5 w-28" /><Skeleton className="h-10 w-72 max-w-full" /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-3xl" />)}</div></div>
}
