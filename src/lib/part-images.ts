import { db } from '@/lib/db'

let tableReady: Promise<void> | null = null

export function ensurePartImagesTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public."PartImage" (
          "id" TEXT PRIMARY KEY,
          "partId" TEXT NOT NULL REFERENCES public."Part"("id") ON DELETE CASCADE,
          "url" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PartImage_partId_idx"
        ON public."PartImage" ("partId")
      `)
    })().catch((error) => {
      tableReady = null
      throw error
    })
  }
  return tableReady
}
