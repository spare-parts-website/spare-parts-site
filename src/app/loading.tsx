export default function Loading() {
  return (
    <main className="content-container grid min-h-[55vh] place-items-center py-16" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-xl space-y-4 text-center">
        <div className="mx-auto size-12 animate-pulse rounded-2xl bg-primary/15" />
        <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-muted" />
        <div className="mx-auto h-3 w-64 animate-pulse rounded-full bg-muted/70" />
        <p className="text-sm text-muted-foreground">جاري تحميل الصفحة...</p>
      </div>
    </main>
  )
}
