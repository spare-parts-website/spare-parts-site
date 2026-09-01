-- Preserve existing preset avatar choices while moving database references to
-- the optimized WebP copies. The legacy paths remain rewrite-compatible for
-- old browser caches/bookmarks.
begin;
update public."User" set "avatar" = '/profile-avatars/classic-car.webp' where "avatar" = '/profile-avatars/classic-car.png';
update public."User" set "avatar" = '/profile-avatars/electric-car.webp' where "avatar" = '/profile-avatars/electric-car.png';
update public."User" set "avatar" = '/profile-avatars/fuel-gauge-car.webp' where "avatar" = '/profile-avatars/fuel-gauge-car.png';
update public."User" set "avatar" = '/profile-avatars/turbocharger.webp' where "avatar" = '/profile-avatars/turbocharger.png';
commit;
