# Backup and restore drill

At least quarterly, restore the latest Supabase backup into an isolated non-production project. Verify schema/migration history, row counts for users/stores/parts/orders/order items/audit events, private-object metadata, and integrity constraints. Run the application smoke suite against the restored database without sending real email or AI requests. Record recovery point, recovery duration and any manual steps. Never use production private messages, verification documents or addresses for performance testing.
