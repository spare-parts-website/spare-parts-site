'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { useAppNavigation } from '@/lib/use-navigation'
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
  AlertTriangle,
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
import { UserAvatar } from '@/components/user-avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GOVERNORATE_DELIVERY } from '@/lib/delivery'
import type { PublicPart } from '@/lib/public-marketplace'
import { formatCompatibility } from '@/lib/vehicle-compatibility'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'

export function PartView({ partId, initialPart = null, initialCanReview = false }: { partId: string; initialPart?: PublicPart | null; initialCanReview?: boolean }) {
  const navigate = useAppNavigation()
  const user = useAppStore((state) => state.user)
  const setPendingView = useAppStore((state) => state.setPendingView)
  const addToCart = useAppStore((state) => state.addToCart)
  const { toast } = useToast()
  const [part, setPart] = useState<PublicPart | null>(initialPart)
  const [canReview, setCanReview] = useState(initialCanReview)
  const [loading, setLoading] = useState(!initialPart)
  const [loadError, setLoadError] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [orderForm, setOrderForm] = useState({
    quantity: 1,
    governorate: '',
    deliveryAddress: '',
    notes: '',
    paymentMethod: 'cod',
  })
  const [reviewForm, setReviewForm] = useState({ rating: 5, sellerRating: 5, packagingRating: 5, deliveryRating: 5, comment: '' })
  const [reportForm, setReportForm] = useState({ reason: '', details: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await fetch(`/api/parts?id=${partId}${user ? '&viewer=1' : ''}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok && response.status !== 404) throw new Error(data.error || 'PART_LOAD_FAILED')
      setPart(data.part || null)
      setCanReview(Boolean(data.canReview))
      setSelectedImage(0)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialPart?.id === partId) {
      setPart(initialPart)
      setCanReview(initialCanReview)
      setLoadError(false)
      setLoading(false)
      setSelectedImage(0)
      return
    }
    void load()
  }, [initialCanReview, initialPart, partId])

  // Public product HTML is cacheable and intentionally starts anonymous. Once
  // the auth overlay resolves, fetch only the viewer-specific permissions.
  useEffect(() => {
    if (!initialPart || !user) {
      if (!user) setCanReview(false)
      return
    }
    let active = true
    fetch(`/api/parts?id=${partId}&viewer=1`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ canReview?: boolean; part?: PublicPart | null }> : null)
      .then((data) => {
        if (!active || !data) return
        setCanReview(Boolean(data.canReview))
        if (data.part?.store) setPart((current) => current ? { ...current, store: { ...current.store, isOwnedByViewer: data.part!.store.isOwnedByViewer } } : current)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [initialPart, partId, user?.id])

  const handleOrder = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      navigate({ name: 'login' })
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
      navigate({ name: 'orders' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReview = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      navigate({ name: 'login' })
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
          sellerRating: reviewForm.sellerRating,
          packagingRating: reviewForm.packagingRating,
          deliveryRating: reviewForm.deliveryRating,
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
      setReviewForm({ rating: 5, sellerRating: 5, packagingRating: 5, deliveryRating: 5, comment: '' })
      load()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSellerChat = () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      navigate({ name: 'login' })
      toast({ title: 'سجّل الدخول أولاً', description: 'يجب تسجيل الدخول لمراسلة البائع' })
      return
    }
    navigate({ name: 'chat', partId })
  }

  const handleReport = async () => {
    if (!user) {
      setPendingView({ name: 'part', partId })
      navigate({ name: 'login' })
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
    if (loadError) {
      return (
        <div className="content-container py-20 text-center" role="alert">
          <Package className="mx-auto mb-3 size-16 text-destructive/60" />
          <h2 className="text-xl font-semibold">تعذر تحميل بيانات قطعة الغيار</h2>
          <p className="mt-2 text-muted-foreground">تحقق من اتصالك ثم حاول مرة أخرى.</p>
          <Button className="mt-4" onClick={load}>إعادة المحاولة</Button>
        </div>
      )
    }
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Package className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">قطعة الغيار غير موجودة</h2>
        <Button className="mt-4" onClick={() => navigate({ name: 'parts' })}>
          العودة لقطع الغيار
        </Button>
      </div>
    )
  }

  const avgRating = part.reviews.length
    ? part.reviews.reduce((s, r) => s + r.rating, 0) / part.reviews.length
    : 0
  const canShop = !user || (user.role !== 'ADMIN' && !part.store.isOwnedByViewer)
  const hasDeliveryPhone = !user || Boolean(normalizeEgyptianMobile(user.phone))
  const fitmentStatus = part.universal ? 'fits' : 'unknown'

  return (
    <div className="content-container space-y-7 py-10">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'parts' })}>
        <ArrowRight className="size-4 ml-1" />
        العودة
      </Button>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:items-start">
        {/* Image Gallery */}
        <Card className="market-card min-w-0 overflow-hidden">
          {/* Build array of all images (main image + additional images) */}
          {(() => {
            const allImages: string[] = []
            if (part.image) allImages.push(part.image)
            if (part.images) allImages.push(...part.images.slice().sort((a, b) => a.position - b.position).map((img) => img.url))

            return (
              <>
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/25">
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
                        className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-card/85 text-xl shadow-lg backdrop-blur transition hover:bg-card"
                        aria-label="السابق"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedImage((s) => (s + 1) % allImages.length)}
                        className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-card/85 text-xl shadow-lg backdrop-blur transition hover:bg-card"
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
        <div className="min-w-0 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {part.category && (
                <Badge variant="outline">{part.category}</Badge>
              )}
              {part.brand && <Badge variant="secondary">{part.brand}</Badge>}
              {part.condition && <Badge variant="secondary">{part.condition}</Badge>}
            </div>
            <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
              {part.name}
            </h1>
          </div>

          <button
            className="surface-panel flex w-full items-center gap-4 border-border/70 bg-muted/25 p-4 text-right transition hover:border-primary/40 hover:bg-primary/5"
            onClick={() => navigate({ name: 'store', storeId: part.store.id })}
          >
            <UserAvatar name={part.store.name} src={part.store.image} className="size-16 rounded-2xl text-2xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-primary">
                <StoreIcon className="size-5 shrink-0" />
                <span className="truncate text-lg font-bold">{part.store.name}</span>
                {part.store.verified && <ShieldCheck className="size-4 shrink-0" aria-label="متجر موثق" />}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">عرض تفاصيل المتجر وتقييماته</p>
            </div>
            <ArrowRight className="size-4 shrink-0" />
          </button>

          <div className="flex items-center gap-3">
            <Stars value={avgRating} size={18} />
            <span className="text-sm text-muted-foreground">
              {avgRating > 0 ? avgRating.toFixed(1) : 'لا تقييمات بعد'} ({part.reviews.length} تقييم)
            </span>
          </div>

          <Card className="market-card border-primary/20 bg-primary/5">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">السعر</p>
                <p className="text-3xl font-bold text-emerald-800 dark:text-emerald-300">
                  {formatPrice(part.price)}
                </p>
              </div>
              <div className="text-left">
                {part.stock > 0 ? (
                  <>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1">
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
              <h2 className="font-semibold mb-2">الوصف</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {part.description}
              </p>
            </div>
          )}

          {part.condition && (
            <div>
              <h2 className="mb-2 font-semibold">حالة المنتج</h2>
              <p className="text-muted-foreground">{part.condition}</p>
            </div>
          )}

          {(part.oemNumber || part.partNumber) && (
            <div>
              <h2 className="mb-2 font-semibold">بيانات تعريف القطعة</h2>
              <div className="flex flex-wrap gap-2" dir="ltr">
                {part.oemNumber && <Badge variant="outline" className="max-w-full whitespace-normal break-all">OEM: {part.oemNumber}</Badge>}
                {part.partNumber && <Badge variant="outline" className="max-w-full whitespace-normal break-all">Part No: {part.partNumber}</Badge>}
              </div>
            </div>
          )}

          <div className={`rounded-xl border p-4 ${fitmentStatus === 'fits' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
            <div className="flex items-start gap-3">
              {fitmentStatus === 'fits' ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />}
              <div>
                <p className="font-bold">{fitmentStatus === 'fits' ? 'قطعة عامة ومتوافقة' : 'التوافق غير مؤكد'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{fitmentStatus === 'fits' ? 'هذه القطعة مصنفة كقطعة عامة.' : 'لا توجد مطابقة مركبة محددة لهذا العرض. راجع بيانات التوافق أو اسأل البائع قبل الطلب.'}</p>
              </div>
            </div>
          </div>

          {(part.universal || part.compatibilities?.length || part.carModels) && (
            <div>
              <h2 className="font-semibold mb-2 flex items-center gap-2">
                <Car className="size-4 text-primary" />
                السيارات المتوافقة
              </h2>
              <div className="flex flex-wrap gap-2">
                {(part.universal
                  ? ['كل السيارات (قطعة عامة)']
                  : part.compatibilities?.length
                  ? part.compatibilities.map(formatCompatibility)
                  : (part.carModels || '').split(',')).map((car, idx) => {
                  const trimmed = car.trim()
                  if (!trimmed) return null
                  return (
                    <Badge key={idx} variant="secondary" className="text-sm py-1.5 px-3">
                      {trimmed}
                    </Badge>
                  )
                })}
              </div>
              {part.fitmentNotes && <p className="mt-3 text-sm text-muted-foreground">{part.fitmentNotes}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!part.store.isOwnedByViewer && (
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
                  fitmentStatus,
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
                  {!hasDeliveryPhone && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                      <p className="font-semibold">أضف رقم موبايل مصري صالح قبل تأكيد الطلب.</p>
                      <Button type="button" variant="link" className="h-auto p-0" onClick={() => { setOrderOpen(false); navigate({ name: 'profile' }) }}>تحديث الملف الشخصي</Button>
                    </div>
                  )}
                  {fitmentStatus !== 'fits' && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="font-semibold">تنبيه: توافق القطعة غير مؤكد</p>
                          <p className="mt-1 text-muted-foreground">يمكنك متابعة الطلب، لكن ننصح بمراجعة بيانات التوافق أو سؤال البائع أولاً.</p>
                        </div>
                      </div>
                    </div>
                  )}
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
                    <Select value={orderForm.governorate} onValueChange={(governorate) => setOrderForm({ ...orderForm, governorate })}>
                      <SelectTrigger aria-label="اختيار المحافظة لحساب الشحن"><SelectValue placeholder="اختر المحافظة لحساب الشحن" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(GOVERNORATE_DELIVERY).map(([code, item]) => (
                          <SelectItem key={code} value={code}>{item.ar} — {formatPrice(item.fee)} — {item.days} أيام</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <Button onClick={handleOrder} disabled={submitting || !hasDeliveryPhone || !orderForm.governorate || !orderForm.deliveryAddress}>
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
                  {([['sellerRating', 'تعامل البائع'], ['packagingRating', 'التغليف'], ['deliveryRating', 'التوصيل']] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label>{label}</Label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} type="button" onClick={() => setReviewForm({ ...reviewForm, [key]: n })} className="p-1">
                            <Star className={`size-6 ${n <= reviewForm[key] ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted-foreground/30'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
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

          <div className="grid grid-cols-3 gap-2 pt-4 border-t">
            <div className="text-center">
              <Truck className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">المدة حسب المحافظة</p>
            </div>
            <div className="text-center">
              <ShieldCheck className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">الدفع عند الاستلام</p>
            </div>
            <button type="button" className="text-center" onClick={() => navigate({ name: 'legal', page: 'returns' })}>
              <RotateCcw className="size-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground underline-offset-2 hover:underline">سياسة الاسترجاع</p>
            </button>
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
                      <UserAvatar name={review.user.name} src={review.user.avatar} className="size-8 text-sm" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{review.user.name}</p>
                          {review.verifiedPurchase && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]"><ShieldCheck className="ml-1 size-3" />شراء موثق</Badge>}
                        </div>
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
