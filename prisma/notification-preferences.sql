-- Run once in the same Supabase project as the website. Safe to rerun.
alter table "User" add column if not exists "emailNotifications" boolean not null default false;
