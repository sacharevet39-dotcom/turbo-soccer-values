alter table public.items
  add column how_to_obtain text,
  add column is_limited boolean,
  add column is_available boolean,
  add column availability_note text,
  add column event_start date,
  add column event_end date,
  add constraint items_event_period check (event_start <= event_end);

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
  info public.items%rowtype;
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

  select * into info from jsonb_populate_record(null::public.items, jsonb_build_object(
    'how_to_obtain', p_item -> 'how_to_obtain',
    'is_limited', p_item -> 'is_limited',
    'is_available', p_item -> 'is_available',
    'availability_note', p_item -> 'availability_note',
    'event_start', p_item -> 'event_start',
    'event_end', p_item -> 'event_end'));

  insert into public.items(name, value, image_path, category, rarity, description, demand, how_to_obtain, is_limited, is_available, availability_note, event_start, event_end)
  values (v_item_name, v_value, v_image_path, v_category, v_rarity, v_description, v_demand, info.how_to_obtain, info.is_limited, info.is_available, info.availability_note, info.event_start, info.event_end)
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
    insert into public.items(name, value, image_path, category, rarity, description, demand, how_to_obtain, is_limited, is_available, availability_note, event_start, event_end, variant_parent_id, variant_color_name, variant_color_hex)
    values (v_child_name, v_value, v_image_path, v_category, v_rarity, v_description, v_demand, info.how_to_obtain, info.is_limited, info.is_available, info.availability_note, info.event_start, info.event_end, v_parent_id, v_color_name, v_color_hex);
  end loop;
  return v_parent_id;
end;
$$;

revoke all on function public.turbo_create_item_with_variants(jsonb, jsonb) from public, anon;
grant execute on function public.turbo_create_item_with_variants(jsonb, jsonb) to authenticated;

-- Match filename stems with case, whitespace and apostrophe normalization.
-- Refuse ambiguous names. Existing catalogue names and prices are preserved.
do $$
declare
  artwork record;
  item_name text;
  matches uuid[];
  note constant text := 'No longer obtainable since the Halloween event ended.';
begin
  for artwork in select * from (values
    ('Pumpkin wheel.png', 'Halloween Werewolf Bundle'),
    ('Witches'' Night.png', 'Halloween Werewolf Bundle'),
    ('Haunted Syrup.png', 'Halloween Werewolf Bundle'),
    ('Reaper''s side.png', 'Halloween Pass'),
    ('Bat king.png', 'Halloween Pass')
  ) files(filename, origin) loop
    item_name := left(artwork.filename, -4);
    select array_agg(id) into matches from public.items
      where lower(regexp_replace(btrim(translate(name, '’‘', '''''')), '[[:space:]]+', ' ', 'g')) = lower(item_name);
    if cardinality(matches) > 1 then raise exception 'Ambiguous catalogue name: %', item_name; end if;
    if matches is null then
      insert into public.items(name, image_path, how_to_obtain, is_limited, is_available, availability_note)
      values (item_name, '/catalog/halloween/' || artwork.filename, artwork.origin, true, false, note);
    else
      update public.items set image_path = '/catalog/halloween/' || artwork.filename,
        how_to_obtain = artwork.origin, is_limited = true, is_available = false, availability_note = note
      where id = matches[1];
    end if;
  end loop;
end;
$$;
