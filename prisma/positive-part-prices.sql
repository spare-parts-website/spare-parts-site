begin;

-- Preserve the existing test listings and all relationships; correct only price.
update public."Part"
set "price" = case "id"
  when 'cmsky6ity0001js04teqs3e7p' then 35000
  when 'cmtegvpf70001l904429bhrpr' then 4500
  when 'cmtejaahu0001jg04pnje5wrl' then 7000
  else "price"
end
where "id" in (
  'cmsky6ity0001js04teqs3e7p',
  'cmtegvpf70001l904429bhrpr',
  'cmtejaahu0001jg04pnje5wrl'
)
and "price" <= 0;

do $$
begin
  if exists (select 1 from public."Part" where "price" <= 0) then
    raise exception 'Cannot add positive price constraint while invalid Part rows remain';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Part_price_positive_check'
      and conrelid = 'public."Part"'::regclass
  ) then
    alter table public."Part"
      add constraint "Part_price_positive_check" check ("price" > 0);
  end if;
end
$$;

commit;
