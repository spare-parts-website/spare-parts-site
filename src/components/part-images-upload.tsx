'use client'

import { useRef } from 'react'
import { Image as ImageIcon, Star, Upload, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export const MAX_PART_IMAGES = 4
const MAX_FILE_SIZE = 4 * 1024 * 1024

export interface PartPhoto {
  file: File
  preview: string
}

interface PartImagesUploadProps {
  value: PartPhoto[]
  mainIndex: number
  onChange: (photos: PartPhoto[]) => void
  onMainChange: (index: number) => void
}

export function PartImagesUpload({ value, mainIndex, onChange, onMainChange }: PartImagesUploadProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: File[]) => {
    const availableSlots = MAX_PART_IMAGES - value.length
    if (availableSlots <= 0) {
      toast({ title: 'الحد الأقصى 4 صور', variant: 'destructive' })
      return
    }

    const validPhotos: PartPhoto[] = []
    for (const file of files.slice(0, availableSlots)) {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'نوع الملف غير مدعوم', description: 'اختر صوراً بصيغة JPG أو PNG أو WebP', variant: 'destructive' })
        continue
      }
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        toast({ title: 'حجم الصورة كبير', description: 'الحد الأقصى للصورة 4 ميجا', variant: 'destructive' })
        continue
      }
      validPhotos.push({ file, preview: URL.createObjectURL(file) })
    }

    if (validPhotos.length > 0) {
      onChange([...value, ...validPhotos])
      if (value.length === 0) onMainChange(0)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(value[index].preview)
    const next = value.filter((_, currentIndex) => currentIndex !== index)
    onChange(next)
    if (next.length === 0) onMainChange(0)
    else if (index === mainIndex) onMainChange(0)
    else if (index < mainIndex) onMainChange(mainIndex - 1)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {value.map((photo, index) => (
          <div key={photo.preview} className={cn('relative overflow-hidden rounded-xl border-2 bg-muted/20', index === mainIndex ? 'border-primary' : 'border-border')}>
            <img src={photo.preview} alt={`صورة القطعة ${index + 1}`} className="h-28 w-full object-contain" />
            {index === mainIndex && (
              <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
                <Star className="size-3 fill-current" /> الرئيسية
              </span>
            )}
            <button type="button" onClick={() => onMainChange(index)} className="absolute bottom-1 left-1 rounded-full bg-card/90 px-2 py-1 text-[10px] font-medium shadow hover:bg-card">
              {index === mainIndex ? 'الصورة الرئيسية' : 'اجعلها الرئيسية'}
            </button>
            <button type="button" onClick={() => removePhoto(index)} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600" aria-label="حذف الصورة">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {value.length < MAX_PART_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={(event) => {
              event.preventDefault()
              addFiles(Array.from(event.dataTransfer.files))
            }}
            onDragOver={(event) => event.preventDefault()}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
          >
            <Upload className="size-6" />
            <span className="text-xs">إضافة صور</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => addFiles(Array.from(event.target.files || []))} className="hidden" />
      {value.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          <ImageIcon className="size-5 shrink-0" />
          <span>اختر حتى 4 صور. سيتم رفعها كلها عند الضغط على حفظ.</span>
        </div>
      )}
    </div>
  )
}
