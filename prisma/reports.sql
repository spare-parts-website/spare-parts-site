-- Run once in the same Supabase project as the website.
-- Safe to run after Prisma has generated the Report model.
create table if not exists public."Report" (
  "id" text primary key,
  "reporterId" text not null references public."User"("id") on delete cascade,
  "targetType" text not null,
  "targetId" text not null,
  "reason" text not null,
  "details" text,
  "status" text not null default 'OPEN',
  "reviewedById" text references public."User"("id") on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create unique index if not exists "Report_reporterId_targetType_targetId_status_key"
  on public."Report" ("reporterId", "targetType", "targetId", "status");
create index if not exists "Report_status_createdAt_idx" on public."Report" ("status", "createdAt");
create index if not exists "Report_targetType_targetId_idx" on public."Report" ("targetType", "targetId");
