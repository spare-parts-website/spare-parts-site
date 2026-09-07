-- Phase 4: database correctness and append-only marketplace ledgers.
-- Additive/rerunnable where practical; application-compatible zero-downtime money migration.

-- Exact EGP minor-unit persistence. Legacy double-precision columns remain as the
-- API projection for now; generated bigint columns are the exact database value
-- used for reconciliation/audit and future client migration.
ALTER TABLE public."Part"
  ADD COLUMN IF NOT EXISTS "priceMinor" bigint
  GENERATED ALWAYS AS (round(("price"::numeric) * 100)::bigint) STORED;

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "totalPriceMinor" bigint
    GENERATED ALWAYS AS (round(("totalPrice"::numeric) * 100)::bigint) STORED,
  ADD COLUMN IF NOT EXISTS "shippingFeeMinor" bigint
    GENERATED ALWAYS AS (round(("shippingFee"::numeric) * 100)::bigint) STORED,
  ADD COLUMN IF NOT EXISTS "discountMinor" bigint
    GENERATED ALWAYS AS (round(("discount"::numeric) * 100)::bigint) STORED;

ALTER TABLE public."OrderItem"
  ADD COLUMN IF NOT EXISTS "unitPriceMinor" bigint
    GENERATED ALWAYS AS (round(("unitPrice"::numeric) * 100)::bigint) STORED,
  ADD COLUMN IF NOT EXISTS "discountMinor" bigint
    GENERATED ALWAYS AS (round(("discount"::numeric) * 100)::bigint) STORED,
  ADD COLUMN IF NOT EXISTS "itemTotalMinor" bigint
    GENERATED ALWAYS AS (round(("itemTotal"::numeric) * 100)::bigint) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Part_price_piastres_chk') THEN
    ALTER TABLE public."Part" ADD CONSTRAINT "Part_price_piastres_chk"
      CHECK ("price"::numeric = round("price"::numeric, 2)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_money_piastres_chk') THEN
    ALTER TABLE public."Order" ADD CONSTRAINT "Order_money_piastres_chk"
      CHECK (
        "totalPrice"::numeric = round("totalPrice"::numeric, 2)
        AND "shippingFee"::numeric = round("shippingFee"::numeric, 2)
        AND "discount"::numeric = round("discount"::numeric, 2)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_money_piastres_chk') THEN
    ALTER TABLE public."OrderItem" ADD CONSTRAINT "OrderItem_money_piastres_chk"
      CHECK (
        "unitPrice"::numeric = round("unitPrice"::numeric, 2)
        AND "discount"::numeric = round("discount"::numeric, 2)
        AND "itemTotal"::numeric = round("itemTotal"::numeric, 2)
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public."Part" VALIDATE CONSTRAINT "Part_price_piastres_chk";
ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_money_piastres_chk";
ALTER TABLE public."OrderItem" VALIDATE CONSTRAINT "OrderItem_money_piastres_chk";

-- True workflow states are enforced in PostgreSQL as a final authority. Avoid
-- enum-izing marketplace taxonomy fields such as Part.condition.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_target_type_chk') THEN
    ALTER TABLE public."Report" ADD CONSTRAINT "Report_target_type_chk"
      CHECK ("targetType" IN ('part','store','user')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_status_chk') THEN
    ALTER TABLE public."Report" ADD CONSTRAINT "Report_status_chk"
      CHECK ("status" IN ('OPEN','REVIEWED','DISMISSED','BLOCKED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dispute_type_chk') THEN
    ALTER TABLE public."Dispute" ADD CONSTRAINT "Dispute_type_chk"
      CHECK ("type" IN ('RETURN','WRONG_ITEM','DAMAGED','DELIVERY','OTHER')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dispute_status_chk') THEN
    ALTER TABLE public."Dispute" ADD CONSTRAINT "Dispute_status_chk"
      CHECK ("status" IN ('OPEN','RESOLVED_BUYER','RESOLVED_SELLER','REJECTED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SellerVerification_status_chk') THEN
    ALTER TABLE public."SellerVerification" ADD CONSTRAINT "SellerVerification_status_chk"
      CHECK ("status" IN ('PENDING','APPROVED','REJECTED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_payment_method_chk') THEN
    ALTER TABLE public."Order" ADD CONSTRAINT "Order_payment_method_chk"
      CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('cod','card','online')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public."Report" VALIDATE CONSTRAINT "Report_target_type_chk";
ALTER TABLE public."Report" VALIDATE CONSTRAINT "Report_status_chk";
ALTER TABLE public."Dispute" VALIDATE CONSTRAINT "Dispute_type_chk";
ALTER TABLE public."Dispute" VALIDATE CONSTRAINT "Dispute_status_chk";
ALTER TABLE public."SellerVerification" VALIDATE CONSTRAINT "SellerVerification_status_chk";
ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_payment_method_chk";

-- A reporter may have one active report for a target, while resolved history is
-- allowed to accumulate. The old status-inclusive unique index incorrectly
-- allowed concurrent active states and blocked future history with the same final status.
DROP INDEX IF EXISTS public."Report_reporterId_targetType_targetId_status_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Report_one_open_target_per_reporter_key"
  ON public."Report" ("reporterId", "targetType", "targetId")
  WHERE "status" = 'OPEN';
CREATE INDEX IF NOT EXISTS "Report_reporter_target_created_idx"
  ON public."Report" ("reporterId", "targetType", "targetId", "createdAt" DESC, "id" DESC);

-- Structured fitment is authoritative for new writes. Keep the legacy Part.carModels
-- projection for compatibility, but prevent duplicate normalized fitment rows at DB level.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleCompatibility_identity_text_chk') THEN
    ALTER TABLE public."VehicleCompatibility" ADD CONSTRAINT "VehicleCompatibility_identity_text_chk"
      CHECK (
        length(btrim("make")) BETWEEN 1 AND 80
        AND length(btrim("model")) BETWEEN 1 AND 120
        AND ("generation" IS NULL OR length(btrim("generation")) BETWEEN 1 AND 80)
        AND ("engine" IS NULL OR length(btrim("engine")) BETWEEN 1 AND 80)
        AND ("trim" IS NULL OR length(btrim("trim")) BETWEEN 1 AND 80)
      ) NOT VALID;
  END IF;
END
$$;
ALTER TABLE public."VehicleCompatibility" VALIDATE CONSTRAINT "VehicleCompatibility_identity_text_chk";

CREATE UNIQUE INDEX IF NOT EXISTS "VehicleCompatibility_normalized_identity_key"
  ON public."VehicleCompatibility" (
    "partId",
    lower(btrim("make")),
    lower(btrim("model")),
    lower(btrim(coalesce("generation", ''))),
    coalesce("yearFrom", -1),
    coalesce("yearTo", -1),
    lower(btrim(coalesce("engine", ''))),
    lower(btrim(coalesce("trim", '')))
  );

-- Append-only inventory history. IDs are intentionally historical references rather
-- than foreign keys so account/product retention operations cannot mutate ledger rows.
CREATE TABLE IF NOT EXISTS public."InventoryLedger" (
  "id" text PRIMARY KEY,
  "partId" text NOT NULL,
  "orderId" text,
  "orderItemId" text,
  "actorId" text,
  "eventType" text NOT NULL,
  "delta" integer NOT NULL,
  "stockAfter" integer NOT NULL,
  "idempotencyKey" text NOT NULL UNIQUE,
  "metadata" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "InventoryLedger_event_type_chk" CHECK ("eventType" IN ('RESERVED','RESTORED','ADJUSTMENT','IMPORT')),
  CONSTRAINT "InventoryLedger_delta_chk" CHECK ("delta" <> 0),
  CONSTRAINT "InventoryLedger_stock_after_chk" CHECK ("stockAfter" >= 0)
);
CREATE INDEX IF NOT EXISTS "InventoryLedger_part_created_idx" ON public."InventoryLedger" ("partId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "InventoryLedger_order_created_idx" ON public."InventoryLedger" ("orderId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."PaymentLedger" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL,
  "actorId" text,
  "eventType" text NOT NULL,
  "amountMinor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'EGP',
  "paymentMethod" text,
  "paymentStatus" text NOT NULL,
  "idempotencyKey" text NOT NULL UNIQUE,
  "metadata" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PaymentLedger_event_type_chk" CHECK ("eventType" IN ('PAID','REFUNDED')),
  CONSTRAINT "PaymentLedger_amount_chk" CHECK ("amountMinor" >= 0),
  CONSTRAINT "PaymentLedger_currency_chk" CHECK ("currency" = 'EGP'),
  CONSTRAINT "PaymentLedger_status_chk" CHECK ("paymentStatus" IN ('PAID','REFUNDED'))
);
CREATE INDEX IF NOT EXISTS "PaymentLedger_order_created_idx" ON public."PaymentLedger" ("orderId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION public.reject_marketplace_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'marketplace ledgers are append-only';
END;
$$;

DROP TRIGGER IF EXISTS "InventoryLedger_append_only" ON public."InventoryLedger";
CREATE TRIGGER "InventoryLedger_append_only"
  BEFORE UPDATE OR DELETE ON public."InventoryLedger"
  FOR EACH ROW EXECUTE FUNCTION public.reject_marketplace_ledger_mutation();

DROP TRIGGER IF EXISTS "PaymentLedger_append_only" ON public."PaymentLedger";
CREATE TRIGGER "PaymentLedger_append_only"
  BEFORE UPDATE OR DELETE ON public."PaymentLedger"
  FOR EACH ROW EXECUTE FUNCTION public.reject_marketplace_ledger_mutation();

-- Capture stock changes at the database boundary so every code path (checkout,
-- dispute resolution, seller edits, CSV import, or future admin tooling) is audited.
CREATE OR REPLACE FUNCTION public.record_inventory_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  event_id text := gen_random_uuid()::text;
BEGIN
  IF NEW."stock" IS DISTINCT FROM OLD."stock" THEN
    INSERT INTO public."InventoryLedger" (
      "id", "partId", "eventType", "delta", "stockAfter", "idempotencyKey", "metadata"
    ) VALUES (
      event_id,
      NEW."id",
      'ADJUSTMENT',
      NEW."stock" - OLD."stock",
      NEW."stock",
      'stock-change:' || event_id,
      jsonb_build_object('source', 'Part.stock trigger')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Part_inventory_ledger" ON public."Part";
CREATE TRIGGER "Part_inventory_ledger"
  AFTER UPDATE OF "stock" ON public."Part"
  FOR EACH ROW
  WHEN (OLD."stock" IS DISTINCT FROM NEW."stock")
  EXECUTE FUNCTION public.record_inventory_stock_change();

-- Payment business-state changes are also captured centrally. This records state
-- transitions only; it does not pretend a PSP charge/refund occurred.
CREATE OR REPLACE FUNCTION public.record_order_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus"
     AND NEW."paymentStatus" IN ('PAID', 'REFUNDED') THEN
    INSERT INTO public."PaymentLedger" (
      "id", "orderId", "eventType", "amountMinor", "currency", "paymentMethod",
      "paymentStatus", "idempotencyKey", "metadata"
    ) VALUES (
      gen_random_uuid()::text,
      NEW."id",
      NEW."paymentStatus",
      NEW."totalPriceMinor",
      'EGP',
      NEW."paymentMethod",
      NEW."paymentStatus",
      'order:' || NEW."id" || ':payment:' || NEW."paymentStatus",
      jsonb_build_object('source', 'Order.paymentStatus trigger', 'previousStatus', OLD."paymentStatus")
    )
    ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Order_payment_ledger" ON public."Order";
CREATE TRIGGER "Order_payment_ledger"
  AFTER UPDATE OF "paymentStatus" ON public."Order"
  FOR EACH ROW
  WHEN (OLD."paymentStatus" IS DISTINCT FROM NEW."paymentStatus")
  EXECUTE FUNCTION public.record_order_payment_change();

ALTER TABLE public."InventoryLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PaymentLedger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."InventoryLedger" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."PaymentLedger" FROM PUBLIC, anon, authenticated;
