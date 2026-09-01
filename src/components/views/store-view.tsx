'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAppStore } from '@/lib/store'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Package,
  Store as StoreIcon,
  MapPin,
  Phone,
  ArrowRight,
  Star,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react'
import { Stars, formatPrice } from '@/components/common'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { FavoriteStoreButton } from '@/components/favorite-store-button'
import { UserAvatar } from '@/components/user-avatar'
import type { PublicStore } from '@/lib/public-marketplace'

export function StoreView({ storeId, initialStore = null, initialCanReview = false }: { storeId: string; initialStore?: PublicStore | null; initialCanReview?: boolean }) {
  const navigate = useAppNavigation()
  const user = useAppStore((state) => state.user)
  const setPendingView = useAppStore((state) => state.setPendingView)
  const { toast } = useToast()
  const [store, setStore] = useState<PublicStore | null>(initialStore)
  const [canReview, setCanReview] = useState(initialCanReview)
  const [loading, setLoading] = useState(!initialStore)
  const [loadError, setLoadError] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await fetch(`/api/stores?id=${storeId}${user ? '&viewer=1' : ''}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok && response.status !== 404) throw new Error(data.error || 'STORE_LOAD_FAILED')
      setStore(data.store || null)
      setCanReview(Boolean(data.canReview))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialStore?.id === storeId) {
      setStore(initialStore)
      setCanReview(initialCanReview)
      setLoadError(false)
      setLoading(false)
      return
    }
    void load()
  }, [initialCanReview, initialStore, storeId])

  // Keep the public store document cacheable; permissions are a private
  // client-side overlay loaded only after the signed-in identity is known.
  useEffect(() => {
    if (!initialStore || !user) {
      if (!user) setCanReview(false)
      return
    }
    let active = true
    fetch(`/api/stores?id=${storeId}&viewer=1`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ canReview?: boolean }> : null)
      .then((data) => { if (active && data) setCanReview(Boolean(data.canReview)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [initialStore, storeId, user?.id])

  const handleReview = async () => {
    if (!user) {
      setPendingView({ name: 'store', storeId })
      navigate({ name: 'login' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'store',
          targetId: storeId,
          rating: reviewForm.rating,
          comment: reviewForm.comment,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم إضافة تقييمك', description: 'شكراً على مشاركتك' })
      setReviewOpen(false)
      setReviewForm({ rating: 5, comment: '' })
      load()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="content-container space-y-6 py-10">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-8 w-1/3" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  if (!store) {
    if (loadError) {
      return (
        <div className="content-container py-20 text-center" role="alert">
          <StoreIcon className="mx-auto mb-3 size-16 text-destructive/60" />
          <h2 className="text-xl font-semibold">تعذر تحميل بيانات المتجر</h2>
          <p className="mt-2 text-muted-foreground">تحقق من اتصالك ثم حاول مرة أخرى.</p>
          <Button className="mt-4" onClick={load}>إعادة المحاولة</Button>
        </div>
      )
    }
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <StoreIcon className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">المتجر غير موجود</h2>
        <Button className="mt-4" onClick={() => navigate({ name: 'stores' })}>
          العودة للمتاجر
        </Button>
      </div>
    )
  }

  const avgRating = store.avgRating

  return (
    <div className="content-container space-y-7 py-10">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'stores' })}>
        <ArrowRight className="size-4 ml-1" />
        العودة للمتاجر
      </Button>

      {/* Store header */}
      <Card className="market-card overflow-hidden">
        <CardContent className="p-5 md:p-8">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="relative size-24 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shrink-0 overflow-hidden sm:size-28">
              {store.image ? <Image src={store.image} alt={store.name} fill sizes="112px" className="object-cover" /> : <StoreIcon className="size-10" />}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-extrabold md:text-4xl">{store.name}</h1>
                    {store.verified && <Badge className="bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="size-3.5 ml-1" />متجر موثق</Badge>}
                    {store.completionRate !== null && <Badge variant="outline">نسبة الطلبات المكتملة {store.completionRate}%</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Stars value={avgRating} size={16} />
                    <span className="text-sm text-muted-foreground">
                      {avgRating > 0 ? avgRating.toFixed(1) : 'لا تقييمات'} ({store.reviewCount} تقييم)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteStoreButton storeId={store.id} />
                  {canReview && <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Star className="size-4 ml-1" />
                        تقييم المحل
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>تقييم المتجر</DialogTitle>
                      <DialogDescription>
                        شارك تجربتك مع هذا المتجر (متاح فقط بعد إتمام طلب)
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>التقييم</Label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                              className="p-1"
                            >
                              <Star
                                className={`size-8 transition ${
                                  n <= reviewForm.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'fill-muted text-muted-foreground/30'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>التعليق</Label>
                        <Textarea
                          value={reviewForm.comment}
                          onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                          placeholder="اكتب تعليقك..."
                          rows={4}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setReviewOpen(false)}>
                        إلغاء
                      </Button>
                      <Button onClick={handleReview} disabled={submitting}>
                        {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                  </Dialog>}
                </div>
              </div>

              {store.description && (
                <p className="text-muted-foreground leading-relaxed">
                  {store.description}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                {store.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-primary" />
                    <span>{store.address}</span>
                  </div>
                )}
                {store.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-4 text-primary" />
                    <span dir="ltr">{store.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Package className="size-4 text-primary" />
                  <span>{store.partCount} قطعة غيار</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{store.completedOrderCount} طلباً مكتملًا</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-primary" />
                  <span>عضو منذ {new Date(store.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parts */}
      <div>
        <div className="mb-5">
          <p className="page-kicker">من هذا المتجر</p>
          <h2 className="mt-1 text-2xl font-extrabold">قطع الغيار المتوفرة</h2>
        </div>
        {store.parts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="size-10 mx-auto mb-2 opacity-50" />
              <p>لا توجد قطع غيار مضافة</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {store.parts.map((part) => (
              <Card
                key={part.id}
                role="link"
                tabIndex={0}
                aria-label={`عرض تفاصيل ${part.name}`}
                className="market-card w-full overflow-hidden cursor-pointer transition group h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate({ name: 'part', partId: part.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate({ name: 'part', partId: part.id })
                  }
                }}
              >
                <div className="relative flex aspect-[1.15/1] items-center justify-center overflow-hidden bg-muted/25">
                  {part.image ? (
                     
                    <Image
                      src={part.image}
                      alt={part.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-contain group-hover:scale-105 transition"
                    />
                  ) : (
                    <Package className="size-16 text-muted-foreground/40" />
                  )}
                  {part.stock === 0 && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      نفد
                    </span>
                  )}
                </div>
                <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
                  <h3 className="font-semibold line-clamp-2 text-sm leading-relaxed min-h-10 flex-1">
                    {part.name}
                  </h3>
                  {part.category && (
                    <Badge variant="outline" className="text-xs w-fit">
                      {part.category}
                    </Badge>
                  )}
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      {formatPrice(part.price)}
                    </span>
                    {part.stock > 0 ? (
                      <span className="text-xs text-emerald-600">متوفر</span>
                    ) : (
                      <span className="text-xs text-red-500">غير متوفر</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {store.partCount > store.parts.length && (
          <div className="mt-6 text-center">
            <Button asChild variant="outline">
              <Link href={`/parts?storeId=${encodeURIComponent(store.id)}`}>عرض كل قطع المتجر ({store.partCount})</Link>
            </Button>
          </div>
        )}
      </div>

      {/* Reviews */}
      {store.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="size-5 text-amber-400" />
              أحدث تقييمات العملاء ({store.reviewCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {store.reviews.map((review) => (
                <div key={review.id} className="pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={review.user.name} src={review.user.avatar} className="size-8 text-sm" />
                      <div>
                        <p className="text-sm font-medium">{review.user.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(review.createdAt).toLocaleDateString('ar-EG')}
                        </p>
                      </div>
                    </div>
                    <Stars value={review.rating} />
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {review.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
