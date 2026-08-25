"use client"

import { memo, type ComponentProps, type HTMLAttributes } from "react"
import { Streamdown } from "streamdown"
import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import type { UIMessage } from "ai"
import { cn } from "@/lib/utils"

export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: UIMessage["role"] }
export function Message({ className, from, ...props }: MessageProps) {
  return <div className={cn("group flex w-full min-w-0 max-w-full flex-col gap-2", from === "user" ? "items-start" : "items-stretch", className)} {...props} />
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 max-w-full overflow-hidden break-words text-sm leading-7 [overflow-wrap:anywhere]", className)} {...props} />
}

const plugins = { cjk, code, math, mermaid }
export type MessageResponseProps = ComponentProps<typeof Streamdown>
export const MessageResponse = memo(function MessageResponse({ className, ...props }: MessageResponseProps) {
  return <Streamdown className={cn("size-full min-w-0 max-w-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:break-all", className)} plugins={plugins} {...props} />
})
