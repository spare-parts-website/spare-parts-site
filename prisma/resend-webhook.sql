-- Additive delivery lifecycle metadata for verified Resend webhooks.
alter table public."EmailDeliveryAttempt" add column if not exists "lastEventId" text;
alter table public."EmailDeliveryAttempt" add column if not exists "lastEventAt" timestamp(3);
create index if not exists "EmailDeliveryAttempt_providerId_idx" on public."EmailDeliveryAttempt"("providerId");
