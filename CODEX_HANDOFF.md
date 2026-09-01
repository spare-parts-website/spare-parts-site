# غيار ماركت / Spare Parts Site — Codex Handoff

## Continue here

Use this checkout and read `PRODUCTION_READINESS.md` first:

`C:\Users\HP\Documents\Codex\2026-08-16\https-github-com-fakepixelpro-spare-parts\remake`

- GitHub: `https://github.com/fakepixelpro/spare-parts-site.git`
- Production branch: `main`
- Working branch: `codex/preserve-mobile-navigation`
- Vercel project: `spare-parts-site` (linked through `.vercel/project.json`)
- Production domain: `https://ghyarmarket-eg.com`
- Last production commit before this readiness batch: `5969e6c`

Do not use the old `C:\Users\HP\Documents\Codex\spare-parts-site-online` path or the old `codex/remake-preview` branch. Preserve unrelated work and `.codebase-memory/`; never commit secrets or that generated directory. The authorized release pattern is a normal push such as `git push origin HEAD:main`; never force-push.

## Current architecture

- Next.js App Router 16, React 19, TypeScript, Prisma/PostgreSQL on Supabase, and Resend.
- Marketplace, orders, notifications, and admin data are server-side through Prisma; Supabase RLS remains fail-closed for browser roles and the service-role key stays server-only.
- Grouped seller orders and `OrderItem` stock/coupon transactions are the current checkout architecture. Do not rewrite them without a failing integration test.
- Public home/catalog pages use bounded anonymous data; authenticated identity is restored by the client `/api/auth/me` overlay. Account, seller, admin, checkout, chat, and private image routes remain private/no-store.
- The AI assistant remains lazy-loaded. Notification updates use authenticated HTTP polling with hidden-tab backoff; production no longer opens Socket.IO. The unsafe standalone notification mini-service was decommissioned; the remaining Socket.IO dependency is only the isolated `examples/websocket` demo.

## Intentionally removed

`My Car / Saved Cars / سيارتي` is intentionally removed from customer-facing routes, navigation, AI actions, prompts, and product/checkout UI. Do not restore it. The historical `UserCar` table and migration history remain for backwards compatibility; do not drop them.

Structured vehicle compatibility (`make`, `model`, years, engine, trim, notes, universal) remains supported and must stay conservative: unknown fitment is never presented as a confirmed fit.

## Readiness work already implemented

- `npm ci` lockfile/install path and CI production audit (`npm audit --omit=dev --audit-level=high`).
- Positive-price (`price > 0`) validation for product and JSON/CSV inventory writes, with row-level errors, limits, ownership checks, and atomic application/CSV preview.
- Admin part editing exposes offer identifiers, taxonomy, pricing/stock, images, and structured fitment; seller entry keeps internal OEM/search fields out of the offer form.
- Resource-based private image authorization for chat/product messages, disputes, verification, and AI attachments; participant/admin checks happen after database resolution.
- Private attachment write validation by upload purpose/uploader; protected storage remains private and marketplace `uploads` remains public.
- Automotive typo-tolerant search with aliases, bounded variants, weighted OEM/part-number ranking, and the regression `bww → BMW`.
- Canonical brand/category/condition normalization plus additive production backfill.
- Duplicate product fitment warning removed; review `blocked` filtering and existing qualifying-order trust rules preserved.
- Service worker reduced to an explicit static allowlist; old caches are versioned and removed on upgrade.
- Optimized WebP hero/preset avatars, 512px branding icon, favicon rewrite, and legacy image aliases without shipping the old multi-megabyte PNGs.
- Public SSR/auth split, safe cache headers, and no saved-car personalization in public loaders.
- Resend lifecycle webhook endpoint with Standard Webhooks verification, idempotency, delivery status updates, and minimal audit metadata. It requires `RESEND_WEBHOOK_SECRET` in Vercel before enabling the provider webhook.

## Database changes applied safely

Additive/reversible SQL has been applied to Supabase project `sufrsfrrrzhhdluolxdf`:

- `canonical_marketplace_taxonomy`
- `optimized_profile_assets`
- `resend_webhook_delivery_tracking`

No reset, drop, truncate, mass delete, or order/order-item deletion was used. Keep future migrations additive and validate row counts before and after any backfill.

## Verification commands

Run from this checkout at phase boundaries and once before release:

```text
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm test
npm run build
npm run test:smoke
git diff --check
```

The local build may log a handled homepage Prisma initialization warning when the local `.env.local` contains a non-Postgres placeholder; CI/Vercel must use the real server-side database environment and the build must still exit successfully.

## Remaining release work

1. Commit the validated readiness batch and push it normally to GitHub.
2. Confirm the GitHub Actions run is green (npm ci, audit, lint, tests, build).
3. Verify the Vercel preview, then promote only that commit to production and run public/protected smoke checks, including `/parts?search=bww`, `/favicon.ico`, logout/offline behavior, and no `/socket.io` requests.
4. Set `RESEND_WEBHOOK_SECRET` in Vercel without printing it, deploy, then configure exactly one Resend webhook at `/api/webhooks/resend` for delivery/failure events. Verify one signed lifecycle event if available; never send a mass test email.
5. Recheck Vercel runtime errors/logs and the Supabase counts/RLS/storage posture after deployment.

Do not mark a release gate complete without evidence. If a provider configuration cannot be completed securely, record it as `BLOCKED` in `PRODUCTION_READINESS.md` with the exact remaining action.
