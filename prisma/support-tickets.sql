-- Additive support inbox schema. RLS is enabled without browser policies;
-- server routes use the authenticated Prisma/service-role boundary.
create table if not exists public."SupportTicket" (
  "id" text primary key,
  "userId" text not null references public."User"("id") on delete cascade,
  "orderId" text references public."Order"("id") on delete set null,
  "category" text not null default 'GENERAL',
  "subject" text not null,
  "status" text not null default 'OPEN',
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create table if not exists public."SupportMessage" (
  "id" text primary key,
  "ticketId" text not null references public."SupportTicket"("id") on delete cascade,
  "authorId" text references public."User"("id") on delete set null,
  "authorRole" text not null,
  "body" text not null,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "SupportTicket_userId_updatedAt_idx" on public."SupportTicket"("userId", "updatedAt");
create index if not exists "SupportTicket_status_updatedAt_idx" on public."SupportTicket"("status", "updatedAt");
create index if not exists "SupportTicket_orderId_idx" on public."SupportTicket"("orderId");
create index if not exists "SupportMessage_ticketId_createdAt_idx" on public."SupportMessage"("ticketId", "createdAt");
create index if not exists "SupportMessage_authorId_createdAt_idx" on public."SupportMessage"("authorId", "createdAt");

alter table public."SupportTicket" enable row level security;
alter table public."SupportMessage" enable row level security;
revoke all on table public."SupportTicket" from anon, authenticated;
revoke all on table public."SupportMessage" from anon, authenticated;
