-- Email deliverability hardening. Apply with the Supabase migration tool before
-- deploying code that reads these additive columns.

alter table if exists public."User"
  add column if not exists "emailDeliveryStatus" text not null default 'ACTIVE';
alter table if exists public."User"
  add column if not exists "emailDeliveryReason" text;
alter table if exists public."User"
  add column if not exists "emailDeliveryAt" timestamp(3);

create index if not exists "User_emailDeliveryStatus_idx"
  on public."User" ("emailDeliveryStatus");

alter table if exists public."Notification"
  add column if not exists "dedupeKey" text;
create unique index if not exists "Notification_dedupeKey_key"
  on public."Notification" ("dedupeKey");

alter table if exists public."EmailDeliveryAttempt"
  add column if not exists "recipientEmail" text;
