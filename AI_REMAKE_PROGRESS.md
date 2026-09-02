# Ghyar Market AI remake progress

Last audited: 2026-09-02
Branch: `codex/ai-9-plus-hardening`
Base commit: `273d17a9a081427a8b78cd02eb49c7c13c01f0ab` (`Harden transactional email deliverability`)
Release commits: `6b1a423` (copilot remake), `c5ae283` (Arabic search filler normalization), `cd5547f` (integrity/CSP/operations hardening), `35c5874` (dynamic nonce-protected rendering)

## How to continue

Read this file and `AI_ROLE_CAPABILITY_MATRIX.md`, verify the current Git state, and continue from the first incomplete item. Do not redo a completed phase unless a regression proves it is broken.

## Checkpoint

- [x] Phase 0 — audited current AI routes/tools/UI, marketplace search, compatibility, account, cart, orders, chat, reviews, disputes, support, seller, admin, schema, and tests.
- [x] Phase 1 — added a server-owned capability registry and role filtering contract. Existing action allowlists remain authoritative.
- [x] Phase 2 — retained the deterministic fast path and added a typed structured-plan boundary for ambiguous model work.
- [x] Phase 3 — added bounded conversation/page/entity/cart context construction before planning.
- [x] Phase 4 — buyer action parity (messages, reviews, disputes, support, cart updates/removal, favorites, checkout preview).
- [x] Phase 5 — seller mutation parity for the supported dashboard surface (fitment/images, coupon edits, capped bulk inventory, store settings, verification status read).
- [x] Phase 6 — admin on-behalf parity for supported platform operations (seller listings/stores/accounts, review moderation, support replies/statuses).
- [x] Phase 7 — confirmation previews, prompt-injection/privacy regression coverage, structured result cards, and deterministic fallback hardening.
- [x] Phase 8 — production browser verification, deployment, and final parity report.
- [x] Phase 9 — reliability/accessibility hardening: bounded provider backoff, per-provider circuit health, response-safe email suppression, and accessible marketplace controls.

## Safety decisions

- Role permissions are server decisions; an LLM plan can never grant a capability.
- Every database write remains proposal-confirmed, revalidated, transactional, idempotent, and audited.
- Raw SQL, Prisma execution, secrets, service-role credentials, filesystem, GitHub/Vercel/Resend controls, password extraction, and permanent deletion are not AI capabilities.
- The removed saved-car (`سيارتي`) feature is intentionally excluded and must not be reintroduced.
- Existing checkout grouping, stock reservation/restoration, order transitions, RLS, upload ownership, chat censorship, support privacy, and email suppression remain the source of truth.

## Implemented scope and deliberate boundaries

- Buyer writes are confirmation-gated and revalidated: cart add/update/remove/clear, store favorites, seller messaging, verified-purchase reviews, disputes, private support tickets/replies, profile fields, and checkout preview. Actual order creation remains the dedicated grouped/idempotent checkout flow and is not executed by chat.
- Seller writes are scoped to the authenticated owner's store: listing fields/images/fitment, capped transactional price/stock bulk updates, coupons, store profile, order transitions, customer replies, and account profile fields. Permanent deletion/archive is not an AI capability.
- Admin on-behalf writes carry the admin actor in audit metadata and never impersonate a seller: listing/store/account edits, moderation, verification decisions, report/dispute decisions, support replies, and support status changes. Private verification/evidence documents stay in their secure UI; the assistant exposes safe status metadata only.
- The structured planner is a typed, role-filtered planning contract around the existing ToolLoop agent. It cannot grant permissions or execute writes; the server registry and action policy remain authoritative.
- No `سيارتي`/saved-car capability is exposed. Infrastructure shell, SQL, secrets, provider controls, permanent deletion, and password operations are intentionally excluded.

## Verification at this checkpoint

Release checks passed for this batch: `npm ci`, `npm audit --omit=dev --audit-level=high` (0 vulnerabilities), `npx tsc --noEmit`, `npm run lint`, `npm test` (110 passing, 1 opt-in skip), remote Vercel build, and `git diff --check`. The local build exits successfully but logs the expected handled warning because `.env.local` has a non-Postgres placeholder `DATABASE_URL`. GitHub Actions run 105 also passed the isolated Postgres checkout race job. The added AI tests cover provider circuit/backoff behavior in addition to server role capability authority, structured-plan validation, page/ordinal context, prompt-injection detection, typo-tolerant actions, support/cart flows, admin-on-behalf selection, guest compatibility, target-name preservation, and single-result cards.

Production verification completed on 2026-09-02:

- GitHub `main` fast-forwarded to `c5ae283`.
- Vercel deployment `dpl_HJsAP2Cp1DjaKsRmdgBsFgk77PaL` is `READY` at `https://spare-parts-site-1qjndmedl-project-bab7.vercel.app` with aliases `https://ghyarmarket-eg.com`, `https://spare-parts-site-project-bab7.vercel.app`, and `https://spare-parts-site-git-main-project-bab7.vercel.app`.
- Error-level Vercel log scan for the deployment returned no logs.
- Browser smoke test on `https://ghyarmarket-eg.com`: lazy assistant open, guest `دورلي على عداد BMW F30` returned a real listing card with `فتح` and `اختيار`, explicit `هل العداد ده يركب على BMW F30 2016؟` used the grounded compatibility result, and browser errors/console output were empty.
- Hardening commit `0ebdd29` is on `main`; GitHub Actions run 101 is green and Vercel Production deployment `dpl_5iKK5Z9Yozx5Ua9iMiCe5Y18tmws` is READY. Public smoke covers the main/catalog/auth/legal routes, BMW typo search, API boundaries, and security headers. The CUA DOM check found six detail buttons and no nested detail links after the accessibility pass.
- The follow-up hardening batch adds a validated Postgres integrity migration, a real Postgres checkout race job in GitHub Actions, Next.js 16 proxy nonce CSP/request IDs/same-origin mutation checks, an optional paid OpenRouter primary, and optional rate-limited operational alerts. Commits `cd5547f` and `35c5874` are live in Vercel Production deployment `dpl_GHnHAwAj8T2YQNURour7zHDS8B9e` (READY); CI run 105 passed the isolated checkout race job.

## Files changed in this remake

AI routes and orchestration: `src/app/api/ai/route.ts`, `src/app/api/ai/actions/route.ts`, `src/lib/ai/agent.ts`, `src/lib/ai/planner.ts`, `src/lib/ai/structured-planner.ts`, `src/lib/ai/context.ts`, `src/lib/ai/capabilities.ts`, `src/lib/ai/policy.ts`, `src/lib/ai/types.ts`, `src/lib/ai/deterministic.ts`, `src/lib/ai/presentation.ts`, `src/lib/ai/tools.ts`, `src/lib/ai/actions.ts`, and `src/lib/ai/resolver.ts`.

Client UX and tests: `src/components/ai-assistant.tsx`, `src/components/ai-assistant-loader.tsx`, `src/components/app-shell.tsx`, and `tests/ai-assistant.test.ts`.

Next exact task: configure the remaining external provider/recipient values, record the signed email lifecycle and authenticated browser/axe/Core Web Vitals evidence, and retain the isolated checkout-race CI run. Keep `.codebase-memory/` untracked.
