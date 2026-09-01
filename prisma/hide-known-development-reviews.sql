-- Keep development fixtures for audit/history, but use the existing reversible
-- moderation flag so they cannot influence public ratings or counts.
update public."ProductReview" review
set "blocked" = true
from public."User" author
where author."id" = review."userId"
  and lower(trim(author."name")) in ('site admin', 'amr- مطور موقع غيار ماركت', 'amr - مطور موقع غيار ماركت');

update public."StoreReview" review
set "blocked" = true
from public."User" author
where author."id" = review."userId"
  and lower(trim(author."name")) in ('site admin', 'amr- مطور موقع غيار ماركت', 'amr - مطور موقع غيار ماركت');
