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

export async function findTypoTolerantPartIds(value: string, limit = 200) {
  const queries = buildMarketplaceSearchQueries(value)
  if (!queries.some((query) => query.length >= 3)) return []

  try {
    const matches = await db.$queryRaw<RankedId[]>(Prisma.sql`
      with search_queries(query) as (values ${Prisma.join(queries.map((query) => Prisma.sql`(${query})`))})
      select matched."id", max(matched.score)::float8 as score
      from search_queries search_query
      cross join lateral (
        select p."id", extensions.word_similarity(search_query.query, ${partDocument}) as score
          from public."Part" p
          where p."blocked" = false
            and ${partDocument} operator(extensions.%>) search_query.query
            and extensions.word_similarity(search_query.query, ${partDocument}) >= 0.64
        union all
        select p."id", extensions.word_similarity(search_query.query, ${fitmentDocument}) as score
          from public."VehicleCompatibility" compatibility
          join public."Part" p on p."id" = compatibility."partId" and p."blocked" = false
          where ${fitmentDocument} operator(extensions.%>) search_query.query
            and extensions.word_similarity(search_query.query, ${fitmentDocument}) >= 0.64
        union all
        select p."id", extensions.word_similarity(search_query.query, ${storeDocument}) as score
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
  } catch {
    return []
  }
}

export async function findTypoTolerantStoreIds(value: string, limit = 50) {
  const queries = buildMarketplaceSearchQueries(value)
  if (!queries.some((query) => query.length >= 3)) return []

  try {
    const matches = await db.$queryRaw<RankedId[]>(Prisma.sql`
      with search_queries(query) as (values ${Prisma.join(queries.map((query) => Prisma.sql`(${query})`))})
      select store_record."id", max(extensions.word_similarity(search_query.query, ${storeDocument}))::float8 as score
      from search_queries search_query
      cross join public."Store" store_record
      where ${storeDocument} operator(extensions.%>) search_query.query
        and extensions.word_similarity(search_query.query, ${storeDocument}) >= 0.64
      group by store_record."id"
      order by score desc
      limit ${Math.min(Math.max(limit, 1), 200)}
    `)
    return matches.map(({ id }) => id)
  } catch {
    return []
  }
}
