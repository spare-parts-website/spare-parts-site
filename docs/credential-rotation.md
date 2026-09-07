# Credential rotation

Rotate Resend, AI provider, Supabase service-role and operational secrets on a planned cadence and immediately after suspected exposure. Keep browser-publishable values separate from server-only credentials.

`AUTH_SECRET` is a root key used only through purpose-derived keys. Rotating it invalidates session/challenge material and must be treated as a coordinated authentication migration. Rotate CRON/health secrets together with their callers. Verify production environment values after rotation and test the affected provider before closing the change.
