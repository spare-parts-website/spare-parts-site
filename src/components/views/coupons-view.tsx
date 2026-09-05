'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Ticket, Plus, Trash2, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { subscribeAIDraft } from '@/lib/ai/draft-client'
import { useAppStore } from '@/lib/store'

interface Coupon {
  id: string
  code: string
  discountPercent: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt?: string | null
  createdAt: string
}

const COUPON_CACHE_TTL = 30_000
const couponCache = new Map<string, { fetchedAt: number; coupons: Coupon[] }>()
const couponInFlight = new Map<string, Promise<Coupon[]>>()

export async function warmSellerCoupons(userId: string, force = false) {
  const cached = couponCache.get(userId)
  if (!force && cached && Date.now() - cached.fetchedAt < COUPON_CACHE_TTL) return cached.coupons
  const pending = couponInFlight.get(userId)
  if (!force && pending) return pending

  const request = fetch('/api/coupons', { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'SHOP_COUPONS_LOAD_FAILED')
      const coupons = (data.coupons || []) as Coupon[]
      couponCache.set(userId, { fetchedAt: Date.now(), coupons })
      return coupons
    })
    .finally(() => couponInFlight.delete(userId))

  couponInFlight.set(userId, request)
  return request
}

export function CouponsView() {
  const { toast } = useToast()
  const userId = useAppStore((state) => state.user?.id)
  const cached = userId ? couponCache.get(userId)?.coupons || [] : []
  const hasCached = Boolean(userId && couponCache.has(userId))
  const [coupons, setCoupons] = useState<Coupon[]>(cached)
  const [loading, setLoading] = useState(!hasCached)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', discountPercent: '', maxUses: '100', expiresAt: '' })
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = (force = false) => {
    if (!userId) {
      setCoupons([])
      setLoading(false)
      return Promise.resolve([] as Coupon[])
    }
    const current = couponCache.get(userId)?.coupons
    if (current) {
      setCoupons(current)
      setLoading(false)
    } else {
      setLoading(true)
    }
    return warmSellerCoupons(userId, force)
      .then((next) => {
        setCoupons(next)
        return next
      })
      .catch(() => [] as Coupon[])
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
    return subscribeAIDraft('coupon', (draft) => {
      setForm((current) => ({ ...current, code: typeof draft.code === 'string' ? draft.code.toUpperCase() : current.code, discountPercent: draft.discountPercent === undefined ? current.discountPercent : String(draft.discountPercent), maxUses: draft.maxUses === undefined ? current.maxUses : String(draft.maxUses), expiresAt: typeof draft.expiresAt === 'string' ? draft.expiresAt : current.expiresAt }))
      setShowForm(true)
    })
  }, [userId])

  const handleCreate = async () => {
    if (!form.code || !form.discountPercent) {
      toast({ title: 'خطأ', description: 'الكود ونسبة الخصم مطلوبة', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم إنشاء الكوبون', description: `كود: ${form.code.toUpperCase()}` })
      setForm({ code: '', discountPercent: '', maxUses: '100', expiresAt: '' })
      setShowForm(false)
      void load(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل تريد حذف هذا الكوبون؟')) return
    await fetch(`/api/coupons?id=${id}`, { method: 'DELETE' })
    setCoupons((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (userId) couponCache.set(userId, { fetchedAt: Date.now(), coupons: next })
      return next
    })
    toast({ title: 'تم الحذف' })
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Ticket className="size-5 text-primary" />
            كوبونات الخصم
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {coupons.length === 0 ? 'لا توجد كوبونات' : `${coupons.length} كوبون`}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4 ml-1" />
          كوبون جديد
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">إنشاء كوبون جديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>كود الكوبون *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="مثال: SUMMER20"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>نسبة الخصم (%) *</Label>
                <Input
                  type="number"
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  placeholder="20"
                  min="1"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <Label>أقصى عدد استخدام</Label>
                <Input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="100"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الانتهاء (اختياري)</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? 'جاري الإنشاء...' : 'إنشاء الكوبون'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Ticket className="size-10 mx-auto mb-2 opacity-40" />
            <p>لا توجد كوبونات بعد</p>
            <Button className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="size-4 ml-1" />
              إنشاء كوبون
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((coupon) => (
            <Card key={coupon.id} className="overflow-hidden">
              <div className="bg-primary/5 p-4 border-b border-dashed border-primary/20 relative">
                <div className="absolute -top-2 -right-2 size-4 rounded-full bg-background border border-primary/20" />
                <div className="absolute -bottom-2 -right-2 size-4 rounded-full bg-background border border-primary/20" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">كود الخصم</p>
                    <p className="text-2xl font-bold text-primary tracking-wider" dir="ltr">
                      {coupon.code}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {coupon.discountPercent}%
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">الاستخدام</span>
                  <span className="font-medium">{coupon.usedCount} / {coupon.maxUses}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min((coupon.usedCount / coupon.maxUses) * 100, 100)}%` }}
                  />
                </div>
                {coupon.expiresAt && (
                  <div className="text-xs text-muted-foreground">
                    ينتهي: {new Date(coupon.expiresAt).toLocaleDateString('ar-EG')}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(coupon.code)}
                  >
                    {copied === coupon.code ? (
                      <><Check className="size-3 ml-1" />تم النسخ</>
                    ) : (
                      <><Copy className="size-3 ml-1" />نسخ</>
                    )}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(coupon.id)}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
