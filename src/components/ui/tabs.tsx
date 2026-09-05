"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { pushDashboardTab, type DashboardArea } from "@/lib/instant-dashboard-navigation"

const DASHBOARD_TABS: Record<DashboardArea, ReadonlySet<string>> = {
  seller: new Set(["parts", "orders", "analytics", "coupons", "messages", "store"]),
  admin: new Set(["users", "stores", "parts", "orders", "reviews", "reports", "support"]),
}

function currentDashboardArea(value: string): DashboardArea | null {
  if (typeof window === "undefined") return null
  const pathname = window.location.pathname
  if ((pathname === "/seller" || pathname.startsWith("/seller/")) && DASHBOARD_TABS.seller.has(value)) return "seller"
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && DASHBOARD_TABS.admin.has(value)) return "admin"
  return null
}

function Tabs({
  className,
  onValueChange,
  value: controlledValue,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  // The URL remains the source of truth for reloads and Back/Forward, but a
  // dashboard click must not wait for Next/usePathname to propagate that URL.
  // This temporary value lets Radix switch the active trigger + panel in the
  // same event before we touch the History API.
  const [dashboardValue, setDashboardValue] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (dashboardValue !== null && controlledValue === dashboardValue) {
      setDashboardValue(null)
    }
  }, [controlledValue, dashboardValue])

  const handleValueChange = React.useCallback((nextValue: string) => {
    const dashboardArea = currentDashboardArea(nextValue)
    if (dashboardArea) {
      // React normally batches state until the event handler exits. Commit the
      // visible tab first so Next's patched pushState can never delay feedback.
      flushSync(() => setDashboardValue(nextValue))
      pushDashboardTab(dashboardArea, nextValue)
      return
    }
    onValueChange?.(nextValue)
  }, [onValueChange])

  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      value={dashboardValue ?? controlledValue}
      onValueChange={handleValueChange}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-none focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
