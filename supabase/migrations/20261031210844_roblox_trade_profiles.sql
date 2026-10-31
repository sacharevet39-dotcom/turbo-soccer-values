-- Keep public Roblox identity fields sourced from a verified Supabase Auth
-- identity. Clients can read profiles, but can never write their own claims.
create table public.trade_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  roblox_user_id text not null unique check (roblox_user_id ~ '^[0-9]{1,24}$'),
  roblox_username text not null check (length(btrim(roblox_username)) between 1 and 30),
  roblox_display_name text not null check (length(btrim(roblox_display_name)) between 1 and 50),
  roblox_profile_url text not null check (roblox_profile_url ~ '^https://www\.roblox\.com/users/[0-9]{1,24}/profile$'),
  roblox_avatar_url text check (roblox_avatar_url is null or roblox_avatar_url ~ '^https://tr\.rbxcdn\.com/'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trade_profiles enable row level security;
create policy "Anyone can read public trade profiles"
  on public.trade_profiles for select to anon, authenticated
  using (true);

revoke all on public.trade_profiles from anon, authenticated;
grant select on public.trade_profiles to anon, authenticated;

create or replace function public.sync_my_roblox_trade_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_identity_data jsonb;
  v_provider_id text;
  v_roblox_user_id text;
  v_username text;
  v_display_name text;
  v_profile_url text;
  v_avatar_url text;
  v_profile jsonb;
begin
  if v_user_id is null then
    raise exception 'sign in before syncing a Roblox profile' using errcode = '42501';
  end if;

  select coalesce(i.identity_data, '{}'::jsonb), i.provider_id
    into v_identity_data, v_provider_id
  from auth.identities as i
  where i.user_id = v_user_id and i.provider = 'custom:roblox'
  limit 1;

  if not found then
    delete from public.trade_profiles where user_id = v_user_id;
    return null;
  end if;

  v_roblox_user_id := coalesce(v_identity_data ->> 'sub', v_provider_id);
  if v_roblox_user_id !~ '^[0-9]{1,24}$' then
    raise exception 'Roblox did not return a valid user ID' using errcode = '22023';
  end if;

  v_username := nullif(btrim(coalesce(
    v_identity_data ->> 'preferred_username',
    v_identity_data ->> 'nickname',
    v_identity_data ->> 'name'
  )), '');
  v_display_name := nullif(btrim(coalesce(
    v_identity_data ->> 'name',
    v_identity_data ->> 'nickname',
    v_identity_data ->> 'preferred_username'
  )), '');
  if v_username is null or v_display_name is null then
    raise exception 'Roblox did not return a profile name' using errcode = '22023';
  end if;

  v_username := left(v_username, 30);
  v_display_name := left(v_display_name, 50);
  v_profile_url := 'https://www.roblox.com/users/' || v_roblox_user_id || '/profile';
  v_avatar_url := v_identity_data ->> 'picture';
  if coalesce(v_avatar_url, '') !~ '^https://tr\.rbxcdn\.com/' then
    v_avatar_url := null;
  end if;

  insert into public.trade_profiles (
    user_id, roblox_user_id, roblox_username, roblox_display_name,
    roblox_profile_url, roblox_avatar_url, updated_at
  ) values (
    v_user_id, v_roblox_user_id, v_username, v_display_name,
    v_profile_url, v_avatar_url, now()
  )
  on conflict (user_id) do update set
    roblox_user_id = excluded.roblox_user_id,
    roblox_username = excluded.roblox_username,
    roblox_display_name = excluded.roblox_display_name,
    roblox_profile_url = excluded.roblox_profile_url,
    roblox_avatar_url = excluded.roblox_avatar_url,
    updated_at = now();

  select pg_catalog.jsonb_build_object(
    'user_id', profile.user_id,
    'roblox_user_id', profile.roblox_user_id,
    'roblox_username', profile.roblox_username,
    'roblox_display_name', profile.roblox_display_name,
    'roblox_profile_url', profile.roblox_profile_url,
    'roblox_avatar_url', profile.roblox_avatar_url,
    'updated_at', profile.updated_at
  ) into v_profile
  from public.trade_profiles as profile
  where profile.user_id = v_user_id;

  return v_profile;
end;
$$;

revoke all on function public.sync_my_roblox_trade_profile() from public, anon;
grant execute on function public.sync_my_roblox_trade_profile() to authenticated;

notify pgrst, 'reload schema';
