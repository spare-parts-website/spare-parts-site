# Ghyar Market production handoff checklist

This checklist separates code readiness from items that require an account owner, legal owner, or real marketplace data. It must be completed before a commercial public launch or ownership transfer.

## Automated code gates

- [ ] GitHub CI is green: dependency audit, lint, tests, checkout concurrency integration, and production build.
- [ ] Vercel production deployment is `READY` and `ghyarmarket-eg.com` resolves to that deployment.
- [ ] Supabase security and performance advisors are reviewed after the final migration.
- [ ] Production runtime logs have no unresolved 5xx/error cluster from the release candidate.
- [ ] Resend domain is verified and delivery webhooks are enabled.

## AI reliability

The application supports a paid OpenRouter primary model through `OPENROUTER_PRIMARY_MODEL` and falls back to direct Gemini/other configured providers. Free shared pools are useful during development but are not a commercial uptime guarantee.

Before public launch:

- [ ] Configure a paid primary AI model/provider with sufficient quota.
- [ ] Keep at least one independently configured fallback provider.
- [ ] Set `AI_REQUIRE_ZDR=true` only when the selected AI Gateway/provider plan supports hard zero-data-retention routing; the default still denies provider data collection without making unsupported Hobby-plan requests.
- [ ] Exercise text, image, buyer, seller, and admin flows against the release candidate.
- [ ] Verify provider billing/usage alerts and rate-limit behavior without exposing provider keys to the browser.

## GitHub release controls

- [ ] Protect `main` with a repository ruleset/branch protection rule.
- [ ] Require the CI `verify` job before merge.
- [ ] Block force pushes and branch deletion on `main`.
- [ ] Prefer pull-request merges for production changes.
- [ ] Enable verified commit/tag signing for the organization accounts used for releases.

## Marketplace trust and content

Do not seed fake ratings, purchases, sellers, or inventory for launch metrics.

- [ ] Import/verify the acquiring company's real stores and inventory.
- [ ] Confirm product images, prices, stock, fitment, and contact information before publishing.
- [ ] Approve seller verification only after the real verification workflow is completed.
- [ ] Let reviews and completion statistics come from real eligible transactions.

## Legal and customer operations

- [ ] Have the acquiring company's Egyptian legal/compliance team approve the final Terms, Privacy, and Returns wording and company identity/contact details.
- [ ] Confirm the operational return/refund process can actually satisfy the rights stated on the site.
- [ ] Ensure at least one real admin account receives support notifications and operational alerts.
- [ ] Verify support, dispute, moderation, seller-verification, and refund escalation workflows end to end.

## Ownership and secrets

On transfer to the acquiring company:

- [ ] Transfer or recreate the GitHub, Vercel, Supabase, Resend, DNS/domain, and AI-provider resources under company-controlled accounts.
- [ ] Rotate every production secret, API key, signing secret, webhook secret, and database credential after the new owners take control.
- [ ] Remove former developer access that is no longer required.
- [ ] Re-test authentication email, password reset, uploads, checkout, support, AI, webhooks, analytics, and production deployment after rotation.

Never put secret values in this checklist, source control, issues, or deployment logs.
