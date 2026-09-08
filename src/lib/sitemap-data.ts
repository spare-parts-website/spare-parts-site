import 'server-only'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export const SITEMAP_BATCH_SIZE = 1000
type Boundary = { kind: 'parts' | 'stores'; start: string; end: string | null }

// PostgreSQL emits one boundary per 1000 entries; application memory never
// materializes every product/store. Lexical boundaries survive deleted rows.
export const sitemapBoundaries = unstable_cache(async () => {
  const rows = await db.$queryRaw<Boundary[]>`
    WITH visible AS (
      SELECT 'parts' AS kind, p.id FROM public."Part" p
      JOIN public."Store" s ON s.id=p."storeId"
      WHERE p."moderationStatus"='ACTIVE' AND s."moderationStatus"='ACTIVE'
      UNION ALL
      SELECT 'stores' AS kind, s.id FROM public."Store" s
      WHERE s."moderationStatus"='ACTIVE' AND EXISTS (
        SELECT 1 FROM public."Part" p WHERE p."storeId"=s.id AND p."moderationStatus"='ACTIVE'
      )
    ), numbered AS (
      SELECT kind,id,ROW_NUMBER() OVER (PARTITION BY kind ORDER BY id) AS n FROM visible
    ), boundaries AS (
      SELECT kind,id FROM numbered WHERE (n-1) % ${SITEMAP_BATCH_SIZE}=0
    )
    SELECT kind,id AS start,LEAD(id) OVER (PARTITION BY kind ORDER BY id) AS "end"
    FROM boundaries ORDER BY kind,id LIMIT 50000
  `
  // An index may contain at most 50,000 entries, including the static sitemap.
  if (rows.length >= 50_000) throw new Error('SITEMAP_INDEX_CAPACITY')
  return rows
}, ['sitemap-boundaries-v1'], { revalidate: 3600 })
