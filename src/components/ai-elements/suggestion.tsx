"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Suggestions({ className, children }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex w-full min-w-0 flex-wrap justify-center gap-2 px-1", className)}>{children}</div> }
export function Suggestion({ suggestion, onClick }: { suggestion: string; onClick: (value: string) => void }) { return <Button type="button" variant="outline" size="sm" className="h-auto max-w-full whitespace-normal rounded-full py-2 text-center leading-5" onClick={() => onClick(suggestion)}>{suggestion}</Button> }
