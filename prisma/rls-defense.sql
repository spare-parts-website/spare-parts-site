-- RLS defense layer for the marketplace.
--
-- The website authenticates users with its own signed session cookie and uses
-- Prisma server-side. It does not use Supabase Auth, so policies based on
-- auth.uid() would not know which marketplace user is logged in.
--
-- Enabling RLS with no public policies blocks direct access through Supabase's
-- anon/authenticated REST and GraphQL APIs. Prisma continues to work through
-- the server-side database connection. Do not add a public policy that exposes
-- these tables unless the application is migrated to Supabase Auth.

alter table if exists public."User" enable row level security;
alter table if exists public."Store" enable row level security;
alter table if exists public."Part" enable row level security;
alter table if exists public."PartImage" enable row level security;
alter table if exists public."Order" enable row level security;
alter table if exists public."OrderTimeline" enable row level security;
alter table if exists public."ProductReview" enable row level security;
alter table if exists public."StoreReview" enable row level security;
alter table if exists public."Notification" enable row level security;
alter table if exists public."Wishlist" enable row level security;
alter table if exists public."UserCar" enable row level security;
alter table if exists public."Coupon" enable row level security;
alter table if exists public."ChatMessage" enable row level security;
alter table if exists public."ProductMessage" enable row level security;
alter table if exists public."Report" enable row level security;
alter table if exists public."LoginVerification" enable row level security;

-- Storage is intentionally public-read because product and chat images are
-- displayed on the marketplace. Uploads are performed only by the server with
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses storage RLS.
-- Do not expose the service-role key in browser code.
