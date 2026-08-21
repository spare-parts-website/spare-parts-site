-- Additive recovery schema for secure password reset and session invalidation.
-- Safe to run more than once. Existing marketplace data is not modified.

alter table public."User"
  add column if not exists "sessionVersion" integer not null default 0;

create table if not exists public."PasswordReset" (
  "id" text primary key,
  "userId" text not null,
  "codeHash" text not null,
  "attempts" integer not null default 0,
  "expiresAt" timestamp(3) not null,
  "usedAt" timestamp(3),
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP
);

create index if not exists "PasswordReset_userId_createdAt_idx" on public."PasswordReset" ("userId", "createdAt");
create index if not exists "PasswordReset_expiresAt_idx" on public."PasswordReset" ("expiresAt");
create index if not exists "PasswordReset_userId_usedAt_expiresAt_idx" on public."PasswordReset" ("userId", "usedAt", "expiresAt");

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'PasswordReset_userId_fkey'
      and conrelid = 'public."PasswordReset"'::regclass
  ) then
    alter table public."PasswordReset"
      add constraint "PasswordReset_userId_fkey"
      foreign key ("userId") references public."User"("id") on delete cascade;
  end if;
end $$;

alter table public."PasswordReset" enable row level security;
