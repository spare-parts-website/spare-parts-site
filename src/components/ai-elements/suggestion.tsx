"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function Suggestions({ className, children }: React.HTMLAttributes<HTMLDivElement>) { return <ScrollArea className="w-full whitespace-nowrap"><div className={cn("flex w-max gap-2", className)}>{children}</div><ScrollBar orientation="horizontal" className="hidden" /></ScrollArea> }
export function Suggestion({ suggestion, onClick }: { suggestion: string; onClick: (value: string) => void }) { return <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onClick(suggestion)}>{suggestion}</Button> }
