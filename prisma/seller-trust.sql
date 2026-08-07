-- Run once in the same Supabase project as the website.
alter table public."Store" add column if not exists "verified" boolean not null default false;

-- Profile photo shown on shop advertisements.
alter table public."User" add column if not exists "avatar" text;
