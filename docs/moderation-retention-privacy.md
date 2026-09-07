# Moderation, retention and privacy

Critical moderation actions require an authenticated administrator, recent MFA step-up, an audit event, and a reason where the action changes marketplace visibility or resolves a dispute. Verification decisions must remain atomic with Store verification state.

Retention defaults: temporary security challenges and temporary uploads are short lived; processed email/webhook queue history is retained only for operational troubleshooting; AI data follows its configured expiry; verification/dispute evidence is retained only for the business/legal period defined before launch. Cleanup jobs must mark private objects for deletion and reconcile Storage failures rather than silently abandoning them.

Privacy requests must support an authenticated data export and account deletion/archive workflow. Transactional order/audit records that must be retained are minimized and archived instead of destructively cascading. Private media is never made public to simplify deletion.
