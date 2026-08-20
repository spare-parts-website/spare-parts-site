-- Backward-compatible foundation for the Ghyar Market remake.
-- Apply only after taking a production backup and before deploying code that uses these tables.

create table if not exists public."VehicleCompatibility" (
  "id" text primary key,
  "partId" text not null references public."Part"("id") on delete cascade,
  "make" text not null,
  "model" text not null,
  "yearFrom" integer,
  "yearTo" integer,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP
);

create index if not exists "VehicleCompatibility_make_model_yearFrom_yearTo_idx"
  on public."VehicleCompatibility" ("make", "model", "yearFrom", "yearTo");
create index if not exists "VehicleCompatibility_partId_idx"
  on public."VehicleCompatibility" ("partId");

create table if not exists public."RateLimitBucket" (
  "key" text primary key,
  "count" integer not null default 1,
  "resetAt" timestamp(3) not null,
  "updatedAt" timestamp(3) not null default CURRENT_TIMESTAMP
);

create index if not exists "RateLimitBucket_resetAt_idx"
  on public."RateLimitBucket" ("resetAt");

create table if not exists public."EmailDeliveryAttempt" (
  "id" text primary key,
  "notificationId" text not null unique references public."Notification"("id") on delete cascade,
  "providerId" text,
  "status" text not null,
  "error" text,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) not null default CURRENT_TIMESTAMP
);

create index if not exists "EmailDeliveryAttempt_status_createdAt_idx"
  on public."EmailDeliveryAttempt" ("status", "createdAt");

-- Relationship and dashboard indexes used by the current query paths.
create index if not exists "Part_storeId_createdAt_idx" on public."Part" ("storeId", "createdAt");
create index if not exists "Part_blocked_createdAt_idx" on public."Part" ("blocked", "createdAt");
create index if not exists "Part_category_idx" on public."Part" ("category");
create index if not exists "Part_brand_idx" on public."Part" ("brand");
create index if not exists "Part_condition_idx" on public."Part" ("condition");
create index if not exists "OrderTimeline_orderId_createdAt_idx" on public."OrderTimeline" ("orderId", "createdAt");
create index if not exists "ProductReview_partId_createdAt_idx" on public."ProductReview" ("partId", "createdAt");
create index if not exists "ProductReview_userId_idx" on public."ProductReview" ("userId");
create index if not exists "StoreReview_storeId_createdAt_idx" on public."StoreReview" ("storeId", "createdAt");
create index if not exists "StoreReview_userId_idx" on public."StoreReview" ("userId");
create index if not exists "Notification_userId_read_createdAt_idx" on public."Notification" ("userId", "read", "createdAt");
create index if not exists "UserCar_userId_createdAt_idx" on public."UserCar" ("userId", "createdAt");
create index if not exists "Coupon_storeId_active_idx" on public."Coupon" ("storeId", "active");
create index if not exists "ChatMessage_orderId_createdAt_idx" on public."ChatMessage" ("orderId", "createdAt");

alter table public."VehicleCompatibility" enable row level security;
alter table public."RateLimitBucket" enable row level security;
alter table public."EmailDeliveryAttempt" enable row level security;

-- Migrate simple legacy values. Complex free-form values remain available in Part.carModels.
insert into public."VehicleCompatibility" ("id", "partId", "make", "model", "yearFrom", "yearTo")
select
  'legacy_' || md5(p."id" || ':' || trim(entry.value)),
  p."id",
  split_part(trim(entry.value), ' ', 1),
  nullif(trim(substr(trim(entry.value), length(split_part(trim(entry.value), ' ', 1)) + 1)), ''),
  null,
  null
from public."Part" p
cross join lateral regexp_split_to_table(coalesce(trim(both '[]"' from p."carModels"), ''), '\s*,\s*|\s*\n\s*') as entry(value)
where trim(entry.value) <> ''
  and position(' ' in trim(entry.value)) > 0
on conflict ("id") do nothing;
