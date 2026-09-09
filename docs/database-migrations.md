# Database migration procedure

`supabase/migrations/` is the authoritative forward-migration directory from the 2026-09 production-hardening baseline onward. Never use `prisma db push --accept-data-loss` against production.

CI creates the Prisma baseline as SQL with `prisma migrate diff`, applies it to blank PostgreSQL, then replays tracked forward migrations in lexical order. Production changes are applied with the Supabase migration API after checking the live schema and migration history. Every DDL change should be additive/idempotent where practical, use explicit constraints/indexes, preserve the deny-by-default Data API posture, and be tested before application.

Before production: inspect live columns/constraints/indexes, verify backups, apply only missing/reconciliation DDL, run smoke tests, and record the migration in Supabase history.
