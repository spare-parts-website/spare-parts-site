-- Supabase advisor hardening: pin the trigger function search path if the
-- append-only guard exists in this database baseline.
DO $$
BEGIN
  IF to_regprocedure('public.prevent_append_only_mutation()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.prevent_append_only_mutation() SET search_path = pg_catalog, public';
  END IF;
END
$$;
