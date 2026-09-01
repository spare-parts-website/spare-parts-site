# Feature parity and release checklist

This checklist describes the current implementation in `codex/preserve-mobile-navigation`. It is intentionally evidence-based; an unchecked release item is not a claim of failure, only work still requiring remote or browser evidence.

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
- [x] Private chat/product attachments, dispute evidence, verification documents, and AI images require resolved resource access; admins may inspect known resources only.

## Data, search, and trust

- [x] Brand, category, and condition aliases normalize to canonical display values while preserving justified custom values.
- [x] Additive taxonomy backfill completed without deleting orders, order items, parts, or compatibility rows.
- [x] Automotive search remains parameterized, bounded, Arabic-normalized, synonym-aware, and weighted toward OEM/part numbers; regression `bww → BMW` is covered.
- [x] Blocked reviews remain excluded from public lists, aggregates, and structured data; qualifying-order review authorization is preserved.

## Privacy, PWA, and performance

- [x] Public anonymous pages use bounded server data; authenticated identity is a client `/api/auth/me` overlay rather than shared HTML.
- [x] Account, seller, admin, checkout, messages, APIs, and private-image responses are not service-worker cached.
- [x] Service-worker cache is an explicit versioned static allowlist and deletes prior caches on upgrade.
- [x] Notification polling is authenticated, visibility-aware, backoff-capable, and no longer opens Socket.IO in production.
- [x] The unsafe standalone notification Socket.IO mini-service is decommissioned; the root dependency remains only for the isolated websocket demo.
- [x] Hero and preset avatars use optimized WebP assets; obsolete multi-megabyte PNGs are removed with legacy rewrites. Favicon resolves to the branded SVG.

## Email and operations

- [x] In-app notifications remain durable and email failures remain secondary/failure-safe.
- [x] Resend delivery webhook endpoint verifies Standard Webhooks signatures, is idempotent, updates `EmailDeliveryAttempt`, and audits severe lifecycle events.
- [ ] `RESEND_WEBHOOK_SECRET` still needs to be stored in Vercel before enabling exactly one production Resend webhook.
- [x] CI workflow retains npm install, production audit, lint, test, and build steps; remote GitHub run must still be confirmed after the final push.

## Local verification completed

- [x] `npm ci`
- [x] `npm audit --omit=dev --audit-level=high`
- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm test` (68/68)
- [x] `npm run build` (exits successfully; local placeholder DB URL emits a handled homepage warning)
- [x] `git diff --check`
- [ ] `npm run test:smoke` against the final deployed URL

## Release gates still requiring remote evidence

- [ ] Final readiness commit pushed without force-push.
- [ ] GitHub Actions final run is green.
- [ ] Vercel preview for the final commit is `READY` and passes public/protected smoke checks.
- [ ] Production promotion is the previewed commit; live checks pass for `/`, `/parts`, `/parts?search=bww`, `/stores`, legal/auth pages, `/favicon.ico`, relevant APIs, and logout/offline privacy.
- [ ] Vercel runtime errors/logs show no new checkout, upload, webhook, or favicon/socket regressions.
- [ ] Supabase post-deploy counts, RLS posture, and public/private storage bucket visibility are rechecked.
