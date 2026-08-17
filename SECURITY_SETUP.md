# Production security setup

## Required Vercel environment variables

Create these as **Production** environment variables in Vercel. Generate each secret with a password manager or `openssl rand -base64 48`; never store a value in Git.

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs user sessions. Changing it signs every user out. |
| `INTERNAL_NOTIFY_SECRET` | Authorizes `POST /api/notify` through the `x-internal-notify-secret` header. |
| `HEALTHCHECK_SECRET` | Authorizes `GET /api/health` through `Authorization: Bearer <secret>`. |
| `DATABASE_URL` | Application connection string for PostgreSQL/Supabase. |
| `DIRECT_URL` | Direct PostgreSQL/Supabase connection string used by Prisma. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used for uploads and storage operations. |
| `RESEND_API_KEY` | Server-only key used to send email. |

Do not use the `NEXT_PUBLIC_` prefix for any of these variables.

## Rotation procedure

1. Generate new `AUTH_SECRET`, `INTERNAL_NOTIFY_SECRET`, and `HEALTHCHECK_SECRET` values.
2. In Supabase, rotate the database password and service-role key. Update `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel with the replacement values.
3. In Resend, revoke the old API key, create a new one, and update `RESEND_API_KEY` in Vercel.
4. Update all internal callers of `/api/notify` to send the new `x-internal-notify-secret` value.
5. Update private monitoring to send `Authorization: Bearer <HEALTHCHECK_SECRET>` to `/api/health`.
6. Redeploy after every value is present. Existing sessions will end after `AUTH_SECRET` is changed.

## Database access

The app uses server-side Prisma and its own signed session cookie, not Supabase Auth. RLS is enabled on public tables to block direct access through Supabase's Data API. Do not add public RLS policies unless the application is intentionally changed to use Supabase Auth.
