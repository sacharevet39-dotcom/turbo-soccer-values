-- Allow demand ratings to use half-star increments while preserving existing values.
alter table public.items
  alter column demand type numeric(2, 1) using demand::numeric(2, 1);

alter table public.items
  drop constraint if exists items_demand_check,
  drop constraint if exists items_demand_half_star_check,
  add constraint items_demand_half_star_check
    check (demand is null or (demand between 0.5 and 5 and mod(demand * 2, 1) = 0));

comment on column public.items.demand is
  'Optional community demand rating from 0.5 to 5 stars in half-star increments.';

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
  v_demand numeric(2, 1);
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
  v_demand := nullif(p_item ->> 'demand', '')::numeric(2, 1);

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
