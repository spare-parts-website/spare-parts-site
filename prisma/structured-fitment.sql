-- Additive structured vehicle fitment expansion.
-- Existing legacy Part.carModels values and all historical records are preserved.

alter table public."Part"
  add column if not exists "universal" boolean not null default false,
  add column if not exists "fitmentNotes" text;

alter table public."VehicleCompatibility"
  add column if not exists "generation" text,
  add column if not exists "engine" text,
  add column if not exists "trim" text,
  add column if not exists "notes" text;

alter table public."UserCar"
  add column if not exists "generation" text,
  add column if not exists "trim" text;

create index if not exists "VehicleCompatibility_make_model_generation_engine_idx"
  on public."VehicleCompatibility" ("make", "model", "generation", "engine");
