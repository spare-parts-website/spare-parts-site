'use client'

import { useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_INPUT_BYTES, IMAGE_UPLOAD_TYPES, type ImagePurpose } from '@/lib/image-policy'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  onUploadingChange?: (uploading: boolean) => void
  className?: string
  cropPreview?: boolean
  compact?: boolean
  purpose: Exclude<ImagePurpose, 'part' | 'chat'>
}

interface MultiImageUploadProps {
  value: string[]
  onChange: (urls: string[]) => void
  onUploadingChange?: (uploading: boolean) => void
  maxImages?: number
  className?: string
}

// Module-level ref to track any ongoing upload synchronously (works across re-renders)
let anyUploadInProgress = false
export function isAnyUploadInProgress() {
  return anyUploadInProgress
}

export function ImageUpload({ value, onChange, onUploadingChange, className, cropPreview = false, compact = false, purpose }: ImageUploadProps) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setUploadingState = (val: boolean) => {
    anyUploadInProgress = val
    flushSync(() => {
      setUploading(val)
      onUploadingChange?.(val)
    })
  }

  const handleFile = async (file: File) => {
    // Validate type
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      toast({
        title: 'نوع الملف غير مدعوم',
        description: 'يرجى اختيار صورة JPG أو PNG أو WebP',
        variant: 'destructive',
      })
      return
    }

    // Validate size (4MB max)
    if (file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES) {
      toast({
        title: 'حجم الصورة كبير',
        description: 'الحد الأقصى للحجم 4 ميجا',
        variant: 'destructive',
      })
      return
    }

    setUploadingState(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('purpose', purpose)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'فشل الرفع',
          description: data.error || 'حدث خطأ أثناء رفع الصورة',
          variant: 'destructive',
        })
        return
      }

      onChange(data.url)
      toast({
        title: 'تم رفع الصورة',
        description: 'تم رفع الصورة بنجاح',
      })
    } catch (e) {
      toast({
        title: 'فشل الرفع',
        description: 'حدث خطأ في الاتصال',
        variant: 'destructive',
      })
    } finally {
      setUploadingState(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }

  const handleRemove = () => {
    onChange('')
    if (inputRef.current) inputRef.current.value = ''
  }

  if (value) {
    return (
      <div className={cn('relative group', className)}>
        <img
          src={value}
          alt="معاينة"
          className={cn('w-full rounded-lg border bg-muted/30', compact ? 'h-24' : 'h-40', cropPreview ? 'object-cover' : 'object-contain')}
        />
        {cropPreview && (
          <p className="mt-2 text-xs text-muted-foreground">المعاينة توضح الجزء الذي سيظهر داخل قالب صورة المتجر.</p>
        )}
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-2 left-2 size-7 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100 transition shadow"
          aria-label="حذف الصورة"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute top-2 right-2 size-7 rounded-full bg-card/90 text-foreground flex items-center justify-center opacity-90 hover:opacity-100 transition shadow"
          aria-label="تغيير الصورة"
        >
          <Upload className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div className={cn('', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={uploading}
        className={cn(
          'w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition',
          compact ? 'h-24' : 'h-40',
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/40 hover:bg-muted/30',
          uploading && 'opacity-60 cursor-wait',
          !uploading && 'cursor-pointer'
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="size-7 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">جاري رفع الصورة...</span>
            <span className="text-xs text-muted-foreground">لا تضغط حفظ حتى تكتمل</span>
          </>
        ) : (
          <>
            <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <ImageIcon className="size-6" />
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-medium">
                اضغط لاختيار صورة أو اسحبها هنا
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                JPG, PNG, WebP • بحد أقصى 4 ميجا
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          onChange={handleInputChange}
          className="hidden"
        />
      </button>
    </div>
  )
}

export function MultiImageUpload({ value, onChange, onUploadingChange, maxImages = 4, className }: MultiImageUploadProps) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setUploadingState = (next: boolean) => {
    anyUploadInProgress = next
    flushSync(() => {
      setUploading(next)
      onUploadingChange?.(next)
    })
  }

  const uploadFiles = async (files: File[]) => {
    const available = maxImages - value.length
    if (available <= 0) {
      toast({ title: 'تم الوصول للحد الأقصى', description: `يمكن إضافة ${maxImages} صور فقط.`, variant: 'destructive' })
      return
    }
    if (files.length > available) {
      toast({ title: 'صور كثيرة', description: `اختر ${available} صورة إضافية كحد أقصى.`, variant: 'destructive' })
      return
    }
    if (files.some((file) => !(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type))) {
      toast({ title: 'نوع الملف غير مدعوم', description: 'يرجى اختيار صور فقط.', variant: 'destructive' })
      return
    }
    if (files.some((file) => file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES)) {
      toast({ title: 'حجم الصورة كبير', description: 'الحد الأقصى لكل صورة 4 ميجا.', variant: 'destructive' })
      return
    }

    setUploadingState(true)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('purpose', 'part')
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء رفع الصورة')
        uploaded.push(data.url)
      }
      onChange([...value, ...uploaded])
      toast({ title: 'تم رفع الصور', description: 'اختر الصورة الرئيسية قبل حفظ العرض.' })
    } catch (error) {
      toast({ title: 'فشل الرفع', description: error instanceof Error ? error.message : 'حدث خطأ في الاتصال', variant: 'destructive' })
    } finally {
      setUploadingState(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {value.map((url, index) => (
            <div key={url} className={cn('group relative overflow-hidden rounded-xl border-2 bg-muted/30', index === 0 ? 'border-primary' : 'border-border')}>
              <img src={url} alt={`صورة القطعة ${index + 1}`} className="aspect-square w-full object-contain" />
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                <button type="button" onClick={() => onChange([url, ...value.filter((item) => item !== url)])} className="rounded-md bg-card/95 px-2 py-1 text-[11px] font-medium shadow" aria-label={`اختيار الصورة ${index + 1} كرئيسية`}>
                  {index === 0 ? 'الرئيسية' : 'تعيين رئيسية'}
                </button>
                <button type="button" onClick={() => onChange(value.filter((item) => item !== url))} className="flex size-7 items-center justify-center rounded-md bg-red-500 text-white shadow" aria-label="حذف الصورة">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || value.length >= maxImages} className={cn('flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition', value.length >= maxImages ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/50 hover:bg-muted/30', uploading && 'cursor-wait opacity-60')}>
        {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <ImageIcon className="size-6 text-primary" />}
        <span className="text-sm font-medium">{uploading ? 'جاري رفع الصور...' : `إضافة صور (${value.length}/${maxImages})`}</span>
        <span className="text-xs text-muted-foreground">أول صورة هي الصورة الرئيسية</span>
      </button>
      <input ref={inputRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple onChange={(event) => uploadFiles(Array.from(event.target.files || []))} className="hidden" />
    </div>
  )
}
