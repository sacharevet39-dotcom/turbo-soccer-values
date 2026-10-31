-- Public profiles only need the verified Roblox identity fields. Keep internal
-- Turbo Soccer user IDs and database timestamps private.
revoke all on public.trade_profiles from anon, authenticated;
grant select (
  roblox_user_id,
  roblox_username,
  roblox_display_name,
  roblox_profile_url,
  roblox_avatar_url
) on public.trade_profiles to anon, authenticated;

notify pgrst, 'reload schema';
