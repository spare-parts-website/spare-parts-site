'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload, MultiImageUpload } from '@/components/image-upload'
import { useToast } from '@/hooks/use-toast'
import { parseVehicleCompatibility, type CompatibilityInput } from '@/lib/vehicle-compatibility'
import { Plus, Trash2 } from 'lucide-react'

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
      setForm({ name: item.name || '', email: item.email || '', phone: item.phone || '', avatar: item.avatar || '', emailNotifications: item.emailNotifications !== false, emailDeliveryStatus: item.emailDeliveryStatus || 'ACTIVE' })
    } else if (target.kind === 'store') {
      setForm({ name: item.name || '', description: item.description || '', address: item.address || '', phone: item.phone || '', image: item.image || '', verified: !!item.verified })
    } else {
      const images = [item.image, ...(item.images || []).map((image: { url: string }) => image.url)].filter(Boolean)
      const compatibilities = item.compatibilities?.length
        ? item.compatibilities.map(({ id: _id, partId: _partId, ...compatibility }: CompatibilityInput & { id?: string; partId?: string }) => compatibility)
        : parseVehicleCompatibility(item.carModels)
      setForm({
        name: item.name || '', description: item.description || '', price: String(item.price ?? ''), stock: String(item.stock ?? ''),
        category: item.category || '', brand: item.brand || '', condition: item.condition || '', partNumber: item.partNumber || '',
        oemNumber: item.oemNumber || '', searchAliases: item.searchAliases || '', universal: !!item.universal,
        fitmentNotes: item.fitmentNotes || '', compatibilities, images,
      })
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
            <div className="space-y-2"><Label htmlFor="admin-user-email">البريد الإلكتروني</Label><Input id="admin-user-email" type="email" value={form.email || ''} maxLength={254} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /><p className="text-xs text-muted-foreground">تغيير البريد يعيد حالة التسليم إلى نشطة حتى يمكن للحساب استلام رسائل التحقق.</p></div>
            <div className="space-y-2"><Label htmlFor="admin-user-name">الاسم</Label><Input id="admin-user-name" value={form.name || ''} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="admin-user-phone">رقم الهاتف</Label><Input id="admin-user-phone" value={form.phone || ''} maxLength={40} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="space-y-2"><Label>صورة الحساب</Label><ImageUpload purpose="avatar" cropPreview value={form.avatar || ''} onChange={(avatar) => setForm((current) => ({ ...current, avatar }))} onUploadingChange={setUploading} /></div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium">
              <input type="checkbox" checked={form.emailNotifications !== false} onChange={(event) => setForm((current) => ({ ...current, emailNotifications: event.target.checked }))} />
              إرسال إشعارات الحساب إلى البريد الإلكتروني
            </label>
            <div className="space-y-2"><Label htmlFor="admin-user-delivery-status">حالة تسليم البريد</Label><select id="admin-user-delivery-status" value={form.emailDeliveryStatus || 'ACTIVE'} onChange={(event) => setForm((current) => ({ ...current, emailDeliveryStatus: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="ACTIVE">نشط</option><option value="BOUNCED">ارتداد دائم</option><option value="COMPLAINED">شكوى</option><option value="SUPPRESSED">محظور من المزوّد</option></select><p className="text-xs text-muted-foreground">لا تُعد التفعيل إلا بعد تصحيح البريد أو التأكد من موافقة المستخدم.</p></div>
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
              <div className="space-y-2"><Label htmlFor="admin-part-price">السعر (ج.م)</Label><Input id="admin-part-price" type="number" min="0.01" step="0.01" value={form.price || ''} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-stock">المخزون</Label><Input id="admin-part-stock" type="number" min="0" step="1" value={form.stock || ''} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-brand">الماركة</Label><Input id="admin-part-brand" value={form.brand || ''} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-category">الفئة</Label><Input id="admin-part-category" value={form.category || ''} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="admin-part-condition">حالة المنتج</Label><Input id="admin-part-condition" value={form.condition || ''} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-number">رقم القطعة</Label><Input id="admin-part-number" value={form.partNumber || ''} maxLength={100} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, partNumber: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="admin-part-oem">OEM رقم</Label><Input id="admin-part-oem" value={form.oemNumber || ''} maxLength={100} dir="ltr" onChange={(event) => setForm((current) => ({ ...current, oemNumber: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="admin-part-aliases">أسماء بحث إضافية</Label><Input id="admin-part-aliases" value={form.searchAliases || ''} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, searchAliases: event.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>صور العرض</Label><MultiImageUpload value={form.images || []} onChange={(images) => setForm((current) => ({ ...current, images }))} onUploadingChange={setUploading} /></div>
            <div className="space-y-2"><Label htmlFor="admin-part-description">الوصف</Label><Textarea id="admin-part-description" value={form.description || ''} rows={4} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><Label className="text-base">توافق السيارة</Label><p className="mt-1 text-xs text-muted-foreground">الحد الأدنى للشركة والموديل. اتركه فارغاً إذا لم تتوفر بيانات مؤكدة.</p></div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!form.universal} onChange={(event) => setForm((current) => ({ ...current, universal: event.target.checked, compatibilities: event.target.checked ? [] : current.compatibilities }))} className="size-4 accent-primary" />قطعة عامة لكل السيارات</label>
              </div>
              {!form.universal && <div className="space-y-3">
                {(form.compatibilities || []).map((item: CompatibilityInput, index: number) => <div key={index} className="space-y-3 rounded-xl bg-muted/35 p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1"><Label>الشركة *</Label><Input value={item.make} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, make: event.target.value } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>الموديل *</Label><Input value={item.model} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, model: event.target.value } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>الجيل</Label><Input value={item.generation || ''} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, generation: event.target.value } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>المحرك</Label><Input value={item.engine || ''} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, engine: event.target.value } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>من سنة</Label><Input type="number" min="1950" max="2030" value={item.yearFrom || ''} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, yearFrom: event.target.value ? Number(event.target.value) : null } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>إلى سنة</Label><Input type="number" min="1950" max="2030" value={item.yearTo || ''} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, yearTo: event.target.value ? Number(event.target.value) : null } : entry) }))} dir="ltr" /></div>
                    <div className="space-y-1"><Label>الفئة / Trim</Label><Input value={item.trim || ''} onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, trim: event.target.value } : entry) }))} dir="ltr" /></div>
                    <div className="flex items-end"><Button type="button" variant="ghost" className="text-destructive" onClick={() => setForm((current) => ({ ...current, compatibilities: current.compatibilities.filter((_: CompatibilityInput, entryIndex: number) => entryIndex !== index) }))}><Trash2 className="ml-1 size-4" />حذف</Button></div>
                  </div>
                  <Input value={item.notes || ''} placeholder="ملاحظة خاصة بهذا التوافق (اختياري)" onChange={(event) => setForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry: CompatibilityInput, entryIndex: number) => entryIndex === index ? { ...entry, notes: event.target.value } : entry) }))} />
                </div>)}
                <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, compatibilities: [...(current.compatibilities || []), { make: '', model: '', generation: null, yearFrom: null, yearTo: null, engine: null, trim: null, notes: null }] }))}><Plus className="ml-1 size-4" />إضافة توافق</Button>
              </div>}
              <div className="space-y-2"><Label htmlFor="admin-part-fitment-notes">ملاحظات التوافق العامة</Label><Textarea id="admin-part-fitment-notes" value={form.fitmentNotes || ''} rows={2} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, fitmentNotes: event.target.value }))} /></div>
            </div>
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
