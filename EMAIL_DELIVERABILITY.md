# Ghyar Market email deliverability

Last audited: 2026-09-02

This document records the safe, standards-based deliverability setup. Provider acceptance or a `delivered` event is not an Inbox-placement guarantee; Gmail, Outlook, Yahoo, and other mailbox providers make that decision.

## Authentication audit

- **SPF:** Resend reports the verified custom return-path (`send.ghyarmarket-eg.com`) with `v=spf1 include:amazonses.com ~all` and the matching SES feedback MX. No second SPF record was found at that hostname.
- **DKIM:** Resend reports the `resend._domainkey.ghyarmarket-eg.com` record as verified. The key is intentionally not copied into source control or documentation.
- **DMARC:** `_dmarc.ghyarmarket-eg.com` currently publishes `v=DMARC1; p=none; adkim=s; aspf=r; pct=100`. This is a monitoring policy and has no invented reporting mailbox. Add `rua` only after a monitored mailbox is deliberately provisioned.
- **Alignment:** Resend's verified DKIM domain is the organizational domain and the custom MAIL FROM is its `send` subdomain, so relaxed SPF alignment is expected and strict DKIM alignment is configured. Re-check alignment in provider headers when a new sender is introduced.
- **Tracking:** Resend open and click tracking are disabled. Transactional links are direct HTTPS links on `ghyarmarket-eg.com`.

## Application safeguards

- `getTransactionalSender` accepts only role addresses on `@ghyarmarket-eg.com`; login, password-reset, notification, and support sends use this guard.
- Every email has both a readable plain-text part and lightweight RTL HTML. Templates contain no JavaScript, forms, shortened links, or tracking pixels.
- `EmailDeliveryAttempt` now covers notification, authentication, and support categories with a stable `deliveryKey`, provider ID, recipient snapshot, and lifecycle event ID.
- Signed Resend webhook processing is idempotent and rejects invalid signatures before parsing or database access. Permanent `BOUNCED`, `COMPLAINED`, and `SUPPRESSED` events mark the matching recipient address and stop non-essential future email while preserving in-site notifications. `DELAYED` and `FAILED` do not permanently suppress an address.
- Notification triggers accept stable dedupe keys for order, chat, support, review, dispute, seller-verification, and cart-reminder events. API retries therefore do not create a second outbound message.
- Users can correct their email from the profile after entering their current password. Changing the address clears the old deliverability state; admins can also correct an address or explicitly reactivate it after verification.
- Admins have a delivery dashboard with sent, delivered, delayed, bounced, failed, complained, and provider-suppressed counts plus truthful rates over 7/30/90-day windows. “Delivered” is never labelled as Inbox placement.

## Provider operations status

The provider connection is now configured with exactly one enabled webhook (verified 2026-09-02):

- **Endpoint:** `https://ghyarmarket-eg.com/api/webhooks/resend`
- **Webhook ID:** `83ec3c8f-9934-482a-a531-595a2a002aed`
- **Events:** `email.sent`, `email.scheduled`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.complained`, and `email.suppressed`
- **Signing secret:** stored as the hidden `RESEND_WEBHOOK_SECRET` variable in Vercel Preview and Production. It is not in source control, browser code, or this document.

The endpoint verifies the raw-body signature before JSON parsing or database access, returns a safe success for duplicate/stale events, and records unmatched provider events without creating a user record. The old production deployment did not contain this secret; a new production deployment is required before relying on live callbacks.

The following provider-operations checks remain outstanding and should be completed with disposable/seed recipients only:

1. Send one authorized test message and verify a signed lifecycle event updates its matching `EmailDeliveryAttempt` exactly once.
2. Run seed inbox checks against Gmail, Outlook, and Yahoo, recording Inbox/Spam placement separately from Resend `delivered`.
3. Configure Google Postmaster Tools and add a monitored DMARC `rua` mailbox only after that mailbox is provisioned.
4. Add a verified `SUPPORT_EMAIL` recipient and valid notification sender in Vercel before enabling support/admin email flows. Never use a guessed or personal address.

## Reputation monitoring

Google Postmaster Tools is not configured by this repository. To configure it safely, add `ghyarmarket-eg.com` at [Google Postmaster Tools](https://postmaster.google.com/), copy the TXT verification record Google generates for the account, add that exact record in Vercel DNS, and complete verification. Do not invent a verification value. Monitor domain reputation, spam rate, authentication, and delivery errors.

For Microsoft recipients, consider Microsoft SNDS/JMRP only after the relevant Microsoft account and IP/domain data are available. Continue natural transactional sending, avoid sudden volume spikes, and suppress clearly invalid addresses.
