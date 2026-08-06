-- Run once in the same Supabase project as the website. Safe to rerun.
alter table "Order" add column if not exists "clientOrderId" text;
create unique index if not exists "Order_clientOrderId_key" on "Order" ("clientOrderId") where "clientOrderId" is not null;
create index if not exists "Order_buyerId_createdAt_idx" on "Order" ("buyerId", "createdAt");
create index if not exists "Order_storeId_createdAt_idx" on "Order" ("storeId", "createdAt");
create index if not exists "ChatMessage_senderId_receiverId_idx" on "ChatMessage" ("senderId", "receiverId");
create index if not exists "ChatMessage_receiverId_read_idx" on "ChatMessage" ("receiverId", "read");
create index if not exists "ProductMessage_receiverId_read_idx" on "ProductMessage" ("receiverId", "read");
