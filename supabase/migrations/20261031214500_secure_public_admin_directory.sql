-- Replace the SECURITY DEFINER view over private tables with a fixed, read-only
-- function that returns only the fields needed for the public team directory.
create or replace function public.get_turbo_admin_profiles()
returns table (
  display_name text,
  title text,
  title_color text,
  online boolean,
  role text,
  roblox_user_id text,
  roblox_username text,
  roblox_display_name text,
  roblox_profile_url text,
  roblox_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.display_name::text, a.title::text, a.title_color::text,
         (a.last_seen > pg_catalog.now() - interval '90 seconds'),
         a.role::text,
         p.roblox_user_id, p.roblox_username, p.roblox_display_name,
         p.roblox_profile_url, p.roblox_avatar_url
  from private.admin_accounts as a
  left join public.trade_profiles as p on p.user_id = a.user_id
  where a.status = 'active'
  order by a.display_name;
$$;

revoke all on function public.get_turbo_admin_profiles() from public;
grant execute on function public.get_turbo_admin_profiles() to anon, authenticated;

drop view public.turbo_admin_profiles;
notify pgrst, 'reload schema';
