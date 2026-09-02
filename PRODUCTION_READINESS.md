# Production readiness checkpoint

## Current phase

The current hardening batch is committed on `codex/ai-9-plus-hardening` and will be promoted only after the checks below pass. It covers signed Resend lifecycle processing, recipient validation/suppression, AI provider health tracking, database integrity constraints, nonce-based CSP/CSRF checks, and a real Postgres checkout race suite in CI. The last production deployment (`dpl_AZZEqESM5k9wW55zwSno5a84sQvJ`) is READY for the previous docs-only commit; the new code is not claimed as live until its Vercel deployment is READY.

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
- Added validated, additive Postgres checks for finite positive prices, non-negative stock/money, positive quantities, 1–5 ratings, coupon usage bounds, and vehicle year ranges (`data_integrity_constraints_20260902`).
- Added Next.js 16 `proxy` request IDs, nonce-based `script-src`, same-origin mutation checks for browser API calls, and a bounded CSP report endpoint. JSON-LD scripts receive the per-request nonce.
- Added an opt-in paid OpenRouter primary (`OPENROUTER_PRIMARY_MODEL`) that rejects `:free` aliases and keeps the existing bounded fallback pools when it is not configured. Operational alert delivery is optional, rate-limited, and secret-free.
- Added a real isolated Postgres checkout-concurrency CI job covering conditional stock reservation and duplicate client-order convergence. `npm start` now supports both standard and standalone Next build artifacts.
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
- Local `npm start` fallback plus `npm run test:smoke` — all public routes, API boundaries, nonce CSP, request ID, and CSP reporting headers passed against the generated build.
- `git diff --check`
- `npm run test:smoke` against https://ghyarmarket-eg.com with SMOKE_EXPECT_BMW=1 — all checks passed, including favicon, auth boundaries, APIs, security headers, and bww search
- GitHub Actions CI run 101 for `0ebdd29` — success (install, audit, lint, test, build)
- Vercel Preview deployment `dpl_8KnuuNwyrjADB5gaZFeTEV1Y7Q66` — READY
- Vercel Production deployment `dpl_5iKK5Z9Yozx5Ua9iMiCe5Y18tmws` — READY and aliased to `ghyarmarket-eg.com`

## Commit

Release commit: `0ebdd29` (`Harden email delivery, AI resilience, and accessibility`) is on `main`. The working tree has only the untracked local `.codebase-memory/` directory. Never commit `.codebase-memory/`, `.env*`, webhook secrets, or provider keys.

## Remaining tasks

1. Configure an explicitly chosen paid AI provider/model and valid transactional/support recipient addresses; no secret or address is invented by this repository.
2. Send one authorized disposable-recipient lifecycle test and confirm the matching delivery attempt is updated once; do not send tests to customers.
3. Let GitHub Actions run the new isolated Postgres checkout race job, then retain its run URL as release evidence.
4. Run authenticated mobile/offline browser QA and an axe scan, then record real Core Web Vitals/p75 data instead of inferring a performance score from static inspection.

## Blockers

- The current browser connector cannot authenticate to the protected Preview; its Vercel build is READY. CUA verified the public Production UI after deployment, while authenticated role flows remain unverified.
- No paid AI provider credential is configured in Vercel, so the runtime still uses the existing Gemini/OpenRouter/Gateway fallback order and the assistant remains labelled beta.
- `SUPPORT_EMAIL` is not configured and the local notification sender is invalid; support/admin outbound email is fail-closed until a verified address is provisioned.
- Positive signed Resend lifecycle, Gmail/Outlook/Yahoo seed-inbox, DMARC/Postmaster, authenticated axe, and isolated checkout-race tests still require external accounts or test infrastructure.
- Local build environment contains a non-Postgres placeholder `DATABASE_URL`; production/CI must provide the real server-only URL.
- Full real-database checkout race testing is blocked until an isolated test database is provisioned; the guarded test refuses to use the application/production URL.
- CSP still requires `unsafe-inline` for the current Next.js hydration/theme stack; removing it needs a nonce/hash migration and was intentionally not attempted in this focused release.
- The new CSP removes `script-src unsafe-inline`; a small `style-src unsafe-inline` exception remains for existing dynamic chart/style attributes and needs a separate CSS-variable refactor before claiming a zero-inline CSP.

## Migrations applied

- `canonical_marketplace_taxonomy` (additive value normalization/backfill)
- `optimized_profile_assets` (preset avatar URL updates only)
- `resend_webhook_delivery_tracking` (additive delivery event columns/index)
- `support_tickets` (additive support ticket/message tables, indexes, RLS)
- `hide_known_development_reviews` (reversible moderation flag for two exact fixture author names)
- `support_ticket_privileges` (revokes browser grants while preserving server-side RLS fail-closed access)
- `email_deliverability_hardening_20260902` (recipient delivery status and suppression state)
- `email_delivery_records_20260902` (delivery attempts, provider IDs, lifecycle timestamps, and idempotency fields)
- `data_integrity_constraints_20260902` (validated additive checks for prices, stock, money, quantities, ratings, coupons, and fitment years)

Read-only post-deploy checks (2026-09-02): 6 parts, 12 orders, 12 order items, 3 compatibility rows, 0 invalid prices, 0 negative stock, and 17 email delivery attempts (all currently `SENT` pending provider lifecycle callbacks). `uploads` remains public and `protected-uploads` remains private; sensitive public tables have RLS enabled with zero browser policies.

## Deployments

- Preview: `dpl_8KnuuNwyrjADB5gaZFeTEV1Y7Q66`, READY, branch `codex/ai-9-plus-hardening`; remote Vercel build passed TypeScript and route generation.
- Production: `dpl_5iKK5Z9Yozx5Ua9iMiCe5Y18tmws`, READY, commit `0ebdd29`, aliased to `ghyarmarket-eg.com`.
- Vercel runtime-error query for the checked window returned no errors; a narrow Preview runtime-log query returned no matching logs.
