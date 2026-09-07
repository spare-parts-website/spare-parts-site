# Ghyar Market architecture

Ghyar Market is a Next.js App Router marketplace. Browser traffic reaches Next.js server routes; Prisma uses the pooled PostgreSQL runtime connection. Supabase Data API table access remains deny-by-default. Public media is constrained to this project's Storage host; sensitive media stays in the private `protected-uploads` bucket.

Core invariants: server-authoritative checkout pricing, atomic inventory claims, idempotent checkout IDs, immutable OrderItem snapshots, verified-purchase reviews, strict nonce CSP, cross-origin mutation protection, admin MFA/step-up, and durable outboxes for asynchronous side effects.

Large read models must use deterministic cursor pagination and slim list DTOs. Detail routes may load timelines, messages or private identity only after authorization. Marketplace search ranks candidates in PostgreSQL and fetches details only for the selected page.
