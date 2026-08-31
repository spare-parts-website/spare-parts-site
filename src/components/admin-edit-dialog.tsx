'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload, MultiImageUpload } from '@/components/image-upload'
import { useToast } from '@/hooks/use-toast'

export type AdminEditTarget =
  | { kind: 'user'; item: any }
  | { kind: 'store'; item: any }
  | { kind: 'part'; item: any }

export function AdminEditDialog({ target, onClose, onSaved }: { target: AdminEditTarget | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!target) return
    const item = target.item
    if (target.kind === 'user') {
      setForm({ name: item.name || '', phone: item.phone || '', avatar: item.avatar || '', emailNotifications: item.emailNotifications !== false })
    } else if (target.kind === 'store') {
      setForm({ name: item.name || '', description: item.description || '', address: item.address || '', phone: item.phone || '', image: item.image || '', verified: !!item.verified })
    } else {
      const images = [item.image, ...(item.images || []).map((image: { url: string }) => image.url)].filter(Boolean)
      setForm({ name: item.name || '', description: item.description || '', price: String(item.price ?? ''), stock: String(item.stock ?? ''), category: item.category || '', brand: item.brand || '', condition: item.condition || '', carModels: item.carModels || '', images })
    }
  }, [target])

  const save = async () => {
    if (!target || uploading) return
    setSaving(true)
    try {
      const endpoint = target.kind === 'part' ? '/api/parts' : `/api/admin/${target.kind === 'user' ? 'users' : 'stores'}`
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.item.id, ...form }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast({ title: 'تعذر حفظ التعديلات', description: data.error || 'حدث خطأ أثناء الحفظ', variant: 'destructive' })
        return
      }
      toast({ title: 'تم حفظ التعديلات' })
      onClose()
      onSaved()
    } catch {
      toast({ title: 'تعذر حفظ التعديلات', description: 'تحقق من الاتصال وحاول مرة أخرى', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent dir="rtl" className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>{target?.kind === 'user' ? 'تعديل حساب المستخدم' : target?.kind === 'store' ? 'تعديل المتجر' : 'تعديل عرض القطعة'}</DialogTitle>
        </DialogHeader>

        {target?.kind === 'user' && (
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="admin-user-name">الاسم</Label><Input id="admin-user-name" value={form.name || ''} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="admin-user-phone">رقم الهاتف</Label><Input id="admin-user-phone" value={form.phone || ''} maxLength={40} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="space-y-2"><Label>صورة الحساب</Label><ImageUpload purpose="avatar" cropPreview value={form.avatar || ''} onChange={(avatar) => setForm((current) => ({ ...current, avatar }))} onUploadingChange={setUploading} /></div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium">
              <input type="checkbox" checked={form.emailNotifications !== false} onChange={(event) => setForm((current) => ({ ...current, emailNotifications: event.target.checked }))} />
              إرسال إشعارات الحساب إلى البريد الإلكتروني
            </label>
          </div>
        )}

        {target?.kind === 'store' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="admin-store-name">اسم المتجر</Label><Input id="admin-store-name" value={form.name || ''} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-store-phone">هاتف المتجر</Label><Input id="admin-store-phone" value={form.phone || ''} maxLength={40} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="admin-store-address">العنوان</Label><Input id="admin-store-address" value={form.address || ''} maxLength={300} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="admin-store-description">الوصف</Label><Textarea id="admin-store-description" value={form.description || ''} maxLength={2000} rows={4} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="space-y-2"><Label>صورة المتجر</Label><ImageUpload purpose="store" cropPreview value={form.image || ''} onChange={(image) => setForm((current) => ({ ...current, image }))} onUploadingChange={setUploading} /></div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium">
              <input type="checkbox" checked={!!form.verified} onChange={(event) => setForm((current) => ({ ...current, verified: event.target.checked }))} />
              متجر موثق
            </label>
          </div>
        )}

        {target?.kind === 'part' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="admin-part-name">اسم القطعة</Label><Input id="admin-part-name" value={form.name || ''} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-price">السعر (ج.م)</Label><Input id="admin-part-price" type="number" min="0" step="0.01" value={form.price || ''} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-stock">المخزون</Label><Input id="admin-part-stock" type="number" min="0" step="1" value={form.stock || ''} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-brand">الماركة</Label><Input id="admin-part-brand" value={form.brand || ''} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-category">الفئة</Label><Input id="admin-part-category" value={form.category || ''} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="admin-part-condition">حالة المنتج</Label><Input id="admin-part-condition" value={form.condition || ''} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>صور العرض</Label><MultiImageUpload value={form.images || []} onChange={(images) => setForm((current) => ({ ...current, images }))} onUploadingChange={setUploading} /></div>
            <div className="space-y-2"><Label htmlFor="admin-part-description">الوصف</Label><Textarea id="admin-part-description" value={form.description || ''} rows={4} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="admin-part-models">السيارات المتوافقة</Label><Textarea id="admin-part-models" value={form.carModels || ''} rows={3} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, carModels: event.target.value }))} /></div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving || uploading}>{uploading ? 'انتظر اكتمال رفع الصورة' : saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
