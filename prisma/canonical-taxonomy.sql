-- Additive data-quality backfill for the current marketplace taxonomy.
-- The mapping is intentionally limited to values observed in production:
-- whitespace/case variants and unambiguous automotive labels only.
-- No rows are deleted and unknown/custom labels remain recoverable.

begin;

update public."Part"
set "brand" = case lower(trim("brand"))
  when 'bmw' then 'BMW'
  when 'mercedes' then 'Mercedes'
  else regexp_replace(trim("brand"), '\s+', ' ', 'g')
end
where "brand" is not null
  and (lower(trim("brand")) in ('bmw', 'mercedes') or "brand" <> regexp_replace(trim("brand"), '\s+', ' ', 'g'));

update public."Part"
set "category" = case lower(trim("category"))
  when 'car engine' then 'محرك'
  when 'engine' then 'محرك'
  when 'car part' then 'قطع غيار'
  when 'spare part' then 'قطع غيار'
  when 'spare parts' then 'قطع غيار'
  when 'جنوط' then 'جنط'
  when 'اكصدام' then 'اكصدام'
  when 'عداد سيارة' then 'عداد سيارة'
  when 'جنط' then 'جنط'
  else regexp_replace(trim("category"), '\s+', ' ', 'g')
end
where "category" is not null
  and (lower(trim("category")) in ('car engine', 'engine', 'car part', 'spare part', 'spare parts', 'جنوط', 'اكصدام', 'عداد سيارة', 'جنط')
    or "category" <> regexp_replace(trim("category"), '\s+', ' ', 'g'));

update public."Part"
set "condition" = case lower(trim("condition"))
  when 'new' then 'جديد'
  when 'new import' then 'استيراد جديد'
  when 'import new' then 'استيراد جديد'
  when 'used' then 'مستعمل'
  when 'used import' then 'استيراد مستعمل'
  when 'import used' then 'استيراد مستعمل'
  when 'refurbished' then 'مجدد'
  when 'reconditioned' then 'مجدد'
  else regexp_replace(trim("condition"), '\s+', ' ', 'g')
end
where "condition" is not null
  and (lower(trim("condition")) in ('new', 'new import', 'import new', 'used', 'used import', 'import used', 'refurbished', 'reconditioned')
    or "condition" <> regexp_replace(trim("condition"), '\s+', ' ', 'g'));

commit;
