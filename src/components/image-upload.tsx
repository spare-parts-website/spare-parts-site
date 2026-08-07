'use client'

import { useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  onUploadingChange?: (uploading: boolean) => void
  className?: string
  cropPreview?: boolean
  compact?: boolean
}

// Module-level ref to track any ongoing upload synchronously (works across re-renders)
let anyUploadInProgress = false
export function isAnyUploadInProgress() {
  return anyUploadInProgress
}

export function ImageUpload({ value, onChange, onUploadingChange, className, cropPreview = false, compact = false }: ImageUploadProps) {
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
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'نوع الملف غير مدعوم',
        description: 'يرجى اختيار صورة (JPG, PNG, WebP, GIF)',
        variant: 'destructive',
      })
      return
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'حجم الصورة كبير',
        description: 'الحد الأقصى للحجم 5 ميجا',
        variant: 'destructive',
      })
      return
    }

    setUploadingState(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

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
          accept="image/*"
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
                JPG, PNG, WebP • بحد أقصى 5 ميجا
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
        />
      </button>
    </div>
  )
}
