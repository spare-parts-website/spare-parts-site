'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingBag,
  Package,
  Store as StoreIcon,
  MapPin,
  Calendar,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { StatusBadge, formatPrice } from '@/components/common'
import { OrderTimeline } from '@/components/order-timeline'
import { useToast } from '@/hooks/use-toast'
import { DisputeDialog } from '@/components/dispute-dialog'

interface OrderTimelineEntry {
  id: string
  status: string
  note?: string | null
  createdAt: string
}

interface Order {
  id: string
  quantity: number
  totalPrice: number
  status: string
  paymentStatus: string
  paymentMethod?: string | null
  deliveryAddress: string
  governorate?: string | null
  shippingFee?: number
  estimatedDeliveryAt?: string | null
  trackingNumber?: string | null
  notes?: string | null
  createdAt: string
  part: { id: string; name: string; image?: string | null; price: number }
  items?: Array<{
    id: string
    partId?: string | null
    productName: string
    productImage?: string | null
    unitPrice: number
    quantity: number
    discount: number
    itemTotal: number
  }>
  store: { id: string; name: string }
  buyer: { id: string; name: string }
  timeline?: OrderTimelineEntry[]
}

export function OrdersView() {
  const navigate = useAppNavigation()
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/orders?scope=buyer')
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user && ['BUYER', 'SHOP_OWNER'].includes(user.role)) load()
  }, [user])

  const handleAction = async (id: string, action: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم التحديث', description: 'تم تحديث حالة الطلب' })
      load()
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingBag className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">سجّل الدخول لعرض طلباتك</h2>
        <Button className="mt-4" onClick={() => navigate({ name: 'login' })}>
          تسجيل الدخول
        </Button>
      </div>
    )
  }

  if (!['BUYER', 'SHOP_OWNER'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingBag className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">طلبات العملاء متاحة للمشترين وأصحاب المحلات فقط</h2>
        <Button className="mt-4" onClick={() => navigate({ name: 'admin-dashboard', tab: 'orders' })}>لوحة المدير</Button>
      </div>
    )
  }

  return (
    <div className="content-container space-y-7 py-10">
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">المتابعة</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">طلباتي</h1>
        <p className="text-muted-foreground mt-1">
          {loading ? 'جاري التحميل...' : `${orders.length} طلب`}
        </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShoppingBag className="size-12 mx-auto mb-3 opacity-50" />
            <p className="mb-3">لا توجد طلبات بعد</p>
            <Button onClick={() => navigate({ name: 'parts' })}>
              تصفح قطع الغيار
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="market-card">
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Part image */}
                  <div className="relative size-24 rounded-2xl bg-muted/30 flex items-center justify-center shrink-0">
                    {(order.items?.[0]?.productImage || order.part.image) ? (
                       
                      <Image
                        src={order.items?.[0]?.productImage || order.part.image!}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-contain rounded-lg"
                      />
                    ) : (
                      <Package className="size-10 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <button
                          className="font-semibold hover:text-primary transition text-right"
                          onClick={() => navigate({ name: 'part', partId: order.items?.[0]?.partId || order.part.id })}
                        >
                          {order.items && order.items.length > 1 ? `${order.items.length} منتجات من نفس المتجر` : order.items?.[0]?.productName || order.part.name}
                        </button>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <StoreIcon className="size-3" />
                          <button
                            onClick={() => navigate({ name: 'store', storeId: order.store.id })}
                            className="hover:text-primary"
                          >
                            {order.store.name}
                          </button>
                        </div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    {order.items && order.items.length > 1 && (
                      <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <button
                              type="button"
                              className="min-w-0 truncate text-right font-medium hover:text-primary disabled:pointer-events-none"
                              disabled={!item.partId}
                              onClick={() => item.partId && navigate({ name: 'part', partId: item.partId })}
                            >
                              {item.productName}
                            </button>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {item.quantity} × {formatPrice(item.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground pt-2">
                      <div>
                        <span className="block text-foreground font-medium">الكمية</span>
                        {order.quantity}
                      </div>
                      <div>
                        <span className="block text-foreground font-medium">الإجمالي</span>
                        {formatPrice(order.totalPrice)}
                      </div>
                      <div>
                        <span className="block text-foreground font-medium">الشحن</span>
                        {formatPrice(order.shippingFee || 0)}
                      </div>
                      <div>
                        <span className="block text-foreground font-medium">التاريخ</span>
                        {new Date(order.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                      <div>
                        <span className="block text-foreground font-medium">الدفع</span>
                        <StatusBadge status={order.paymentStatus} />
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-1">
                      <MapPin className="size-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-1">{order.deliveryAddress}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t">
                      {order.status === 'SHIPPED' && (
                        <Button
                          size="sm"
                          onClick={() => handleAction(order.id, 'deliver')}
                          disabled={submitting}
                        >
                          <CheckCircle2 className="size-4 ml-1" />
                          تم استلام الطلب و الدفع
                        </Button>
                      )}
                      {order.trackingNumber && <Badge variant="outline">رقم التتبع: {order.trackingNumber}</Badge>}
                      {order.status === 'DELIVERED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(order.id, 'return')}
                          disabled={submitting}
                        >
                          <RotateCcw className="size-4 ml-1" />
                          استرجاع القطعة
                        </Button>
                      )}
                      {['SHIPPED', 'DELIVERED'].includes(order.status) && <DisputeDialog orderId={order.id} />}
                      {(order.status === 'PENDING' || order.status === 'APPROVED') && order.paymentStatus === 'UNPAID' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm('هل أنت متأكد من إلغاء هذا الطلب؟ ستتم إعادة الكمية إلى مخزون المتجر.')) handleAction(order.id, 'cancel')
                          }}
                          disabled={submitting}
                        >
                          <XCircle className="size-4 ml-1" />
                          إلغاء الطلب
                        </Button>
                      )}
                      {order.status === 'PENDING' && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                          <Clock className="size-3 ml-1" />
                          بانتظار موافقة المحل
                        </Badge>
                      )}
                      {order.status === 'APPROVED' && order.paymentMethod === 'cod' && (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                          الدفع عند الاستلام
                        </Badge>
                      )}
                      {order.status === 'REJECTED' && (
                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                          <XCircle className="size-3 ml-1" />
                          رفض المحل الطلب
                        </Badge>
                      )}
                      {order.status === 'CANCELLED' && (
                        <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50">
                          <XCircle className="size-3 ml-1" />
                          تم إلغاء الطلب
                        </Badge>
                      )}
                      {order.status === 'DELIVERED' && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                          <CheckCircle2 className="size-3 ml-1" />
                          تم التوصيل
                        </Badge>
                      )}
                      {/* Invoice button */}
                      {(order.status === 'PAID' || order.status === 'DELIVERED') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/api/invoices?id=${order.id}`, '_blank')}
                        >
                          <FileText className="size-4 ml-1" />
                          فاتورة
                        </Button>
                      )}
                      {/* Chat button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ name: 'chat', orderId: order.id })}
                      >
                        <MessageSquare className="size-4 ml-1" />
                        دردشة
                      </Button>
                      {/* Timeline toggle */}
                      {order.timeline && order.timeline.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        >
                          {expandedOrder === order.id ? (
                            <><ChevronUp className="size-4 ml-1" />إخفاء التتبع</>
                          ) : (
                            <><ChevronDown className="size-4 ml-1" />تتبع الطلب</>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Timeline */}
                    {expandedOrder === order.id && order.timeline && (
                      <div className="mt-4 pt-4 border-t">
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <Clock className="size-4 text-primary" />
                          تتبع حالة الطلب
                        </h3>
                        <OrderTimeline timeline={order.timeline} currentStatus={order.status} />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  )
}
