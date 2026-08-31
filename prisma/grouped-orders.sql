-- Additive grouped-order architecture for Ghyar Market.
-- Existing Order rows stay as the seller-level order records. Each historical
-- row receives one snapshot item; new checkouts can attach multiple items from
-- the same store to one Order without changing or deleting old relationships.

create table if not exists public."OrderItem" (
  "id" text primary key,
  "orderId" text not null references public."Order"("id") on delete cascade,
  "partId" text references public."Part"("id") on delete set null,
  "productName" text not null,
  "productImage" text,
  "unitPrice" double precision not null,
  "quantity" integer not null,
  "discount" double precision not null default 0,
  "itemTotal" double precision not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "OrderItem_quantity_check" check ("quantity" > 0),
  constraint "OrderItem_unitPrice_check" check ("unitPrice" >= 0),
  constraint "OrderItem_discount_check" check ("discount" >= 0),
  constraint "OrderItem_itemTotal_check" check ("itemTotal" >= 0)
);

create index if not exists "OrderItem_orderId_idx" on public."OrderItem"("orderId");
create index if not exists "OrderItem_partId_idx" on public."OrderItem"("partId");

insert into public."OrderItem" (
  "id",
  "orderId",
  "partId",
  "productName",
  "productImage",
  "unitPrice",
  "quantity",
  "discount",
  "itemTotal",
  "createdAt"
)
select
  gen_random_uuid()::text,
  order_row."id",
  order_row."partId",
  part."name",
  part."image",
  case
    when order_row."quantity" > 0 then greatest(
      0,
      (order_row."totalPrice" - order_row."shippingFee" + order_row."discount") / order_row."quantity"
    )
    else greatest(0, part."price")
  end,
  greatest(1, order_row."quantity"),
  greatest(0, order_row."discount"),
  greatest(0, order_row."totalPrice" - order_row."shippingFee"),
  order_row."createdAt"
from public."Order" as order_row
join public."Part" as part on part."id" = order_row."partId"
where not exists (
  select 1 from public."OrderItem" as existing where existing."orderId" = order_row."id"
);

alter table public."OrderItem" enable row level security;
revoke all on table public."OrderItem" from anon, authenticated;
