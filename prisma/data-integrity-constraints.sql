-- Additive, rerunnable integrity guards for production Postgres.
--
-- The application already validates these values at its write boundaries. These
-- constraints make the database the final authority so a future import, admin
-- script, or compromised API path cannot persist impossible marketplace data.
-- NOT VALID keeps the first DDL step short; the explicit VALIDATE statements
-- below still verify every existing row before the migration is considered done.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Part_price_positive_finite_chk') THEN
    ALTER TABLE public."Part"
      ADD CONSTRAINT "Part_price_positive_finite_chk"
      CHECK ("price" > 0 AND "price" = "price" AND "price" < 'Infinity'::double precision)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Part_stock_nonnegative_chk') THEN
    ALTER TABLE public."Part"
      ADD CONSTRAINT "Part_stock_nonnegative_chk"
      CHECK ("stock" >= 0)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_quantity_positive_chk') THEN
    ALTER TABLE public."Order"
      ADD CONSTRAINT "Order_quantity_positive_chk"
      CHECK ("quantity" > 0)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_money_finite_nonnegative_chk') THEN
    ALTER TABLE public."Order"
      ADD CONSTRAINT "Order_money_finite_nonnegative_chk"
      CHECK (
        "totalPrice" >= 0 AND "totalPrice" = "totalPrice" AND "totalPrice" < 'Infinity'::double precision
        AND "shippingFee" >= 0 AND "shippingFee" = "shippingFee" AND "shippingFee" < 'Infinity'::double precision
        AND "discount" >= 0 AND "discount" = "discount" AND "discount" < 'Infinity'::double precision
      )
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_quantity_positive_chk') THEN
    ALTER TABLE public."OrderItem"
      ADD CONSTRAINT "OrderItem_quantity_positive_chk"
      CHECK ("quantity" > 0)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_money_finite_nonnegative_chk') THEN
    ALTER TABLE public."OrderItem"
      ADD CONSTRAINT "OrderItem_money_finite_nonnegative_chk"
      CHECK (
        "unitPrice" >= 0 AND "unitPrice" = "unitPrice" AND "unitPrice" < 'Infinity'::double precision
        AND "itemTotal" >= 0 AND "itemTotal" = "itemTotal" AND "itemTotal" < 'Infinity'::double precision
        AND "discount" >= 0 AND "discount" = "discount" AND "discount" < 'Infinity'::double precision
      )
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_ratings_range_chk') THEN
    ALTER TABLE public."ProductReview"
      ADD CONSTRAINT "ProductReview_ratings_range_chk"
      CHECK (
        "rating" BETWEEN 1 AND 5
        AND ("sellerRating" IS NULL OR "sellerRating" BETWEEN 1 AND 5)
        AND ("packagingRating" IS NULL OR "packagingRating" BETWEEN 1 AND 5)
        AND ("deliveryRating" IS NULL OR "deliveryRating" BETWEEN 1 AND 5)
      )
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreReview_rating_range_chk') THEN
    ALTER TABLE public."StoreReview"
      ADD CONSTRAINT "StoreReview_rating_range_chk"
      CHECK ("rating" BETWEEN 1 AND 5)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Coupon_usage_range_chk') THEN
    ALTER TABLE public."Coupon"
      ADD CONSTRAINT "Coupon_usage_range_chk"
      CHECK (
        "discountPercent" >= 0 AND "discountPercent" <= 100
        AND "discountPercent" = "discountPercent" AND "discountPercent" < 'Infinity'::double precision
        AND "maxUses" > 0 AND "usedCount" >= 0 AND "usedCount" <= "maxUses"
      )
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleCompatibility_year_range_chk') THEN
    ALTER TABLE public."VehicleCompatibility"
      ADD CONSTRAINT "VehicleCompatibility_year_range_chk"
      CHECK (
        ("yearFrom" IS NULL OR "yearFrom" BETWEEN 1886 AND 2100)
        AND ("yearTo" IS NULL OR "yearTo" BETWEEN 1886 AND 2100)
        AND ("yearFrom" IS NULL OR "yearTo" IS NULL OR "yearFrom" <= "yearTo")
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public."Part" VALIDATE CONSTRAINT "Part_price_positive_finite_chk";
ALTER TABLE public."Part" VALIDATE CONSTRAINT "Part_stock_nonnegative_chk";
ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_quantity_positive_chk";
ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_money_finite_nonnegative_chk";
ALTER TABLE public."OrderItem" VALIDATE CONSTRAINT "OrderItem_quantity_positive_chk";
ALTER TABLE public."OrderItem" VALIDATE CONSTRAINT "OrderItem_money_finite_nonnegative_chk";
ALTER TABLE public."ProductReview" VALIDATE CONSTRAINT "ProductReview_ratings_range_chk";
ALTER TABLE public."StoreReview" VALIDATE CONSTRAINT "StoreReview_rating_range_chk";
ALTER TABLE public."Coupon" VALIDATE CONSTRAINT "Coupon_usage_range_chk";
ALTER TABLE public."VehicleCompatibility" VALIDATE CONSTRAINT "VehicleCompatibility_year_range_chk";
