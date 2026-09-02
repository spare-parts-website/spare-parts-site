# Feature parity and release checklist

This checklist describes the current implementation in `codex/ai-9-plus-hardening`. It is intentionally evidence-based; an unchecked release item is not a claim of failure, only work still requiring remote or browser evidence.

## Authentication and profiles

- [x] Registration, login verification, resend verification, logout, current-user session, forgot-password, and reset-password routes remain present.
- [x] Buyers, sellers, and admins can persist preset or uploaded avatars through the existing `User.avatar` field.
- [x] Account profile is reachable from desktop controls and mobile `حسابي` navigation.
- [x] Reset tokens are hashed, one-time, expiring, and rate-limited; successful reset invalidates prior sessions/challenges.

## Buyer parity

- [x] Parts and store discovery, search, filters, details, reviews, wishlist, cart, COD checkout, orders, invoices, and buyer/seller chat remain routed.
- [x] Loading, retry, empty, and signed-out states remain in place.
- [x] Grouped seller orders keep one `Order` per seller, item-level stock/coupon transactions, and checkout idempotency.
- [x] `My Car / Saved Cars / سيارتي` is intentionally removed from customer UI, navigation, AI actions, prompts, and checkout. The historical `UserCar` table is retained; no destructive database migration was made.

## Seller parity

- [x] Store setup/editing, inventory, CSV import/export, orders, analytics, coupons, messages, reviews, verification, uploads, and notifications remain routed and role-protected.
- [x] JSON and CSV bulk inventory updates enforce positive prices, non-negative integer stock, row/file limits, ownership, canonical taxonomy, and atomic apply.
- [x] Structured fitment supports universal listings, multiple entries, make/model minimums, year ranges, notes, and conservative unknown states.

## Admin parity

- [x] User, store, part, order, review, report, verification, and moderation tools remain routed and role-protected.
- [x] Admin edits use the same positive-price and canonical taxonomy boundaries as seller writes.
- [x] Admin offer editing covers identifiers, taxonomy, price/stock, images, and structured fitment; seller offer entry omits OEM/search-only fields.
- [x] Admin can create a listing on behalf of a selected seller store without changing ownership; the mutation is audited.
- [x] Support inbox is available to admins with ticket ownership isolation, status/category/search filters, replies, statuses, and audit history.
- [x] Private chat/product attachments, dispute evidence, verification documents, and AI images require resolved resource access; admins may inspect known resources only.

## Data, search, and trust

- [x] Brand, category, and condition aliases normalize to canonical display values while preserving justified custom values.
- [x] Additive taxonomy backfill completed without deleting orders, order items, parts, or compatibility rows.
- [x] Automotive search remains parameterized, bounded, Arabic-normalized, synonym-aware, and weighted toward OEM/part numbers; regressions `bww`/`بي إم` → BMW and a single-brand precision guard are covered.
- [x] Blocked reviews remain excluded from public lists, aggregates, and structured data; qualifying-order review authorization is preserved.
- [x] Explicit development fixture authors are reversibly blocked; legitimate unverified customer reviews are not hidden automatically.

## Privacy, PWA, and performance

- [x] Public anonymous pages use bounded server data; product/store details are revalidated without cookies and authenticated identity/permissions are private overlays.
- [x] Account, seller, admin, checkout, messages, APIs, and private-image responses are not service-worker cached.
- [x] Service-worker cache is an explicit versioned static allowlist and deletes prior caches on upgrade.
- [x] Notification polling is authenticated, visibility-aware, backoff-capable, and no longer opens Socket.IO in production.
- [x] The unsafe standalone notification Socket.IO mini-service is decommissioned; the root dependency remains only for the isolated websocket demo.
- [x] Hero and preset avatars use optimized WebP assets; the latest approved historical PNG logo is restored and wired to favicon/PWA/service worker surfaces.

## Email and operations

- [x] In-app notifications remain durable and email failures remain secondary/failure-safe.
- [x] Resend delivery webhook endpoint verifies Standard Webhooks signatures, is idempotent, updates `EmailDeliveryAttempt`, and audits severe lifecycle events.
- [x] Exactly one enabled Resend webhook is configured for the complete lifecycle, with its signing secret stored as a hidden Vercel Preview/Production variable.
- [x] Malformed and common typo email domains are rejected at registration/profile/admin boundaries; permanent provider failures stop non-essential email and auth sends.
- [x] Support ticket email notification is sent only after ticket persistence, uses `SUPPORT_EMAIL`, logs sent/skipped/failed delivery, and never rolls back the ticket on email failure.
- [ ] A disposable positive signed lifecycle test still needs to be run against a seed recipient; no customer address should be used.
- [ ] `SUPPORT_EMAIL` and the notification sender still need verified production values before support/admin outbound email is enabled.
- [x] CI workflow retains npm install, production audit, lint, test, and build steps; GitHub Actions run 79 for release commit 8d95a3a completed successfully.

## Local verification completed

- [x] `npm ci`
- [x] `npm audit --omit=dev --audit-level=high`
- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm test` (102 passing, 1 isolated-DB checkout harness skipped by default)
- [x] `npm run build` (exits successfully; local placeholder DB URL emits a handled homepage warning)
- [x] `git diff --check`
- [x] `npm run test:smoke` against https://ghyarmarket-eg.com with SMOKE_EXPECT_BMW=1

## Release gates still requiring remote evidence

- [ ] Hardening batch commit still needs a normal push and GitHub Actions result.
- [x] Vercel Preview `dpl_8KnuuNwyrjADB5gaZFeTEV1Y7Q66` is READY; direct protected smoke is limited by Vercel Authentication.
- [ ] Production promotion of the hardening batch is still pending.
- [x] Vercel runtime errors and production 5xx logs show no entries in the checked hour.
- [x] Supabase post-deploy counts, RLS posture, and public/private storage bucket visibility are rechecked.
