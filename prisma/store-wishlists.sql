-- Run this once in Supabase SQL Editor before deploying store favorites.
create table if not exists public."StoreWishlist" (
  "id" text primary key,
  "userId" text not null references public."User"("id") on delete cascade,
  "storeId" text not null references public."Store"("id") on delete cascade,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP,
  constraint "StoreWishlist_userId_storeId_key" unique ("userId", "storeId")
);

create index if not exists "StoreWishlist_storeId_idx" on public."StoreWishlist" ("storeId");

alter table public."StoreWishlist" enable row level security;
