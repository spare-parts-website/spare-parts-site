-- Login email verification challenges are server-only records.
-- Prisma connects with the private database role; browser-facing Supabase roles
-- receive no policies and therefore cannot read or modify verification codes.
create table if not exists public."LoginVerification" (
  "id" text primary key,
  "userId" text not null references public."User"("id") on delete cascade,
  "codeHash" text not null,
  "attempts" integer not null default 0,
  "expiresAt" timestamp(3) not null,
  "verifiedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "LoginVerification_userId_createdAt_idx"
  on public."LoginVerification" ("userId", "createdAt");

create index if not exists "LoginVerification_expiresAt_idx"
  on public."LoginVerification" ("expiresAt");

alter table public."LoginVerification" enable row level security;
revoke all on table public."LoginVerification" from anon, authenticated;
