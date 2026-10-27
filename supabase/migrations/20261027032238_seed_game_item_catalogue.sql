-- Add the supplied Turbo Soccer artwork as editable, unpriced catalogue rows.
-- Existing values and records are preserved; owners/admins can fill these in.
create table if not exists public.admin_hidden_catalog_images (
  image_path text primary key check (image_path like '/catalog/%'),
  hidden_by uuid default auth.uid() references auth.users(id) on delete set null,
  hidden_at timestamptz not null default now()
);
alter table public.admin_hidden_catalog_images enable row level security;
revoke all on public.admin_hidden_catalog_images from public, anon;
grant select, insert, delete on public.admin_hidden_catalog_images to authenticated;
drop policy if exists "Admins can view hidden catalogue images" on public.admin_hidden_catalog_images;
create policy "Admins can view hidden catalogue images" on public.admin_hidden_catalog_images
  for select to authenticated using ((select public.is_turbo_admin()));
drop policy if exists "Admins can hide catalogue images" on public.admin_hidden_catalog_images;
create policy "Admins can hide catalogue images" on public.admin_hidden_catalog_images
  for insert to authenticated with check ((select public.is_turbo_admin()));
drop policy if exists "Admins can restore catalogue images" on public.admin_hidden_catalog_images;
create policy "Admins can restore catalogue images" on public.admin_hidden_catalog_images
  for delete to authenticated using ((select public.is_turbo_admin()));

insert into public.items (name, value, image_path, category, rarity, description)
values
  ('Beta Boost', null, '/catalog/community/beta-boost.webp', 'Boost', 'Beta', null),
  ('Beta Explosion', null, '/catalog/community/beta-explosion.webp', 'Goal Explosion', 'Beta', null),
  ('Beta Player', null, '/catalog/community/beta-joueur.webp', 'Title', 'Beta', null),
  ('Beta Glasses', null, '/catalog/community/beta-lunettes.webp', 'Hat', 'Beta', null),
  ('Mi Bombo', null, '/catalog/community/beta-mi-bombo.webp', 'Horn', 'Beta', null),
  ('Beta Wheel', null, '/catalog/community/beta-roue.webp', 'Wheels', 'Beta', null),
  ('SWAG', null, '/catalog/community/beta-swag.webp', 'Plate', 'Beta', null),
  ('Beta Trail', null, '/catalog/community/beta-trainee.webp', 'Trail', 'Beta', null),
  ('Halloween Flame', null, '/catalog/community/halloween-flamme.webp', null, 'Halloween', null),
  ('Halloween Rain', null, '/catalog/community/halloween-pluie.webp', null, 'Halloween', null),
  ('Halloween Potion', null, '/catalog/community/halloween-potion.webp', null, 'Halloween', null),
  ('Halloween Spell', null, '/catalog/community/halloween-sort.webp', null, 'Halloween', null),
  ('Halloween Zumba', null, '/catalog/community/halloween-zumba.webp', null, 'Halloween', null)
on conflict (lower(name)) do nothing;
