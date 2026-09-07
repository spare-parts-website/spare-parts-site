-- Phase 4 follow-up: normalize every persisted EGP projection to piastre precision
-- before the exact generated minor-unit columns and CHECK constraints observe it.
-- This protects against JavaScript binary floating-point artifacts such as
-- 0.1 + 0.2 while keeping the public API number-shaped during the zero-downtime rollout.

CREATE OR REPLACE FUNCTION public.normalize_part_money_to_piastres()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW."price" := round(NEW."price"::numeric, 2)::double precision;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Part_normalize_money" ON public."Part";
CREATE TRIGGER "Part_normalize_money"
  BEFORE INSERT OR UPDATE ON public."Part"
  FOR EACH ROW EXECUTE FUNCTION public.normalize_part_money_to_piastres();

CREATE OR REPLACE FUNCTION public.normalize_order_money_to_piastres()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW."totalPrice" := round(NEW."totalPrice"::numeric, 2)::double precision;
  NEW."shippingFee" := round(NEW."shippingFee"::numeric, 2)::double precision;
  NEW."discount" := round(NEW."discount"::numeric, 2)::double precision;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Order_normalize_money" ON public."Order";
CREATE TRIGGER "Order_normalize_money"
  BEFORE INSERT OR UPDATE ON public."Order"
  FOR EACH ROW EXECUTE FUNCTION public.normalize_order_money_to_piastres();

CREATE OR REPLACE FUNCTION public.normalize_order_item_money_to_piastres()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW."unitPrice" := round(NEW."unitPrice"::numeric, 2)::double precision;
  NEW."discount" := round(NEW."discount"::numeric, 2)::double precision;
  NEW."itemTotal" := round(NEW."itemTotal"::numeric, 2)::double precision;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "OrderItem_normalize_money" ON public."OrderItem";
CREATE TRIGGER "OrderItem_normalize_money"
  BEFORE INSERT OR UPDATE ON public."OrderItem"
  FOR EACH ROW EXECUTE FUNCTION public.normalize_order_item_money_to_piastres();
