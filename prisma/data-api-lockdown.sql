-- Defense-in-depth for Ghyar Market's server-only database architecture.
--
-- The application authenticates with its own signed session cookie and accesses
-- Postgres through Prisma on the server. It does not use Supabase Auth/Data API
-- for marketplace table access. Therefore anon/authenticated do not need table
-- or sequence privileges. RLS remains enabled as a second independent barrier.
--
-- This intentionally does not revoke privileges from the server database role,
-- postgres, service_role, or Storage. Product uploads continue to use the
-- existing server-only Storage integration.

DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation.tablename);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', relation.tablename);
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future application tables closed by default when they are created by
-- the migration owner. Explicit grants can be added later only if the app is
-- deliberately migrated to Supabase Auth/Data API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
