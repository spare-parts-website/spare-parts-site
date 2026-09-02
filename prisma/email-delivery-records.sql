-- Track every transactional category (notifications, authentication, and
-- support) under one idempotent provider-delivery record.

alter table if exists public."EmailDeliveryAttempt"
  alter column "notificationId" drop not null;
alter table if exists public."EmailDeliveryAttempt"
  add column if not exists "recipientUserId" text;
alter table if exists public."EmailDeliveryAttempt"
  add column if not exists "deliveryKey" text;
alter table if exists public."EmailDeliveryAttempt"
  add column if not exists "category" text not null default 'NOTIFICATION';

update public."EmailDeliveryAttempt"
set "deliveryKey" = 'notification/' || "notificationId"
where "deliveryKey" is null and "notificationId" is not null;

alter table public."EmailDeliveryAttempt"
  alter column "deliveryKey" set not null;

create unique index if not exists "EmailDeliveryAttempt_deliveryKey_key"
  on public."EmailDeliveryAttempt" ("deliveryKey");
create index if not exists "EmailDeliveryAttempt_recipientUserId_idx"
  on public."EmailDeliveryAttempt" ("recipientUserId");
create index if not exists "EmailDeliveryAttempt_category_createdAt_idx"
  on public."EmailDeliveryAttempt" ("category", "createdAt");

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'EmailDeliveryAttempt_recipientUserId_fkey'
  ) then
    alter table public."EmailDeliveryAttempt"
      add constraint "EmailDeliveryAttempt_recipientUserId_fkey"
      foreign key ("recipientUserId") references public."User"("id") on delete set null;
  end if;
end $$;
