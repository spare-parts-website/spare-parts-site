-- Run once in the same Supabase project as the website.
-- This removes only the old email-notification preference, not user email addresses.
alter table "User" drop column if exists "emailNotifications";
