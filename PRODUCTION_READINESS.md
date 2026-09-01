# Production readiness checkpoint

## Current phase

The final correction batch is implemented on `codex/preserve-mobile-navigation` and is ready for a safe push/deploy. Local gates are green. Resend provider activation remains intentionally blocked until its signing secret is stored securely.

## Completed

- Deterministic npm install/audit and preserved CI pipeline.
- Resource-based private image authorization plus uploader/purpose checks for new chat, evidence, and verification attachments.
- Positive-price/stock-safe atomic JSON and CSV inventory validation with preview and ownership checks.
- Admin offer editing now covers identifiers, taxonomy, price/stock, images, and structured fitment while seller entry omits internal OEM/search fields.
- Bounded automotive typo search and weighted ranking (`bww`, `بي إم`, and related spellings resolve BMW while a single-brand intent filters weak unrelated matches).
- Static-only privacy-safe service worker and authenticated notification polling; no production Socket.IO connection.
- Removed the unsafe standalone notification Socket.IO mini-service; the root dependency remains only for the isolated websocket demo.
- Branded favicon and optimized hero/preset avatar assets; legacy large PNG aliases preserved through rewrites.
- Canonical brand/category/condition normalization and additive production backfill.
- Removed all customer-facing My Car/Saved Cars/سيارتي application surfaces while retaining the historical `UserCar` table.
- Public anonymous SSR/auth overlay split, duplicate compatibility warning removal, and Resend lifecycle webhook endpoint.
- Restored the latest approved historical logo from `3a1c887` across app chrome, auth, favicon, Apple/PWA icons, and the service-worker allowlist.
- Known development review fixtures are retained but reversibly blocked and excluded from public review lists/averages/counts; legitimate unverified reviews remain eligible for display.
- Public product/store details now render identity-free with shared revalidation; viewer permissions use private client/API overlays.
- Added additive SupportTicket/SupportMessage tables, RLS, customer/admin inbox UI with status/category/search filters, ownership checks, status/reply audits, and failure-safe support email delivery using `SUPPORT_EMAIL`.
- Added secure admin-assisted listing creation that resolves a seller's store, preserves `storeId`, validates price/stock, and audits the mutation.
- Added visible BreadcrumbList JSON-LD alongside existing Product/AutoPartsStore schema, public cache headers, route prefetch/loading feedback, and search-result prioritization for typo-ranked IDs.
- Updated `CODEX_HANDOFF.md` and `FEATURE_PARITY_CHECKLIST.md` to current branch/behavior.
- Added the missing npm peer-resolution entry found by GitHub Actions and reran the release pipeline successfully.

## Tests passed

- `npm ci`
- `npm audit --omit=dev --audit-level=high`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test` — 76 passing, 1 intentionally skipped isolated-DB checkout harness
- `npm run build` — exit 0; local placeholder `.env.local` database URL logs a handled homepage warning
- `git diff --check`
- `npm run test:smoke` against https://ghyarmarket-eg.com with SMOKE_EXPECT_BMW=1 — all checks passed, including favicon, auth boundaries, APIs, security headers, and bww search
- GitHub Actions CI run 79 for 8d95a3a — success (install, audit, lint, test, build)
- Vercel production deployment dpl_4MdTeEp5GdmotT2KNpZfbm7RvuYe — READY and aliased to ghyarmarket-eg.com

## Commit

Implementation commit: 013d1a3 — Harden marketplace production readiness. Checkpoint commit: 816713e. Current release commit: 8d95a3a — Fix CI lockfile peer resolution (on codex/preserve-mobile-navigation and main). Do not commit .codebase-memory/ or secrets.

## Remaining tasks

1. Store RESEND_WEBHOOK_SECRET in Vercel, deploy, configure exactly one signed Resend webhook for delivery/failure events, and verify lifecycle updates without sending mass email.
2. Keep monitoring Vercel runtime errors/logs and perform authenticated mobile/offline browser QA when a browser session is available.
3. Provision a disposable `TEST_DATABASE_URL` with `NODE_ENV=test` and run the opt-in checkout concurrency suite; production checkout already uses conditional stock decrements and unique grouped client IDs.

## Blockers

- Resend webhook cannot be activated until its signing secret is securely stored in Vercel; never print or commit the secret.
- The protected preview cannot be exercised by the current unauthenticated HTTP connector; its Vercel build is READY. Public production smoke is green.
- Local build environment contains a non-Postgres placeholder `DATABASE_URL`; production/CI must provide the real server-only URL.
- Full real-database checkout race testing is blocked until an isolated test database is provisioned; the guarded test refuses to use the application/production URL.
- CSP still requires `unsafe-inline` for the current Next.js hydration/theme stack; removing it needs a nonce/hash migration and was intentionally not attempted in this focused release.

## Migrations applied

- `canonical_marketplace_taxonomy` (additive value normalization/backfill)
- `optimized_profile_assets` (preset avatar URL updates only)
- `resend_webhook_delivery_tracking` (additive delivery event columns/index)
- `support_tickets` (additive support ticket/message tables, indexes, RLS)
- `hide_known_development_reviews` (reversible moderation flag for two exact fixture author names)
- `support_ticket_privileges` (revokes browser grants while preserving server-side RLS fail-closed access)

Read-only post-migration checks: 6 parts, 12 orders, 12 order items, 3 compatibility rows, 0 invalid prices, 0 negative stock, 8 email delivery attempts. `uploads` remains public and `protected-uploads` remains private; sensitive public tables have RLS enabled with zero browser policies.

## Deployments

- Preview: dpl_C27aSqZa1c3WmXFyvkzS413L48HR for 816713e, READY (branch codex/preserve-mobile-navigation).
- Production: dpl_4MdTeEp5GdmotT2KNpZfbm7RvuYe for 8d95a3a, READY, alias ghyarmarket-eg.com.
- Production smoke after the final deployment passed; runtime errors and production 5xx logs were empty for the checked hour.
