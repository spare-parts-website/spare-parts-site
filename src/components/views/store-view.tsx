'use client'

import { useEffect, useState } from 'react'
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

interface Store {
  id: string
  name: string
  description?: string | null
  address?: string | null
  phone?: string | null
  image?: string | null
  owner: { name: string; phone?: string | null }
  parts: any[]
  reviews: any[]
  verified: boolean
  completedOrderCount: number
}

export function StoreView({ storeId }: { storeId: string }) {
  const { setView, user, setPendingView } = useAppStore()
  const { toast } = useToast()
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/stores?id=${storeId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setStore(data.store || null))
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
      <div className="container mx-auto px-4 py-8 space-y-6">
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
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setView({ name: 'stores' })}>
        <ArrowRight className="size-4 ml-1" />
        العودة للمتاجر
      </Button>

      {/* Store header */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-bl from-primary/20 to-accent" />
        <CardContent className="p-6 -mt-12">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="size-20 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shrink-0">
              <StoreIcon className="size-10" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl md:text-3xl font-bold">{store.name}</h1>
                    {store.verified && <Badge className="bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="size-3.5 ml-1" />متجر موثق</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Stars value={avgRating} size={16} />
                    <span className="text-sm text-muted-foreground">
                      {avgRating > 0 ? avgRating.toFixed(1) : 'لا تقييمات'} ({store.reviews.length} تقييم)
                    </span>
                  </div>
                </div>
                <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
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
                </Dialog>
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
        <h2 className="text-xl font-bold mb-4">قطع الغيار المتوفرة</h2>
        {store.parts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="size-10 mx-auto mb-2 opacity-50" />
              <p>لا توجد قطع غيار مضافة</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {store.parts.map((part: any) => (
              <Card
                key={part.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition group h-full flex flex-col"
                onClick={() => setView({ name: 'part', partId: part.id })}
              >
                <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                  {part.image ? (
                     
                    <img
                      src={part.image}
                      alt={part.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition"
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
                          {new Date(review.createdAt).toLocaleDateString('ar-SA')}
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
