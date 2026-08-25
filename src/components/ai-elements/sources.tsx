"use client"

import { BookOpen, ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export function Sources({ className, ...props }: React.ComponentProps<typeof Collapsible>) { return <Collapsible className={cn("text-xs", className)} {...props} /> }
export function SourcesTrigger({ count }: { count: number }) { return <CollapsibleTrigger className="flex items-center gap-2 font-medium text-primary"><BookOpen className="size-4" />{count} مصادر<ChevronDown className="size-4" /></CollapsibleTrigger> }
export function SourcesContent({ className, ...props }: React.ComponentProps<typeof CollapsibleContent>) { return <CollapsibleContent className={cn("mt-2 space-y-2", className)} {...props} /> }
export function Source({ href, title }: { href: string; title: string }) { return <a className="block min-w-0 truncate text-primary hover:underline" href={href} rel="noreferrer" target="_blank">{title}</a> }
