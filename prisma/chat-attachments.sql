-- Run this once in the same Supabase project as the website.
-- Safe to run more than once.
alter table "ChatMessage" add column if not exists "imageUrl" text;
alter table "ProductMessage" add column if not exists "imageUrl" text;
