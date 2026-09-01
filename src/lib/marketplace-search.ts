import 'server-only'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { buildMarketplaceSearchQueries } from '@/lib/search-normalization'

type RankedId = { id: string; score: number }

const partDocument = Prisma.sql`(
  coalesce(p."name", '') || ' ' || coalesce(p."description", '') || ' ' || coalesce(p."brand", '') || ' ' ||
  coalesce(p."partNumber", '') || ' ' || coalesce(p."oemNumber", '') || ' ' || coalesce(p."searchAliases", '')
)`

const fitmentDocument = Prisma.sql`(
  coalesce(compatibility."make", '') || ' ' || coalesce(compatibility."model", '') || ' ' || coalesce(compatibility."generation", '') || ' ' ||
  coalesce(compatibility."engine", '') || ' ' || coalesce(compatibility."trim", '')
)`

const storeDocument = Prisma.sql`(coalesce(store_record."name", '') || ' ' || coalesce(store_record."description", ''))`

const CANONICAL_BRANDS = ['bmw', 'mercedes', 'toyota', 'hyundai', 'nissan', 'kia', 'honda', 'ford', 'volkswagen', 'audi', 'volvo', 'renault', 'peugeot', 'mitsubishi', 'skoda'] as const

// Keep identifier/OEM matches ahead of descriptive text. The fuzzy query is
// still gated by the trigram index below, while these weights make the
// returned IDs deterministic when several fields match the same typo.
const partRankScore = Prisma.sql`greatest(
  case when lower(coalesce(p."oemNumber", '')) = lower(search_query.query) then 1.00 else 0 end,
  case when lower(coalesce(p."partNumber", '')) = lower(search_query.query) then 0.98 else 0 end,
  case when lower(coalesce(p."name", '')) = lower(search_query.query) then 0.96 else 0 end,
  case when lower(coalesce(p."brand", '')) = lower(search_query.query) then 0.94 else 0 end,
  extensions.word_similarity(search_query.query, coalesce(p."oemNumber", '')) * 0.92,
  extensions.word_similarity(search_query.query, coalesce(p."partNumber", '')) * 0.90,
  extensions.word_similarity(search_query.query, coalesce(p."name", '')) * 0.84,
  extensions.word_similarity(search_query.query, coalesce(p."brand", '')) * 0.82,
  extensions.word_similarity(search_query.query, coalesce(p."searchAliases", '')) * 0.76,
  extensions.word_similarity(search_query.query, coalesce(p."description", '')) * 0.50,
  extensions.word_similarity(search_query.query, ${partDocument}) * 0.70
)`

const fitmentRankScore = Prisma.sql`greatest(
  extensions.word_similarity(search_query.query, coalesce(compatibility."make", '')) * 0.82,
  extensions.word_similarity(search_query.query, coalesce(compatibility."model", '')) * 0.82,
  extensions.word_similarity(search_query.query, ${fitmentDocument}) * 0.70
)`

const storeRankScore = Prisma.sql`greatest(
  case when lower(coalesce(store_record."name", '')) = lower(search_query.query) then 0.94 else 0 end,
  extensions.word_similarity(search_query.query, coalesce(store_record."name", '')) * 0.82,
  extensions.word_similarity(search_query.query, coalesce(store_record."description", '')) * 0.50,
  extensions.word_similarity(search_query.query, ${storeDocument}) * 0.70
)`

export async function findTypoTolerantPartIds(value: string, limit = 200) {
  const queries = buildMarketplaceSearchQueries(value)
  if (!queries.some((query) => query.length >= 3)) return []

  try {
    const matches = await db.$queryRaw<RankedId[]>(Prisma.sql`
      with search_queries(query) as (values ${Prisma.join(queries.map((query) => Prisma.sql`(${query})`))})
      select matched."id", max(matched.score)::float8 as score
      from search_queries search_query
      cross join lateral (
        select p."id", ${partRankScore} as score
          from public."Part" p
          where p."blocked" = false
            and ${partDocument} operator(extensions.%>) search_query.query
            and extensions.word_similarity(search_query.query, ${partDocument}) >= 0.64
        union all
        select p."id", ${fitmentRankScore} as score
          from public."VehicleCompatibility" compatibility
          join public."Part" p on p."id" = compatibility."partId" and p."blocked" = false
          where ${fitmentDocument} operator(extensions.%>) search_query.query
            and extensions.word_similarity(search_query.query, ${fitmentDocument}) >= 0.64
        union all
        select p."id", ${storeRankScore} as score
          from public."Store" store_record
          join public."Part" p on p."storeId" = store_record."id" and p."blocked" = false
          where ${storeDocument} operator(extensions.%>) search_query.query
            and extensions.word_similarity(search_query.query, ${storeDocument}) >= 0.64
      ) matched
      group by matched."id"
      order by score desc
      limit ${Math.min(Math.max(limit, 1), 500)}
    `)
    return matches.map(({ id }) => id)
  } catch (error) {
    console.error('Marketplace fuzzy part search failed', {
      error: error instanceof Error ? error.name : 'UnknownError',
      queryLength: value.trim().length,
    })
    return []
  }
}

/**
 * Return a brand only when the normalized query has one unambiguous automotive
 * brand intent. Callers use this as a precision guard around typo expansion so
 * a short typo such as `bww` cannot pull an unrelated Mercedes-only listing
 * into the first page just because a trigram happened to match.
 */
export function detectMarketplaceBrandHint(value: string) {
  const queries = buildMarketplaceSearchQueries(value)
  const matches = new Set<string>()
  for (const query of queries) {
    const tokens = query.split(' ')
    for (const brand of CANONICAL_BRANDS) {
      if (tokens.includes(brand)) matches.add(brand)
    }
  }
  return matches.size === 1 ? Array.from(matches)[0] : null
}

export async function findTypoTolerantStoreIds(value: string, limit = 50) {
  const queries = buildMarketplaceSearchQueries(value)
  if (!queries.some((query) => query.length >= 3)) return []

  try {
    const matches = await db.$queryRaw<RankedId[]>(Prisma.sql`
      with search_queries(query) as (values ${Prisma.join(queries.map((query) => Prisma.sql`(${query})`))})
      select store_record."id", max(${storeRankScore})::float8 as score
      from search_queries search_query
      cross join public."Store" store_record
      where ${storeDocument} operator(extensions.%>) search_query.query
        and extensions.word_similarity(search_query.query, ${storeDocument}) >= 0.64
      group by store_record."id"
      order by score desc
      limit ${Math.min(Math.max(limit, 1), 200)}
    `)
    return matches.map(({ id }) => id)
  } catch (error) {
    console.error('Marketplace fuzzy store search failed', {
      error: error instanceof Error ? error.name : 'UnknownError',
      queryLength: value.trim().length,
    })
    return []
  }
}
