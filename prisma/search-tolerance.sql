-- Additive typo-tolerant search indexes for marketplace entities.
-- Existing product, store, and compatibility data is preserved.

create extension if not exists pg_trgm with schema extensions;

create index if not exists "Part_search_trgm_idx" on public."Part" using gin
  ((coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("brand", '') || ' ' ||
    coalesce("partNumber", '') || ' ' || coalesce("oemNumber", '') || ' ' || coalesce("searchAliases", '')) extensions.gin_trgm_ops);

create index if not exists "VehicleCompatibility_search_trgm_idx" on public."VehicleCompatibility" using gin
  ((coalesce("make", '') || ' ' || coalesce("model", '') || ' ' || coalesce("generation", '') || ' ' ||
    coalesce("engine", '') || ' ' || coalesce("trim", '')) extensions.gin_trgm_ops);

create index if not exists "Store_search_trgm_idx" on public."Store" using gin
  ((coalesce("name", '') || ' ' || coalesce("description", '')) extensions.gin_trgm_ops);
