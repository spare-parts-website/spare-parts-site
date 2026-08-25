"use client"

import type { ChatStatus, FileUIPart } from "ai"
import { ImagePlus, Send, Square, X } from "lucide-react"
import { useRef, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function PromptInput({ children, className, onSubmit }: { children: ReactNode; className?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className={cn("rounded-2xl border bg-background p-2 shadow-sm", className)} onSubmit={onSubmit}>{children}</form>
}
export function PromptInputTextarea(props: React.ComponentProps<typeof Textarea>) { return <Textarea name="message" rows={1} className={cn("max-h-36 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0", props.className)} {...props} /> }
export function PromptInputFooter({ children }: { children: ReactNode }) { return <div className="flex items-center justify-between gap-2">{children}</div> }
export function PromptInputAttachmentsButton({ accept, disabled, onFiles }: { accept: string; disabled?: boolean; onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return <><input ref={ref} type="file" accept={accept} className="hidden" aria-label="إرفاق صورة" onChange={(event) => { onFiles(Array.from(event.target.files || [])); event.target.value = "" }} /><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label="إرفاق صورة" onClick={() => ref.current?.click()}><ImagePlus className="size-4" /></Button></>
}
export function PromptInputSubmit({ status, disabled, onStop }: { status: ChatStatus; disabled?: boolean; onStop: () => void }) {
  const busy = status === "submitted" || status === "streaming"
  return <Button type={busy ? "button" : "submit"} size="icon" disabled={disabled} aria-label={busy ? "إيقاف" : "إرسال"} onClick={busy ? onStop : undefined}>{busy ? <Square className="size-4" /> : status === "error" ? <X className="size-4" /> : <Send className="size-4" />}</Button>
}
export type PromptAttachment = FileUIPart & { id: string; file?: File }
