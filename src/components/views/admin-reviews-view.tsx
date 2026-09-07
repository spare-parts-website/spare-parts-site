'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Stars } from '@/components/common'
import { useToast } from '@/hooks/use-toast'

type ReviewType = 'product' | 'store'
type ReviewPage = { rows: any[]; nextCursor: string | null }

export function AdminReviewsView() {
  const { toast } = useToast()
  const [product, setProduct] = useState<ReviewPage>({ rows: [], nextCursor: null })
  const [store, setStore] = useState<ReviewPage>({ rows: [], nextCursor: null })
  const [loading, setLoading] = useState(true)

  const load = async (type: ReviewType, append = false) => {
    const current = type === 'product' ? product : store
    if (append && !current.nextCursor) return
    const params = new URLSearchParams({ type, limit: '25' })
    if (append && current.nextCursor) params.set('cursor', current.nextCursor)
    try {
      const response = await fetch(`/api/admin/reviews?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل التقييمات')
      const set = type === 'product' ? setProduct : setStore
      set((previous) => ({ rows: append ? [...previous.rows, ...(data.reviews || [])] : data.reviews || [], nextCursor: data.nextCursor || null }))
    } catch (error) {
      toast({ title: 'تعذر تحميل التقييمات', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' })
    }
  }

  useEffect(() => { void Promise.all([load('product'), load('store')]).finally(() => setLoading(false)) }, [])

  const mutate = async (review: any, type: ReviewType, action: 'toggle' | 'delete') => {
    const response = await fetch(action === 'delete' ? `/api/reviews?id=${encodeURIComponent(review.id)}&type=${type}` : '/api/reviews', action === 'delete' ? { method: 'DELETE' } : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id, type, blocked: !review.blocked }) })
    const data = await response.json().catch(() => ({}))
    if (response.status === 428 && data.stepUpUrl) { window.location.assign(data.stepUpUrl); return }
    if (!response.ok) { toast({ title: 'تعذر تحديث التقييم', description: data.error || 'حدث خطأ', variant: 'destructive' }); return }
    toast({ title: action === 'delete' ? 'تم حذف التقييم' : 'تم تحديث حالة التقييم' })
    await load(type)
  }

  if (loading) return <Card><CardContent className="py-16 text-center text-muted-foreground">جاري تحميل التقييمات...</CardContent></Card>

  return <div className="grid gap-6 lg:grid-cols-2"><ReviewColumn title="تقييمات القطع" type="product" page={product} loadMore={() => void load('product', true)} mutate={mutate} /><ReviewColumn title="تقييمات المتاجر" type="store" page={store} loadMore={() => void load('store', true)} mutate={mutate} /></div>
}

function ReviewColumn({ title, type, page, loadMore, mutate }: { title: string; type: ReviewType; page: ReviewPage; loadMore: () => void; mutate: (review: any, type: ReviewType, action: 'toggle' | 'delete') => void }) {
  return <div className="space-y-3"><h2 className="text-lg font-bold">{title}</h2>{page.rows.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد تقييمات</CardContent></Card> : page.rows.map((review) => <Card key={review.id} className={review.blocked ? 'opacity-65' : ''}><CardContent className="space-y-2 p-4"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{review.user?.name}</span><Stars value={review.rating} size={12} />{review.blocked && <Badge variant="destructive">محجوب</Badge>}</div><p className="text-xs text-muted-foreground">{type === 'product' ? review.part?.name : review.store?.name} • {new Date(review.createdAt).toLocaleDateString('ar-EG')}</p>{review.comment && <p className="text-sm">{review.comment}</p>}<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => mutate(review, type, 'toggle')}>{review.blocked ? 'إظهار' : 'حجب'}</Button><Button size="sm" variant="destructive" onClick={() => { if (confirm('هل تريد حذف هذا التقييم؟')) mutate(review, type, 'delete') }}>حذف</Button></div></CardContent></Card>)}{page.nextCursor && <Button className="w-full" variant="outline" onClick={loadMore}>تحميل المزيد</Button>}</div>
}
