-- Run this once in Supabase SQL Editor before deploying the product-chat update.
create table if not exists "ProductMessage" (
  "id" text primary key,
  "partId" text not null references "Part"("id") on delete cascade,
  "senderId" text not null references "User"("id"),
  "receiverId" text not null references "User"("id"),
  "message" text not null,
  "read" boolean not null default false,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP
);

create index if not exists "ProductMessage_partId_idx" on "ProductMessage" ("partId");
create index if not exists "ProductMessage_senderId_receiverId_idx" on "ProductMessage" ("senderId", "receiverId");
