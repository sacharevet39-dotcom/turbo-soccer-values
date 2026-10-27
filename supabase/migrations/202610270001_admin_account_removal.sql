-- Let the OWNER permanently remove a regular admin account through the
-- server-side Supabase Auth Admin API. Preparation suspends the account and
-- revokes its sessions before Auth deletion is attempted, so a failed delete
-- leaves a safely disabled account that the OWNER can retry.

create or replace function public.turbo_owner_prepare_admin_delete(
  p_actor uuid,
  p_target uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_username text;
  v_has_owned_images boolean;
begin
  if not exists (
    select 1 from private.admin_accounts
    where user_id = p_actor and role = 'OWNER' and status = 'active'
  ) then
    raise exception 'owner authorization required' using errcode = '42501';
  end if;
  if p_target = p_actor then
    raise exception 'owner account cannot be deleted' using errcode = '42501';
  end if;

  select username into v_username
  from private.admin_accounts
  where user_id = p_target and role = 'ADMIN'
  for update;
  if not found then
    raise exception 'regular admin not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from storage.objects
    where bucket_id = 'item-images' and owner_id = p_target::text
  ) into v_has_owned_images;

  update private.admin_accounts
  set status = 'suspended',
      must_change_password = true,
      password_change_required_at = clock_timestamp(),
      tokens_valid_after = clock_timestamp(),
      updated_at = now()
  where user_id = p_target and role = 'ADMIN';
  delete from auth.sessions where user_id = p_target;

  insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
  values (
    p_actor,
    p_target,
    'account.deletion_started',
    jsonb_build_object('username', v_username, 'storage_cleanup_required', v_has_owned_images)
  );
  return v_has_owned_images;
end;
$$;

revoke all on function public.turbo_owner_prepare_admin_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_prepare_admin_delete(uuid, uuid) to service_role;
