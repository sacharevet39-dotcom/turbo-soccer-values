alter table public.items
  add column if not exists variant_parent_id uuid references public.items(id) on delete cascade,
  add column if not exists variant_color_name text,
  add column if not exists variant_color_hex text;

alter table public.items
  drop constraint if exists items_variant_fields_check,
  add constraint items_variant_fields_check check (
    (variant_parent_id is null and variant_color_name is null and variant_color_hex is null)
    or
    (variant_parent_id is not null
      and variant_color_name is not null
      and length(btrim(variant_color_name)) between 1 and 32
      and variant_color_hex ~ '^#[0-9A-Fa-f]{6}$')
  );

create index if not exists items_variant_parent_idx on public.items(variant_parent_id) where variant_parent_id is not null;
create unique index if not exists items_variant_color_name_unique on public.items(variant_parent_id, lower(variant_color_name)) where variant_parent_id is not null;

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  reward text not null check (length(btrim(reward)) between 1 and 200),
  is_expired boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists promo_codes_code_unique on public.promo_codes(upper(code));
alter table public.promo_codes enable row level security;
grant select on public.promo_codes to anon, authenticated;
grant insert, update, delete on public.promo_codes to authenticated;
drop policy if exists "Promo codes are publicly readable" on public.promo_codes;
create policy "Promo codes are publicly readable" on public.promo_codes for select to anon, authenticated using (true);
drop policy if exists "Admins manage promo codes" on public.promo_codes;
create policy "Admins manage promo codes" on public.promo_codes for all to authenticated
using ((select public.is_turbo_admin()))
with check ((select public.is_turbo_admin()));

insert into public.promo_codes(code, reward, is_expired, sort_order)
values
 ('85KLIKES', 'Two Epic Packs (new!)', false, 1),
 ('BETA', 'An Epic Pack', false, 2),
 ('BONUS10', '+10% coins on your next coin purchase', false, 3),
 ('PACK', 'An Exclusive Pack', false, 4)
on conflict do nothing;

create or replace function public.turbo_create_item_with_variants(p_item jsonb, p_variants jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_item_name text;
  v_value bigint;
  v_image_path text;
  v_category text;
  v_rarity text;
  v_description text;
  v_demand smallint;
  v_variant jsonb;
  v_color_name text;
  v_color_hex text;
  v_child_name text;
begin
  if not (select public.is_turbo_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_item) <> 'object' or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Invalid item or variants payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_variants) not between 1 and 15 then
    raise exception 'Choose between 1 and 15 color variants' using errcode = '22023';
  end if;

  v_item_name := btrim(p_item ->> 'name');
  if v_item_name is null or length(v_item_name) not between 1 and 100 then
    raise exception 'Item name must be between 1 and 100 characters' using errcode = '22023';
  end if;
  v_value := nullif(p_item ->> 'value', '')::bigint;
  v_image_path := nullif(p_item ->> 'image_path', '');
  v_category := nullif(btrim(p_item ->> 'category'), '');
  v_rarity := nullif(btrim(p_item ->> 'rarity'), '');
  v_description := nullif(btrim(p_item ->> 'description'), '');
  v_demand := nullif(p_item ->> 'demand', '')::smallint;

  insert into public.items(name, value, image_path, category, rarity, description, demand)
  values (v_item_name, v_value, v_image_path, v_category, v_rarity, v_description, v_demand)
  returning id into v_parent_id;

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    v_color_name := btrim(v_variant ->> 'name');
    v_color_hex := upper(v_variant ->> 'hex');
    if v_color_name is null or length(v_color_name) not between 1 and 32
      or v_color_hex !~ '^#[0-9A-F]{6}$' then
      raise exception 'Each color needs a name and a valid hex color' using errcode = '22023';
    end if;
    v_child_name := left(v_item_name, greatest(1, 96 - length(v_color_name))) || ' (' || v_color_name || ')';
    insert into public.items(name, value, image_path, category, rarity, description, demand, variant_parent_id, variant_color_name, variant_color_hex)
    values (v_child_name, v_value, v_image_path, v_category, v_rarity, v_description, v_demand, v_parent_id, v_color_name, v_color_hex);
  end loop;
  return v_parent_id;
end;
$$;
revoke all on function public.turbo_create_item_with_variants(jsonb, jsonb) from public, anon;
grant execute on function public.turbo_create_item_with_variants(jsonb, jsonb) to authenticated;
