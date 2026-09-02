# Ghyar Market AI remake progress

Last audited: 2026-09-02
Branch: `codex/preserve-mobile-navigation`
Base commit: `273d17a9a081427a8b78cd02eb49c7c13c01f0ab` (`Harden transactional email deliverability`)

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
- [ ] Phase 8 — production browser verification, deployment, and final parity report.

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

Latest targeted checks pass: `npx tsc --noEmit`, `npm run lint`, `npm test` (91 passing, 1 opt-in skip), and `npm run build`. The added AI tests cover server role capability authority, structured-plan validation, page/ordinal context, prompt-injection detection, typo-tolerant actions, support/cart flows, admin-on-behalf selection, guest compatibility, target-name preservation, and single-result cards. Run the remaining release checks below before pushing the final commit: `npm ci`, `npm audit --omit=dev --audit-level=high`, and `git diff --check`.

## Files changed in this remake

AI routes and orchestration: `src/app/api/ai/route.ts`, `src/app/api/ai/actions/route.ts`, `src/lib/ai/agent.ts`, `src/lib/ai/planner.ts`, `src/lib/ai/structured-planner.ts`, `src/lib/ai/context.ts`, `src/lib/ai/capabilities.ts`, `src/lib/ai/policy.ts`, `src/lib/ai/types.ts`, `src/lib/ai/deterministic.ts`, `src/lib/ai/presentation.ts`, `src/lib/ai/tools.ts`, `src/lib/ai/actions.ts`, and `src/lib/ai/resolver.ts`.

Client UX and tests: `src/components/ai-assistant.tsx`, `src/components/ai-assistant-loader.tsx`, `src/components/app-shell.tsx`, and `tests/ai-assistant.test.ts`.

Next exact task: run the full release quality gate, inspect the production diff, commit the coherent remake, push the branch, and verify the Vercel READY deployment plus the public AI route without exposing credentials. Do not commit `.codebase-memory/`.
