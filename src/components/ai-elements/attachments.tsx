"use client"

import type { FileUIPart } from "ai"
import { ImageIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AttachmentData = FileUIPart & { id: string }
export function Attachments({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 flex-wrap gap-2", className)} {...props} />
}
export function Attachment({ data, onRemove, className }: { data: AttachmentData; onRemove?: () => void; className?: string }) {
  return <div className={cn("group relative size-20 overflow-hidden rounded-xl border bg-muted", className)}>
    {data.mediaType?.startsWith("image/") && data.url ? <img src={data.url} alt={data.filename || "صورة مرفقة"} className="size-full object-cover" /> : <div className="grid size-full place-items-center"><ImageIcon className="size-6 text-muted-foreground" /></div>}
    {onRemove && <Button type="button" size="icon" variant="secondary" className="absolute left-1 top-1 size-6 rounded-full" aria-label="إزالة الصورة" onClick={onRemove}><X className="size-3" /></Button>}
  </div>
}
