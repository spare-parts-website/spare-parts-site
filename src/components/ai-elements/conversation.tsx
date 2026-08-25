"use client"

import { ArrowDown } from "lucide-react"
import type { ComponentProps } from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
  return <StickToBottom className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)} initial="smooth" resize="smooth" role="log" {...props} />
}
export function ConversationContent({ className, ...props }: ComponentProps<typeof StickToBottom.Content>) {
  return <StickToBottom.Content className={cn("flex min-w-0 flex-col gap-4 p-4", className)} {...props} />
}
export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return <Button type="button" size="icon" variant="outline" aria-label="الانتقال إلى آخر رسالة" className="absolute bottom-3 left-1/2 z-10 size-9 -translate-x-1/2 rounded-full" onClick={() => scrollToBottom()}><ArrowDown className="size-4" /></Button>
}
