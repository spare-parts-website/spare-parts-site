'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
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

interface Store {
  id: string
  name: string
  description?: string | null
  address?: string | null
  phone?: string | null
  image?: string | null
  owner: { name: string; phone?: string | null; avatar?: string | null }
  parts: any[]
  reviews: any[]
  verified: boolean
  completedOrderCount: number
  canReview?: boolean
}

export function StoreView({ storeId }: { storeId: string }) {
  const { setView, user, setPendingView } = useAppStore()
  const { toast } = useToast()
  const [store, setStore] = useState<Store | null>(null)
  const [canReview, setCanReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/stores?id=${storeId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setStore(data.store || null)
        setCanReview(Boolean(data.canReview))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [storeId])

  const handleReview = async () => {
    if (!user) {
      setPendingView({ name: 'store', storeId })
      setView({ name: 'login' })
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
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <StoreIcon className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">المتجر غير موجود</h2>
        <Button className="mt-4" onClick={() => setView({ name: 'stores' })}>
          العودة للمتاجر
        </Button>
      </div>
    )
  }

  const avgRating = store.reviews.length
    ? store.reviews.reduce((s: number, r: any) => s + r.rating, 0) / store.reviews.length
    : 0

  return (
    <div className="content-container space-y-7 py-10">
      <Button variant="ghost" size="sm" onClick={() => setView({ name: 'stores' })}>
        <ArrowRight className="size-4 ml-1" />
        العودة للمتاجر
      </Button>

      {/* Store header */}
      <Card className="market-card overflow-hidden">
        <CardContent className="p-5 md:p-8">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="relative size-24 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shrink-0 overflow-hidden sm:size-28">
              {store.image ? <Image src={store.image} alt={store.name} fill sizes="160px" quality={100} className="object-cover" /> : <StoreIcon className="size-10" />}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="relative size-10 rounded-xl overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  {store.owner.avatar ? <Image src={store.owner.avatar} alt={store.owner.name} fill sizes="32px" className="object-cover" /> : store.owner.name.charAt(0)}
                </div>
                <span>صاحب المحل: {store.owner.name}</span>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-extrabold md:text-4xl">{store.name}</h1>
                    {store.verified && <Badge className="bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="size-3.5 ml-1" />متجر موثق</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Stars value={avgRating} size={16} />
                    <span className="text-sm text-muted-foreground">
                      {avgRating > 0 ? avgRating.toFixed(1) : 'لا تقييمات'} ({store.reviews.length} تقييم)
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
                  <span>{store.parts.length} قطعة غيار</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{store.completedOrderCount} طلباً مكتملًا</span>
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
            {store.parts.map((part: any) => (
              <Card
                key={part.id}
                role="link"
                tabIndex={0}
                aria-label={`عرض تفاصيل ${part.name}`}
                className="market-card w-full overflow-hidden cursor-pointer transition group h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setView({ name: 'part', partId: part.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setView({ name: 'part', partId: part.id })
                  }
                }}
              >
                <div className="relative h-32 overflow-hidden bg-muted/35">
                  {store.image ? (
                    <Image
                      src={store.image}
                      alt={store.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 75vw, 1100px"
                      quality={100}
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-primary/5 text-primary/40">
                      <StoreIcon className="size-10" />
                    </div>
                  )}
                </div>
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
                  <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      {store.owner.avatar ? (
                        <Image src={store.owner.avatar} alt={store.owner.name} fill sizes="48px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-lg font-bold">{store.owner.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-primary">{store.name}</p>
                      <p className="truncate text-sm font-medium text-muted-foreground">البائع: {store.owner.name}</p>
                    </div>
                  </div>
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
      </div>

      {/* Reviews */}
      {store.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="size-5 text-amber-400" />
              تقييمات العملاء ({store.reviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {store.reviews.map((review: any) => (
                <div key={review.id} className="pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                        {review.user.name.charAt(0)}
                      </div>
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
