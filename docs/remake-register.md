# Marketplace remake — implementation register

Baseline: 80e99cbf1f19223410d2fe17e1583689db34b663, branch codex/marketplace-remake.
Local verification does not establish deployment status.

## Decisions
Arabic RTL; premium light design with optional dark theme. Free infrastructure; Netlify compatibility first, retaining Supabase and Resend. COD launch. Platform-collected online payments and payouts remain disabled until merchant approval and settlement policies are configured.

## Evidence and gates
| Area | Baseline | Status |
| --- | --- | --- |
| Homepage/design | Oversized dark promotional hero | Implementing; visual verification pending |
| Catalogue | Stale-response race; advanced URL filters lost | Implementing |
| Pagination/search | Offset reads; fuzzy candidate cap | Pending database keyset/ranking work |
| Sitemap | Unbounded public findMany | XML index and bounded ID-range shards implemented; database/browser verification pending |
| Metadata/routing | Duplicate detail reads; catch-all plus dedicated public routes | Shared request-scoped anonymous loaders and private layouts implemented; browser verification pending |
| Seller/admin | Authenticated journeys not freshly inspected | Unverified |
| Garage/comparison/saved searches/quotes/import | Inventory existing capabilities before extending | Pending |
| Money/inventory | Prisma Float; SQL normalization already exists | All 10 SQL migrations replayed in isolated PostgreSQL 17; existing checkout race harness passed; full HTTP race coverage pending |
| Security/privacy/storage | Prior hardening baseline | Fresh ownership, lifecycle and retention checks pending |
| RLS | 48 INFO no-policy notices | Verify grants; preserve intentional deny-all |
| Resend | Domain/webhook verified; retry worker shares daily cleanup | Independent authenticated email endpoint and disabled-by-default Netlify retries implemented; live lifecycle verification pending |
| Payments/shipping | COD baseline | Sandbox adapters pending; live activation disabled |
| Hosting | Vercel preview READY | Netlify proof site created; cloud build/link and runtime matrix pending |
| GitHub | Connector Unknown tool | Authenticated REST recovered: baseline CI cancelled, CodeQL failed, main protection 403 entitlement limit; no pass claimed |
| Browser gate | Five public/login routes | Authenticated/mobile coverage pending |
| Operations | No fresh restore or capacity measurement | Pending isolated restore and budget |

## Release criteria
Track each finding with severity, evidence, correction and regression coverage.
Require role/ownership tests, PostgreSQL concurrency, migration replay, typecheck,
lint, production build, browser journeys, accessibility, both themes and 360/390px.
Do not report lab metrics as field Core Web Vitals. Preserve customer data, existing
URLs and private repository visibility. No DNS cutover before hosting proof.

## External prerequisites
Netlify plugin provides deployment skills; no callable Netlify connector was exposed.
CLI authentication and a dedicated proof site are verified, but the local
Windows adapter path is blocked during edge middleware packaging. Cloud build
linking or a Linux build runner is required. Merchant/courier approval,
settlement terms and GitHub CodeQL entitlement remain external prerequisites.

## Current implementation evidence

- Final application suite: 213 tests, 212 passed, 0 failed, 1 opt-in integration
  test skipped. That integration test passed separately against isolated PostgreSQL.
- Four additional Netlify worker behaviour tests passed: activation, invalid origins,
  authenticated bounded requests, and safe failure handling.
- Final standalone TypeScript check passed, including the Netlify workers.
- Full lint completed with no errors; all six reported warnings were corrected,
  and targeted lint of every corrected file passed without warnings.
- Production build completed successfully against isolated PostgreSQL, including
  TypeScript and all 69 prerendered entries. An earlier placeholder-URL build
  logged database errors and is not counted as the clean build.
- Product comparison (up to four), URL/filter preservation, abortable list requests,
  and honest logout failure handling are implemented, not yet browser-release verified.
- Theme defaults to light, retains explicit dark selection, and works without storage.
- No production deployment, DNS cutover, provider activation or live schema mutation
  was performed in this implementation pass. A dedicated Netlify proof site was
  created, but local Windows packaging failed at the adapter edge-middleware step.
- Hosting procedure and proof matrix: [Netlify proof](netlify-hosting-proof.md).
- Netlify CLI authentication is verified for the `spare parts` team and the
  proof site is `ghyar-market-remake-preview`. The dashboard still needs a
  browser GitHub sign-in before continuous deployment can be linked; no
  credentials or tokens are stored in the repository.
