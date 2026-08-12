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
  ArrowRight,
  ShoppingCart,
  CheckCircle2,
  Star,
  Truck,
  ShieldCheck,
  RotateCcw,
  Car,
  MessageSquare,
  Flag,
} from 'lucide-react'
import { Stars, formatPrice } from '@/components/common'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

interface Review {
  id: string
  rating: number
  comment?: string | null
  createdAt: string
  user: { name: string }
}

interface PartImage {
  id: string
  url: string
}

interface Part {
  id: string
  name: string
  description?: string | null
  price: number
  stock: number
  category?: string | null
  brand?: string | null
  image?: string | null
  carModels?: string | null
  store: { id: string; name: string; address?: string | null; phone?: string | null; ownerId: string; owner: { name: string; avatar?: string | null } }
  reviews: Review[]
  images?: PartImage[]
}

export function PartView({ partId }: { partId: string }) {
  const { setView, user, setPendingView, addToCart } = useAppStore()
  const { toast } = useToast()
  const [part, setPart] = useState<Part | null>(null)
  const [canReview, setCanReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [orderOpen, setOrderOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [orderForm, setOrderForm] = useState({
    quantity: 1,
    deliveryAddress: '',
    notes: '',
    paymentMethod: 'cod',
  })
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' })
  const [reportForm, setReportForm] = useState({ reason: '', details: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/parts?id=${partId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setPart(data.part || null)
        setCanReview(Boolean(data.canReview))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [partId])

  const handleOrder = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      setView({ name: 'login' })
      toast({ title: 'سجّل الدخول أولاً', description: 'يجب تسجيل الدخول لإتمام الطلب' })
      return
    }
    setSubmitting(true)
    try {
      const body = { ...orderForm, partId, clientOrderId: crypto.randomUUID() }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'تم إرسال الطلب',
        description: 'سيتم مراجعة طلبك من قبل المحل',
      })
      setOrderOpen(false)
      setView({ name: 'orders' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReview = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      setView({ name: 'login' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product',
          targetId: partId,
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

  const handleSellerChat = () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      setView({ name: 'login' })
      toast({ title: 'سجّل الدخول أولاً', description: 'يجب تسجيل الدخول لمراسلة البائع' })
      return
    }
    setView({ name: 'chat', partId })
  }

  const handleReport = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      setView({ name: 'login' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'part', targetId: partId, reason: reportForm.reason, details: reportForm.details }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر إرسال البلاغ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم إرسال البلاغ', description: 'سيراجع المدير البلاغ قريباً' })
      setReportOpen(false)
      setReportForm({ reason: '', details: '' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    )
  }

  if (!part) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Package className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">قطعة الغيار غير موجودة</h2>
        <Button className="mt-4" onClick={() => setView({ name: 'parts' })}>
          العودة لقطع الغيار
        </Button>
      </div>
    )
  }

  const avgRating = part.reviews.length
    ? part.reviews.reduce((s, r) => s + r.rating, 0) / part.reviews.length
    : 0
  const canShop = !user || (user.role !== 'ADMIN' && user.id !== part.store.ownerId)

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setView({ name: 'parts' })}>
        <ArrowRight className="size-4 ml-1" />
        العودة
      </Button>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <Card className="overflow-hidden">
          {/* Build array of all images (main image + additional images) */}
          {(() => {
            const allImages: string[] = []
            if (part.image) allImages.push(part.image)
            if (part.images) allImages.push(...part.images.map((img) => img.url))

            return (
              <>
                <div className="aspect-square bg-muted/30 flex items-center justify-center relative">
                  {allImages.length > 0 ? (
                    <Image
                      src={allImages[selectedImage] || allImages[0]}
                      alt={part.name}
                      fill
                      priority
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain"
                    />
                  ) : (
                    <Package className="size-32 text-muted-foreground/30" />
                  )}
                  {part.brand && (
                    <span className="absolute top-4 left-4 bg-card/90 backdrop-blur px-3 py-1 rounded-full text-sm font-medium">
                      {part.brand}
                    </span>
                  )}
                  {allImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedImage((s) => (s - 1 + allImages.length) % allImages.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-card/80 backdrop-blur shadow hover:bg-card transition flex items-center justify-center"
                        aria-label="السابق"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedImage((s) => (s + 1) % allImages.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-card/80 backdrop-blur shadow hover:bg-card transition flex items-center justify-center"
                        aria-label="التالي"
                      >
                        ›
                      </button>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur px-3 py-1 rounded-full text-xs">
                        {selectedImage + 1} / {allImages.length}
                      </span>
                    </>
                  )}
                </div>
                {/* Thumbnails */}
                {allImages.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto scrollbar-thin">
                    {allImages.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedImage(idx)}
                        className={`relative size-16 rounded-lg overflow-hidden border-2 transition shrink-0 ${
                          selectedImage === idx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <Image src={img} alt="" fill sizes="64px" className="object-contain bg-muted/30" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </Card>

        {/* Info */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {part.category && (
                <Badge variant="outline">{part.category}</Badge>
              )}
              {part.brand && <Badge variant="secondary">{part.brand}</Badge>}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">
              {part.name}
            </h1>
          </div>

          <button
            className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-right transition hover:border-primary/40 hover:bg-primary/5"
            onClick={() => setView({ name: 'store', storeId: part.store.id })}
          >
            <div className="relative size-16 shrink-0 overflow-hidden rounded-full border-2 border-primary/20 bg-primary/10 text-primary">
              {part.store.owner.avatar ? (
                <Image src={part.store.owner.avatar} alt={part.store.owner.name} fill sizes="64px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold">{part.store.owner.name.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-primary">
                <StoreIcon className="size-5 shrink-0" />
                <span className="truncate text-lg font-bold">{part.store.name}</span>
              </div>
              <p className="mt-1 truncate text-base font-semibold text-muted-foreground">البائع: {part.store.owner.name}</p>
            </div>
            <ArrowRight className="size-4 shrink-0" />
          </button>

          <div className="flex items-center gap-3">
            <Stars value={avgRating} size={18} />
            <span className="text-sm text-muted-foreground">
              {avgRating > 0 ? avgRating.toFixed(1) : 'لا تقييمات بعد'} ({part.reviews.length} تقييم)
            </span>
          </div>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">السعر</p>
                <p className="text-3xl font-bold text-primary">
                  {formatPrice(part.price)}
                </p>
              </div>
              <div className="text-left">
                {part.stock > 0 ? (
                  <>
                    <p className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-4" />
                      متوفر
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      الكمية: {part.stock}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-500 font-medium">نفد المخزون</p>
                )}
              </div>
            </CardContent>
          </Card>

          {part.description && (
            <div>
              <h3 className="font-semibold mb-2">الوصف</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {part.description}
              </p>
            </div>
          )}

          {part.carModels && (
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Car className="size-4 text-primary" />
                السيارات المتوافقة
              </h3>
              <div className="flex flex-wrap gap-2">
                {part.carModels.split(',').map((car, idx) => {
                  const trimmed = car.trim()
                  if (!trimmed) return null
                  return (
                    <Badge key={idx} variant="secondary" className="text-sm py-1.5 px-3">
                      {trimmed}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {user?.id !== part.store.ownerId && (
              <Button size="lg" variant="outline" onClick={handleSellerChat}>
                <MessageSquare className="size-4 ml-2" />
                اسأل البائع
              </Button>
            )}

            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="ghost">
                  <Flag className="size-4 ml-2" />
                  إبلاغ
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>الإبلاغ عن هذه القطعة</DialogTitle>
                  <DialogDescription>أخبرنا إذا كان الإعلان مخالفاً أو مضللاً.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>سبب البلاغ</Label>
                    <Input value={reportForm.reason} onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })} placeholder="مثلاً: سعر مضلل أو قطعة غير مطابقة" maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label>تفاصيل إضافية (اختياري)</Label>
                    <Textarea value={reportForm.details} onChange={(e) => setReportForm({ ...reportForm, details: e.target.value })} placeholder="اشرح المشكلة باختصار" maxLength={1000} rows={4} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReportOpen(false)}>إلغاء</Button>
                  <Button onClick={handleReport} disabled={submitting || reportForm.reason.trim().length < 2}>{submitting ? 'جاري الإرسال...' : 'إرسال البلاغ'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add to cart and buy buttons */}
            {canShop && <Button
              size="lg"
              variant="outline"
              disabled={part.stock === 0}
              onClick={() => {
                addToCart({
                  partId: part.id,
                  name: part.name,
                  price: part.price,
                  image: part.image,
                  storeId: part.store.id,
                  storeName: part.store.name,
                  stock: part.stock,
                })
                toast({ title: 'تمت الإضافة للسلة', description: part.name })
              }}
            >
              <ShoppingCart className="size-4 ml-2" />
              أضف للسلة
            </Button>}

            {canShop && <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
              <DialogTrigger asChild>
                <Button size="lg" disabled={part.stock === 0}>
                  <ShoppingCart className="size-4 ml-2" />
                  اشترِ الآن
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>طلب توصيل القطعة</DialogTitle>
                  <DialogDescription>
                    املأ البيانات التالية لإتمام طلبك
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
                  <div className="space-y-2">
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      min="1"
                      max={part.stock}
                      value={orderForm.quantity}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      المتوفر: {part.stock} | الإجمالي:{' '}
                      <span className="font-semibold text-primary">
                        {formatPrice(part.price * orderForm.quantity)}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>عنوان التوصيل</Label>
                    <Textarea
                      value={orderForm.deliveryAddress}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, deliveryAddress: e.target.value })
                      }
                      placeholder="المدينة - الحي - الشارع - تفاصيل الموقع"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>طريقة الدفع</Label>
                    <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 text-sm flex items-center gap-2">
                      <Truck className="size-5 text-primary" />
                      <div>
                        <p className="font-medium">الدفع عند الاستلام</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ادفع للمحل عند استلام القطعة
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>ملاحظات (اختياري)</Label>
                    <Textarea
                      value={orderForm.notes}
                      onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                      placeholder="أي تفاصيل إضافية..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOrderOpen(false)}>
                    إلغاء
                  </Button>
                  <Button onClick={handleOrder} disabled={submitting || !orderForm.deliveryAddress}>
                    {submitting ? 'جاري الإرسال...' : 'تأكيد الطلب'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}

            {canReview && <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="outline">
                  <Star className="size-4 ml-2" />
                  أضف تقييم
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>تقييم القطعة</DialogTitle>
                  <DialogDescription>
                    شارك تجربتك مع هذه القطعة (متاح فقط بعد إتمام طلب)
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

          {/* Trust signals */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t">
            <div className="text-center">
              <Truck className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">توصيل سريع</p>
            </div>
            <div className="text-center">
              <ShieldCheck className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">الدفع عند الاستلام</p>
            </div>
            <div className="text-center">
              <RotateCcw className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">إمكانية الاسترجاع</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="size-5 text-amber-400" />
            تقييمات العملاء ({part.reviews.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {part.reviews.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Star className="size-10 mx-auto mb-2 opacity-40" />
              <p>لا توجد تقييمات بعد. كن أول من يقيّم!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {part.reviews.map((review) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
