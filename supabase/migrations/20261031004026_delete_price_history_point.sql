-- Allow an active admin to remove an incorrect history point.
-- When deleting the latest point, restore the item's current value to the
-- latest remaining record without creating a second history event.

create or replace function public.record_item_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('app.skip_item_price_history', true), 'off') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.value is not null then
      insert into public.item_price_history(item_id, value)
      values (new.id, new.value)
      on conflict (item_id, recorded_at, value) do nothing;
    end if;
  elsif new.value is distinct from old.value and new.value is not null then
    insert into public.item_price_history(item_id, value)
    values (new.id, new.value)
    on conflict (item_id, recorded_at, value) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.turbo_delete_item_price_point(
  p_item_id uuid,
  p_history_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_value bigint;
  v_latest_id bigint;
  v_restored_value bigint;
  v_current_changed boolean := false;
begin
  if not coalesce(public.is_turbo_admin(), false) then
    raise exception 'active admin authorization required' using errcode = '42501';
  end if;

  perform 1
  from public.items i
  where i.id = p_item_id
  for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;

  select h.value into v_deleted_value
  from public.item_price_history h
  where h.id = p_history_id and h.item_id = p_item_id
  for update;
  if not found then
    raise exception 'price history point not found' using errcode = 'P0002';
  end if;

  select h.id into v_latest_id
  from public.item_price_history h
  where h.item_id = p_item_id
  order by h.recorded_at desc, h.id desc
  limit 1;

  if v_latest_id = p_history_id then
    select h.value into v_restored_value
    from public.item_price_history h
    where h.item_id = p_item_id and h.id <> p_history_id
    order by h.recorded_at desc, h.id desc
    limit 1;
    v_current_changed := true;
  end if;

  delete from public.item_price_history h
  where h.id = p_history_id and h.item_id = p_item_id;

  if v_current_changed then
    perform pg_catalog.set_config('app.skip_item_price_history', 'on', true);
    update public.items i
    set value = v_restored_value
    where i.id = p_item_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'deleted_value', v_deleted_value,
    'current_changed', v_current_changed,
    'current_value', v_restored_value
  );
end;
$$;

revoke all on function public.turbo_delete_item_price_point(uuid, bigint) from public, anon;
grant execute on function public.turbo_delete_item_price_point(uuid, bigint) to authenticated;

notify pgrst, 'reload schema';
