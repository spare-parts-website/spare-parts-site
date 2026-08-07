'use client'

import { useAppStore } from '@/lib/store'
import { Wrench, Package, ShieldCheck, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Footer() {
  const { setView, user } = useAppStore()

  return (
    <footer className="mt-auto border-t bg-card">
      <div className="container mx-auto px-4 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img
                src="/ghyar-market-logo.png"
                alt="غيار ماركت"
                className="h-10 w-14 rounded-lg object-contain drop-shadow-sm"
              />
              <span className="font-bold">غيار ماركت</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              منصة متكاملة لربط مشتري قطع غيار السيارات بالمتاجر المعتمدة.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3">روابط سريعة</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  className="text-muted-foreground hover:text-primary transition"
                  onClick={() => setView({ name: 'home' })}
                >
                  الرئيسية
                </button>
              </li>
              <li><button className="text-muted-foreground hover:text-primary transition" onClick={() => setView({ name: 'legal', page: 'privacy' })}>الخصوصية</button></li>
              <li><button className="text-muted-foreground hover:text-primary transition" onClick={() => setView({ name: 'legal', page: 'returns' })}>الاسترجاع</button></li>
              <li><button className="text-muted-foreground hover:text-primary transition" onClick={() => setView({ name: 'legal', page: 'contact' })}>تواصل معنا</button></li>
              <li>
                <button
                  className="text-muted-foreground hover:text-primary transition"
                  onClick={() => setView({ name: 'stores' })}
                >
                  المتاجر
                </button>
              </li>
              <li>
                <button
                  className="text-muted-foreground hover:text-primary transition"
                  onClick={() => setView({ name: 'parts' })}
                >
                  قطع الغيار
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3">مميزاتنا</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                متاجر موثوقة
              </li>
              <li className="flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                توصيل سريع
              </li>
              <li className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                قطع أصلية
              </li>
              <li className="flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                ضمان الجودة
              </li>
            </ul>
          </div>

          {user?.role !== 'ADMIN' && <div>
            <h4 className="font-semibold mb-3">هل أنت صاحب محل؟</h4>
            <p className="text-sm text-muted-foreground mb-3">
              انضم إلينا واعرض قطع غيارك لآلاف العملاء
            </p>
            {!user || user.role !== 'SHOP_OWNER' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setView({ name: 'register' })}
              >
                سجل كصاحب محل
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setView({ name: 'shop-dashboard' })}
              >
                لوحة التحكم
              </Button>
            )}
          </div>}
        </div>

        <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} غيار ماركت. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  )
}
