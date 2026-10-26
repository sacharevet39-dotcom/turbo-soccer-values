-- Turbo Soccer Values: private administrator allowlist, public catalogue, and images.
-- Run in the Supabase SQL editor for a new project. This migration does not drop data.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;

create or replace function public.is_turbo_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_turbo_admin() from public, anon;
grant execute on function public.is_turbo_admin() to authenticated;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  value bigint check (value is null or value >= 0),
  image_path text,
  category text check (category is null or length(trim(category)) <= 60),
  rarity text check (rarity is null or length(trim(rarity)) <= 60),
  description text check (description is null or length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists items_name_lower_unique on public.items (lower(name));
create index if not exists items_value_idx on public.items (value desc nulls last, name asc);
create index if not exists items_category_idx on public.items (category) where category is not null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at before update on public.items
for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
revoke all on public.items from public;
grant select on public.items to anon, authenticated;
grant insert, update, delete on public.items to authenticated;

drop policy if exists "Items are publicly readable" on public.items;
create policy "Items are publicly readable" on public.items
for select to anon, authenticated using (true);

drop policy if exists "Only allowlisted admin inserts items" on public.items;
create policy "Only allowlisted admin inserts items" on public.items
for insert to authenticated with check ((select public.is_turbo_admin()));

drop policy if exists "Only allowlisted admin updates items" on public.items;
create policy "Only allowlisted admin updates items" on public.items
for update to authenticated using ((select public.is_turbo_admin()))
with check ((select public.is_turbo_admin()));

drop policy if exists "Only allowlisted admin deletes items" on public.items;
create policy "Only allowlisted admin deletes items" on public.items
for delete to authenticated using ((select public.is_turbo_admin()));

-- Images are public to view, but only an allowlisted administrator can add,
-- replace, or remove objects. Files are capped at 5 MB and common web image types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 5242880, array['image/webp','image/png','image/jpeg','image/gif'])
on conflict (id) do nothing;

drop policy if exists "Only allowlisted admin uploads item images" on storage.objects;
create policy "Only allowlisted admin uploads item images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'item-images' and (select public.is_turbo_admin())
);

drop policy if exists "Only allowlisted admin updates item images" on storage.objects;
create policy "Only allowlisted admin updates item images" on storage.objects
for update to authenticated using (
  bucket_id = 'item-images' and (select public.is_turbo_admin())
) with check (
  bucket_id = 'item-images' and (select public.is_turbo_admin())
);

drop policy if exists "Only allowlisted admin deletes item images" on storage.objects;
create policy "Only allowlisted admin deletes item images" on storage.objects
for delete to authenticated using (
  bucket_id = 'item-images' and (select public.is_turbo_admin())
);
