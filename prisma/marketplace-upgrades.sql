alter table public."UserCar" add column if not exists "engine" text;
alter table public."UserCar" add column if not exists "isPrimary" boolean not null default false;
alter table public."Part" add column if not exists "partNumber" text;
alter table public."Part" add column if not exists "oemNumber" text;
alter table public."Part" add column if not exists "searchAliases" text;
alter table public."Order" add column if not exists "governorate" text;
alter table public."Order" add column if not exists "shippingFee" double precision not null default 0;
alter table public."Order" add column if not exists "estimatedDeliveryAt" timestamp(3);
alter table public."Order" add column if not exists "trackingNumber" text;
alter table public."Store" add column if not exists "verificationStatus" text not null default 'UNVERIFIED';
alter table public."Store" add column if not exists "verifiedAt" timestamp(3);
alter table public."ProductReview" add column if not exists "sellerRating" integer;
alter table public."ProductReview" add column if not exists "packagingRating" integer;
alter table public."ProductReview" add column if not exists "deliveryRating" integer;
alter table public."ProductReview" add column if not exists "orderId" text;

create table if not exists public."SellerVerification" (
  "id" text primary key,
  "storeId" text not null unique references public."Store"("id") on delete cascade,
  "documentUrls" text not null,
  "businessName" text,
  "status" text not null default 'PENDING',
  "adminNote" text,
  "submittedAt" timestamp(3) not null default current_timestamp,
  "reviewedAt" timestamp(3)
);
create table if not exists public."Dispute" (
  "id" text primary key,
  "orderId" text not null references public."Order"("id") on delete cascade,
  "buyerId" text not null references public."User"("id") on delete cascade,
  "storeId" text not null references public."Store"("id") on delete cascade,
  "type" text not null,
  "reason" text not null,
  "evidenceUrls" text,
  "status" text not null default 'OPEN',
  "resolution" text,
  "reviewedById" text references public."User"("id") on delete set null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);
create table if not exists public."AuditLog" (
  "id" text primary key,
  "actorId" text references public."User"("id") on delete set null,
  "action" text not null,
  "targetType" text not null,
  "targetId" text,
  "metadata" text,
  "createdAt" timestamp(3) not null default current_timestamp
);
create index if not exists "Part_partNumber_idx" on public."Part"("partNumber");
create index if not exists "Part_oemNumber_idx" on public."Part"("oemNumber");
create index if not exists "Dispute_status_createdAt_idx" on public."Dispute"("status", "createdAt");
create index if not exists "Dispute_orderId_idx" on public."Dispute"("orderId");
create index if not exists "Dispute_buyerId_idx" on public."Dispute"("buyerId");
create index if not exists "Dispute_storeId_idx" on public."Dispute"("storeId");
create index if not exists "Dispute_reviewedById_idx" on public."Dispute"("reviewedById");
create unique index if not exists "Dispute_orderId_buyerId_status_key" on public."Dispute"("orderId", "buyerId", "status");
create index if not exists "AuditLog_createdAt_idx" on public."AuditLog"("createdAt");
create index if not exists "AuditLog_actorId_createdAt_idx" on public."AuditLog"("actorId", "createdAt");

alter table public."SellerVerification" enable row level security;
alter table public."Dispute" enable row level security;
alter table public."AuditLog" enable row level security;

-- Private evidence/business-document bucket. Files are served only through
-- the authenticated /api/private-image proxy using the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protected-uploads', 'protected-uploads', false, 1048576, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/webp'];

-- Typo-tolerant marketplace search support.
create extension if not exists pg_trgm with schema extensions;
create index if not exists "Part_search_trgm_idx" on public."Part" using gin
  ((coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("partNumber", '') || ' ' || coalesce("oemNumber", '') || ' ' || coalesce("searchAliases", '')) extensions.gin_trgm_ops);
