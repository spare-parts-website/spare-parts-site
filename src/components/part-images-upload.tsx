'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Star, Upload, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const MAX_IMAGES = 4
const MAX_FILE_SIZE = 4 * 1024 * 1024

interface PartImagesUploadProps {
  value: string[]
  mainIndex: number
  onChange: (urls: string[]) => void
  onMainChange: (index: number) => void
  onUploadingChange?: (uploading: boolean) => void
}

export function PartImagesUpload({
  value,
  mainIndex,
  onChange,
  onMainChange,
  onUploadingChange,
}: PartImagesUploadProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const setUploadingState = (next: boolean) => {
    setUploading(next)
    onUploadingChange?.(next)
  }

  const uploadFiles = async (files: File[]) => {
    const availableSlots = MAX_IMAGES - value.length
    if (availableSlots <= 0) {
      toast({ title: 'الحد الأقصى 4 صور', variant: 'destructive' })
      return
    }

    setUploadingState(true)
    const uploaded: string[] = []

    try {
      for (const file of files.slice(0, availableSlots)) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'نوع الملف غير مدعوم', description: 'اختر صوراً بصيغة JPG أو PNG أو WebP', variant: 'destructive' })
          continue
        }
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
          toast({ title: 'حجم الصورة كبير', description: 'الحد الأقصى للصورة 4 ميجا', variant: 'destructive' })
          continue
        }

        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await response.json()
        if (!response.ok || !data.url) {
          toast({ title: 'فشل رفع الصورة', description: data.error || 'حدث خطأ أثناء رفع الصورة', variant: 'destructive' })
          continue
        }
        uploaded.push(data.url)
      }

      if (uploaded.length > 0) {
        onChange([...value, ...uploaded])
        if (value.length === 0) onMainChange(0)
      }
    } finally {
      setUploadingState(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeImage = (index: number) => {
    const next = value.filter((_, currentIndex) => currentIndex !== index)
    onChange(next)
    if (next.length === 0) onMainChange(0)
    else if (index === mainIndex) onMainChange(0)
    else if (index < mainIndex) onMainChange(mainIndex - 1)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {value.map((url, index) => (
          <div key={url} className={cn('relative overflow-hidden rounded-xl border-2 bg-muted/20', index === mainIndex ? 'border-primary' : 'border-border')}>
            <img src={url} alt={`صورة القطعة ${index + 1}`} className="h-28 w-full object-contain" />
            {index === mainIndex && (
              <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
                <Star className="size-3 fill-current" /> الرئيسية
              </span>
            )}
            <button
              type="button"
              onClick={() => onMainChange(index)}
              className="absolute bottom-1 left-1 rounded-full bg-card/90 px-2 py-1 text-[10px] font-medium shadow hover:bg-card"
            >
              {index === mainIndex ? 'الصورة الرئيسية' : 'اجعلها الرئيسية'}
            </button>
            <button
              type="button"
              onClick={() => removeImage(index)}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
              aria-label="حذف الصورة"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {value.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={(event) => {
              event.preventDefault()
              void uploadFiles(Array.from(event.dataTransfer.files))
            }}
            onDragOver={(event) => event.preventDefault()}
            disabled={uploading}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6" />}
            <span className="text-xs">إضافة صور</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
        className="hidden"
      />
      {value.length === 0 && !uploading && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          <ImageIcon className="size-5 shrink-0" />
          <span>يمكنك رفع حتى 4 صور، ثم اختيار الصورة الرئيسية التي ستظهر في الإعلانات.</span>
        </div>
      )}
      {uploading && <p className="text-xs text-muted-foreground">جاري رفع الصور، انتظر اكتمال الرفع قبل الحفظ...</p>}
    </div>
  )
}
