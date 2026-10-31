alter table public.trade_listings add column if not exists trader_handle text;

create or replace function public.create_trade_listing(
  p_offer_items jsonb,
  p_want_items jsonb,
  p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_identity auth.identities%rowtype;
  v_provider text;
  v_identity_data jsonb;
  v_trader_name text;
  v_avatar_url text;
  v_profile_url text;
  v_trader_handle text;
  v_roblox_display_name text;
  v_roblox_username text;
  v_roblox_avatar_url text;
  v_roblox_profile_url text;
  v_listing_id uuid;
  v_count integer;
  v_valid_count integer;
  v_is_admin boolean := coalesce((select public.is_turbo_admin()), false);
  v_admin_role text;
  v_admin_display_name text;
  v_admin_title text;
  v_admin_title_color text;
begin
  if v_user_id is null then
    raise exception 'sign in with Roblox or Discord before posting a trade' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_offer_items), '') <> 'array'
     or coalesce(jsonb_array_length(p_offer_items), 0) not between 1 and 9
     or coalesce(jsonb_typeof(p_want_items), '') <> 'array'
     or coalesce(jsonb_array_length(p_want_items), 0) not between 1 and 9 then
    raise exception 'choose between 1 and 9 items on both sides of the trade' using errcode = '22023';
  end if;
  if length(coalesce(p_message, '')) > 300 then
    raise exception 'trade message must be 300 characters or fewer' using errcode = '22023';
  end if;

  select i.* into v_identity
  from auth.identities as i
  where i.user_id = v_user_id and i.provider in ('discord', 'custom:roblox')
  order by case i.provider when 'custom:roblox' then 0 else 1 end
  limit 1;
  if not found then
    raise exception 'link a Roblox or Discord account before posting a trade' using errcode = '42501';
  end if;

  v_provider := v_identity.provider;
  v_identity_data := coalesce(v_identity.identity_data, '{}'::jsonb);
  v_trader_name := left(btrim(coalesce(
    v_identity_data ->> 'preferred_username', v_identity_data ->> 'username',
    v_identity_data ->> 'user_name', v_identity_data ->> 'name',
    v_identity_data ->> 'full_name', v_identity_data ->> 'global_name'
  )), 80);
  v_trader_handle := left(btrim(coalesce(
    v_identity_data ->> 'preferred_username', v_identity_data ->> 'username',
    v_identity_data ->> 'user_name', v_identity_data ->> 'global_name'
  )), 80);
  if coalesce(v_trader_name, '') = '' then
    raise exception 'the linked account did not provide a public username' using errcode = '22023';
  end if;

  v_avatar_url := coalesce(v_identity_data ->> 'avatar_url', v_identity_data ->> 'picture');
  if v_avatar_url !~ '^https://' then v_avatar_url := null; end if;
  if v_provider = 'custom:roblox' and v_identity.provider_id ~ '^[0-9]+$' then
    v_profile_url := 'https://www.roblox.com/users/' || v_identity.provider_id || '/profile';
  elsif v_provider = 'discord' and v_identity.provider_id ~ '^[0-9]+$' then
    v_profile_url := 'https://discord.com/users/' || v_identity.provider_id;
  end if;

  if v_provider = 'custom:roblox' then
    select p.roblox_display_name, p.roblox_username, p.roblox_avatar_url, p.roblox_profile_url
      into v_roblox_display_name, v_roblox_username, v_roblox_avatar_url, v_roblox_profile_url
    from public.trade_profiles as p where p.user_id = v_user_id;
    if found then
      v_trader_name := left(coalesce(nullif(btrim(v_roblox_display_name), ''), v_trader_name), 80);
      v_trader_handle := left(coalesce(nullif(btrim(v_roblox_username), ''), v_trader_handle), 80);
      v_avatar_url := coalesce(v_roblox_avatar_url, v_avatar_url);
      v_profile_url := coalesce(v_roblox_profile_url, v_profile_url);
    end if;
  end if;

  if v_is_admin then
    select a.role, a.display_name, a.title, a.title_color
      into v_admin_role, v_admin_display_name, v_admin_title, v_admin_title_color
    from private.admin_accounts as a
    where a.user_id = v_user_id and a.status = 'active'
      and not a.must_change_password;
    v_is_admin := found;
  end if;

  insert into public.trade_listings (
    user_id, identity_provider, identity_provider_id, trader_name,
    trader_avatar_url, trader_profile_url, trader_handle, message, trader_is_admin,
    trader_admin_role, trader_admin_display_name, trader_admin_title,
    trader_admin_title_color
  ) values (
    v_user_id, v_provider, v_identity.provider_id, v_trader_name,
    v_avatar_url, v_profile_url, nullif(v_trader_handle, ''), btrim(coalesce(p_message, '')), v_is_admin,
    case when v_is_admin then v_admin_role end,
    case when v_is_admin then v_admin_display_name end,
    case when v_is_admin then v_admin_title end,
    case when v_is_admin then v_admin_title_color end
  ) returning id into v_listing_id;

  for v_provider in select unnest(array['offer', 'want']) loop
    if v_provider = 'offer' then v_identity_data := p_offer_items;
    else v_identity_data := p_want_items; end if;
    select count(*)::integer, count(distinct (entry ->> 'item_id'))::integer
      into v_count, v_valid_count
    from jsonb_array_elements(v_identity_data) as elements(entry)
    where (entry ->> 'item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (entry ->> 'quantity') ~ '^[0-9]{1,2}$'
      and (entry ->> 'quantity')::integer between 1 and 99;
    if v_count <> jsonb_array_length(v_identity_data) or v_valid_count <> v_count then
      raise exception 'trade items contain an invalid item or quantity' using errcode = '22023';
    end if;
    select count(*)::integer into v_valid_count
    from jsonb_array_elements(v_identity_data) as elements(entry)
    join public.items as item on item.id = (entry ->> 'item_id')::uuid;
    if v_valid_count <> v_count then
      raise exception 'one or more selected items no longer exist' using errcode = '22023';
    end if;
    insert into public.trade_listing_items (listing_id, side, item_id, quantity)
    select v_listing_id, v_provider, (entry ->> 'item_id')::uuid, (entry ->> 'quantity')::integer
    from jsonb_array_elements(v_identity_data) as elements(entry);
  end loop;
  return v_listing_id;
end;
$$;


revoke all on function public.create_trade_listing(jsonb, jsonb, text) from public, anon;
grant execute on function public.create_trade_listing(jsonb, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
