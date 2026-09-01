# Production readiness checkpoint

## Current phase

P0/P1 implementation checkpoint complete locally; final commit, CI, preview, production smoke, and Resend provider wiring remain.

## Completed

- Deterministic npm install/audit and preserved CI pipeline.
- Resource-based private image authorization plus uploader/purpose checks for new chat, evidence, and verification attachments.
- Positive-price/stock-safe atomic JSON and CSV inventory validation with preview and ownership checks.
- Admin offer editing now covers identifiers, taxonomy, price/stock, images, and structured fitment while seller entry omits internal OEM/search fields.
- Bounded automotive typo search and weighted ranking (`bww` resolves BMW when inventory exists).
- Static-only privacy-safe service worker and authenticated notification polling; no production Socket.IO connection.
- Removed the unsafe standalone notification Socket.IO mini-service; the root dependency remains only for the isolated websocket demo.
- Branded favicon and optimized hero/preset avatar assets; legacy large PNG aliases preserved through rewrites.
- Canonical brand/category/condition normalization and additive production backfill.
- Removed all customer-facing My Car/Saved Cars/سيارتي application surfaces while retaining the historical `UserCar` table.
- Public anonymous SSR/auth overlay split, duplicate compatibility warning removal, and Resend lifecycle webhook endpoint.
- Updated `CODEX_HANDOFF.md` and `FEATURE_PARITY_CHECKLIST.md` to current branch/behavior.

## Tests passed

- `npm ci`
- `npm audit --omit=dev --audit-level=high`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --runInBand` — 68/68 passing
- `npm run build` — exit 0; local placeholder `.env.local` database URL logs a handled homepage warning
- `git diff --check`

## Commit

Implementation commit: `013d1a3` — Harden marketplace production readiness (on `codex/preserve-mobile-navigation`; not pushed yet). Do not commit `.codebase-memory/` or secrets.

## Remaining tasks

1. Commit and push the validated batch normally to `main`.
2. Confirm the final GitHub Actions run is green.
3. Verify Vercel preview/production and run `SMOKE_URL=https://ghyarmarket-eg.com SMOKE_EXPECT_BMW=1 npm run test:smoke` after adding/using the final smoke checks.
4. Store `RESEND_WEBHOOK_SECRET` in Vercel, deploy, configure exactly one signed Resend webhook for delivery/failure events, and verify lifecycle updates without sending mass email.
5. Recheck Vercel runtime logs, Supabase counts/RLS, storage bucket visibility, and mobile/offline behavior.

## Blockers

- Resend webhook cannot be activated until its signing secret is securely stored in Vercel; never print or commit the secret.
- Remote GitHub CI and final Vercel preview/production checks are not yet evidenced for the pending commit.
- Local build environment contains a non-Postgres placeholder `DATABASE_URL`; production/CI must provide the real server-only URL.

## Migrations applied

- `canonical_marketplace_taxonomy` (additive value normalization/backfill)
- `optimized_profile_assets` (preset avatar URL updates only)
- `resend_webhook_delivery_tracking` (additive delivery event columns/index)

Read-only post-migration checks: 6 parts, 12 orders, 12 order items, 3 compatibility rows, 0 invalid prices, 0 negative stock, 8 email delivery attempts. `uploads` remains public and `protected-uploads` remains private; sensitive public tables have RLS enabled with zero browser policies.

## Preview deployment

Previous production/preview deployment for `5969e6c` was `READY`. The pending readiness commit has not been pushed yet. Deploy one preview after the final commit, validate it, then promote that exact commit only.
