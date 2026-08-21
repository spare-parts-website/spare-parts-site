# Feature parity checklist

Baseline: commit `8317dd3` plus the preserved pre-remake workspace. The remake's visual system remains the source of truth.

## Automated source audit

- [x] Every API route present in `8317dd3` still exists.
- [x] Every view component present in `8317dd3` still exists.
- [x] Every baseline route/view state is reachable through the remake router.
- [x] Paymob code and routes remain excluded from this release.

## Authentication and profiles

- [x] Registration, login verification, resend verification, logout, and current-user session routes remain present.
- [x] Preset avatar selection remains available during registration and profile editing.
- [x] Custom avatar upload remains available from `/account/profile` for buyers, sellers, and admins.
- [x] Avatar persistence remains backed by the existing `User.avatar` field.
- [x] Avatars render in the header, profile, parts, stores, seller cards, and reviews.
- [x] `/account/profile` is reachable through desktop account controls and mobile `حسابي` navigation.
- [x] `/forgot-password` and `/reset-password?token=...` provide an Arabic RTL recovery flow.
- [x] Reset requests return the same message for known and unknown email addresses.
- [x] Reset tokens are random, hashed at rest, expire after 30 minutes, are one-time use, and are rate-limited.
- [x] A successful reset invalidates prior reset tokens, verification challenges, and existing sessions.

## Buyer parity

- [x] Parts and store discovery, search, filters, details, reviews, wishlist, saved cars, cart, COD checkout, orders, invoices, and buyer/seller chat remain routed.
- [x] Existing loading, error/retry, and empty states remain in place.
- [x] COD order creation and stock updates remain atomic and Paymob is not enabled.

## Seller parity

- [x] Store setup/editing, inventory, orders, analytics, coupons, messages, reviews, uploads, and notifications remain routed and role-protected.
- [x] Seller avatars are visible beside their stores, listings, and marketplace identity.

## Admin parity

- [x] User, store, part, order, review, and report tools remain routed and role-protected.
- [x] Existing security headers, protected internal routes, and fail-closed RLS posture remain unchanged.

## Verification completed before preview

- [x] Prisma schema formatting and client generation.
- [x] ESLint.
- [x] Unit tests, including the Arabic reset email template.
- [x] Production build.
- [x] Desktop and mobile browser checks for login, registration, preset avatars, forgot password, malformed reset links, and account navigation.
- [x] Accessibility audit of login and registration with zero violations.
- [x] Production migration preserved all user, store, part, order, avatar, upload, and reset records.

## Release gates

- [ ] Preview deployment succeeds with production-like data access.
- [ ] Preview public marketplace pages and protected-route behavior pass smoke checks.
- [ ] Production deployment is made only from the previewed commit.
- [ ] Live-domain smoke checks and Vercel runtime-log checks pass.
