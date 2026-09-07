# Incident response runbook

1. Identify the affected route/provider and preserve request IDs and timestamps; never collect passwords, tokens or private message bodies.
2. Contain: disable the affected integration or mutation path, revoke compromised credentials, and invalidate sessions with `sessionVersion` when account authority may be affected.
3. Check Vercel runtime errors/concurrency, PostgreSQL connections/locks, Resend delivery/webhook state, Storage failures and AI provider health.
4. For commerce incidents, preserve Order/OrderItem/AuditLog/InventoryMovement/PaymentEvent history and never repair totals from client data.
5. Restore service using a tested rollback or forward fix, then verify homepage, marketplace APIs, authentication, checkout authorization and CSP.
6. Document impact, root cause, remediation and follow-up tests.
