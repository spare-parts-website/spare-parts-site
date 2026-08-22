-- Additive Ghyar Market AI assistant persistence.
-- Guest conversations are intentionally browser-only and never enter these tables.

create table if not exists public."AIConversation" (
  "id" text primary key,
  "userId" text not null references public."User"("id") on delete cascade,
  "role" text not null,
  "title" text,
  "expiresAt" timestamp(3) not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create table if not exists public."AIMessage" (
  "id" text primary key,
  "conversationId" text not null references public."AIConversation"("id") on delete cascade,
  "role" text not null,
  "content" text not null,
  "metadata" text,
  "createdAt" timestamp(3) not null default current_timestamp
);

create table if not exists public."AIActionProposal" (
  "id" text primary key,
  "conversationId" text not null references public."AIConversation"("id") on delete cascade,
  "userId" text not null references public."User"("id") on delete cascade,
  "role" text not null,
  "action" text not null,
  "payload" text not null,
  "summary" text not null,
  "status" text not null default 'PENDING',
  "idempotencyKey" text not null unique,
  "expiresAt" timestamp(3) not null,
  "executedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp
);

create table if not exists public."AIRequestLease" (
  "id" text primary key,
  "key" text not null,
  "token" text not null unique,
  "role" text not null,
  "expiresAt" timestamp(3) not null,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "AIConversation_userId_expiresAt_idx" on public."AIConversation"("userId", "expiresAt");
create index if not exists "AIConversation_expiresAt_idx" on public."AIConversation"("expiresAt");
create index if not exists "AIMessage_conversationId_createdAt_idx" on public."AIMessage"("conversationId", "createdAt");
create index if not exists "AIActionProposal_userId_status_expiresAt_idx" on public."AIActionProposal"("userId", "status", "expiresAt");
create index if not exists "AIActionProposal_conversationId_createdAt_idx" on public."AIActionProposal"("conversationId", "createdAt");
create index if not exists "AIActionProposal_expiresAt_idx" on public."AIActionProposal"("expiresAt");
create index if not exists "AIRequestLease_key_expiresAt_idx" on public."AIRequestLease"("key", "expiresAt");
create index if not exists "AIRequestLease_expiresAt_idx" on public."AIRequestLease"("expiresAt");

alter table public."AIConversation" enable row level security;
alter table public."AIMessage" enable row level security;
alter table public."AIActionProposal" enable row level security;
alter table public."AIRequestLease" enable row level security;

revoke all on table public."AIConversation" from anon, authenticated;
revoke all on table public."AIMessage" from anon, authenticated;
revoke all on table public."AIActionProposal" from anon, authenticated;
revoke all on table public."AIRequestLease" from anon, authenticated;
