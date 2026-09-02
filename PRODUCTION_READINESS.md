# Production readiness checkpoint

## Current phase

The current hardening batch is implemented on `codex/ai-9-plus-hardening` (based on `6952917`), with local quality gates green. It covers signed Resend lifecycle processing, recipient validation/suppression, AI provider health tracking, and an accessibility/mobile pass. A Vercel Preview deployment is READY; production promotion is kept separate until the release commit and final checks are recorded.

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
- Resend now has one enabled signed webhook for the complete email lifecycle; duplicate/stale events are idempotent and permanent recipient failures suppress non-essential sends.
- Registration/profile/admin email inputs reject malformed addresses and provide safe typo corrections; login/password reset stop before send for permanently undeliverable users.
- AI provider attempts now use bounded backoff and a per-provider circuit breaker with safe health telemetry while preserving the existing guard, dedupe lease, timeout, and fallback pipeline.
- Parts/stores cards no longer nest interactive controls inside a link; form controls have accessible names, heading hierarchy is consistent, and light-theme primary text meets the intended contrast direction.
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
- `npm test` — 102 passing, 1 intentionally skipped isolated-DB checkout harness
- `npm run build` — remote Vercel build completed cleanly; local build is expected to log a handled homepage warning because `.env.local` contains a non-Postgres placeholder URL
- `git diff --check`
- `npm run test:smoke` against https://ghyarmarket-eg.com with SMOKE_EXPECT_BMW=1 — all checks passed, including favicon, auth boundaries, APIs, security headers, and bww search
- GitHub Actions CI run 79 for 8d95a3a — success (install, audit, lint, test, build); this hardening commit still needs its post-push status check
- Vercel Preview deployment `dpl_8KnuuNwyrjADB5gaZFeTEV1Y7Q66` — READY; production remains on the prior deployment until promotion

## Commit

The working tree contains the hardening batch and an untracked local `.codebase-memory/` directory. Commit only source/tests/docs after the final gates pass; never commit `.codebase-memory/`, `.env*`, webhook secrets, or provider keys.

## Remaining tasks

1. Promote the READY Preview after committing/pushing the hardening batch, then verify the production domain and signed webhook boundary.
2. Send one authorized disposable-recipient lifecycle test and confirm the matching delivery attempt is updated once; do not send tests to customers.
3. Provision a disposable `TEST_DATABASE_URL` with `NODE_ENV=test` and run the opt-in checkout concurrency suite; production checkout already uses conditional stock decrements and unique grouped client IDs.
4. Run authenticated mobile/offline browser QA and an axe scan, then record real Core Web Vitals/p75 data instead of inferring a performance score from static inspection.

## Blockers

- The current browser connector cannot authenticate to the protected Preview; its Vercel build is READY. Public production smoke can verify only unauthenticated paths.
- No paid AI provider credential is configured in Vercel, so the runtime still uses the existing Gemini/OpenRouter/Gateway fallback order and the assistant remains labelled beta.
- `SUPPORT_EMAIL` is not configured and the local notification sender is invalid; support/admin outbound email is fail-closed until a verified address is provisioned.
- Positive signed Resend lifecycle, Gmail/Outlook/Yahoo seed-inbox, DMARC/Postmaster, authenticated axe, and isolated checkout-race tests still require external accounts or test infrastructure.
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
- `email_deliverability_hardening_20260902` (recipient delivery status and suppression state)
- `email_delivery_records_20260902` (delivery attempts, provider IDs, lifecycle timestamps, and idempotency fields)

Read-only post-migration checks: 6 parts, 12 orders, 12 order items, 3 compatibility rows, 0 invalid prices, 0 negative stock, 8 email delivery attempts. `uploads` remains public and `protected-uploads` remains private; sensitive public tables have RLS enabled with zero browser policies.

## Deployments

- Preview: `dpl_8KnuuNwyrjADB5gaZFeTEV1Y7Q66`, READY, branch `codex/ai-9-plus-hardening`; remote Vercel build passed TypeScript and route generation.
- Production: prior deployment remains aliased to `ghyarmarket-eg.com` until the hardening commit is promoted.
- Vercel runtime-error query for the checked window returned no errors; a narrow Preview runtime-log query returned no matching logs.
