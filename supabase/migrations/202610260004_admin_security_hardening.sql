-- Security hardening for regular-admin sessions, profile titles, and ephemeral
-- runtime rows. This migration deliberately leaves the existing OWNER account
-- and all catalog tables/data untouched.

create table if not exists private.admin_maintenance_state (
  singleton boolean primary key default true check (singleton),
  last_ephemeral_cleanup_at timestamptz not null default '-infinity'
);
insert into private.admin_maintenance_state(singleton, last_ephemeral_cleanup_at)
values (true, '-infinity') on conflict (singleton) do nothing;
alter table private.admin_maintenance_state enable row level security;
revoke all on private.admin_maintenance_state from public, anon, authenticated, service_role;

-- Existing regular-admin labels may predate the title validation below. Keep
-- the account records, but replace conflicting display labels with a neutral
-- title. The role=ADMIN predicate deliberately excludes the OWNER account.
with sanitized_accounts as (
  update private.admin_accounts
  set title = 'Admin', updated_at = now()
  where role = 'ADMIN' and position('OWNER' in upper(trim(title))) > 0
  returning user_id
)
insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
select null, user_id, 'account.title_sanitized', jsonb_build_object('title', 'Admin')
from sanitized_accounts;

create or replace function public.turbo_consume_login_attempt(p_key text, p_limit integer default 8)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_last_cleanup timestamptz;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 5000 then
    return false;
  end if;

  -- One caller at a time checks the cleanup lease. Only rows that have been
  -- useless for at least 24 hours are removed; current rate-limit buckets and
  -- live presence are never eligible.
  if pg_try_advisory_xact_lock(739184620173::bigint) then
    select s.last_ephemeral_cleanup_at into v_last_cleanup
    from private.admin_maintenance_state s where s.singleton = true;
    if v_last_cleanup is null or v_last_cleanup < now() - interval '6 hours' then
      delete from private.admin_presence where expires_at < now() - interval '24 hours';
      delete from private.admin_login_limits where window_started_at < now() - interval '24 hours';
      insert into private.admin_maintenance_state(singleton, last_ephemeral_cleanup_at)
      values (true, now())
      on conflict (singleton) do update set last_ephemeral_cleanup_at = excluded.last_ephemeral_cleanup_at;
    end if;
  end if;

  insert into private.admin_login_limits(bucket_key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update set
    window_started_at = case
      when private.admin_login_limits.window_started_at < now() - interval '15 minutes' then now()
      else private.admin_login_limits.window_started_at
    end,
    attempts = case
      when private.admin_login_limits.window_started_at < now() - interval '15 minutes' then 1
      else private.admin_login_limits.attempts + 1
    end
  returning attempts into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.turbo_consume_login_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.turbo_consume_login_attempt(text, integer) to service_role;

create or replace function public.turbo_owner_create_admin(
  p_actor uuid, p_user_id uuid, p_username text, p_internal_email text,
  p_display_name text, p_title text, p_title_color text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.admin_accounts
    where user_id = p_actor and role = 'OWNER' and status = 'active'
  ) then raise exception 'owner authorization required' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Auth account not found' using errcode = '22023';
  end if;
  if p_username !~ '^[a-zA-Z0-9_]{3,24}$'
     or length(trim(p_display_name)) not between 1 and 40
     or length(trim(p_title)) not between 1 and 32
     or position('OWNER' in upper(trim(coalesce(p_title, '')))) > 0
     or p_title_color not in ('#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff')
     or lower(trim(p_internal_email)) !~ '^[a-z0-9._-]+@accounts\.turbo-soccer-values\.invalid$' then
    raise exception 'invalid admin profile' using errcode = '22023';
  end if;
  insert into private.admin_users(user_id) values (p_user_id) on conflict do nothing;
  insert into private.admin_accounts(
    user_id, role, username, internal_email, display_name, title, title_color,
    must_change_password, password_change_required_at
  ) values (
    p_user_id, 'ADMIN', lower(trim(p_username)), lower(trim(p_internal_email)),
    trim(p_display_name), trim(p_title), p_title_color, true, now()
  );
  insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
  values (p_actor, p_user_id, 'account.created', jsonb_build_object('username', lower(p_username)));
end;
$$;
revoke all on function public.turbo_owner_create_admin(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.turbo_owner_create_admin(uuid, uuid, text, text, text, text, text) to service_role;

create or replace function public.turbo_owner_update_admin(
  p_actor uuid, p_target uuid, p_username text, p_display_name text,
  p_title text, p_title_color text, p_status text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old_status text;
begin
  if not exists (
    select 1 from private.admin_accounts
    where user_id = p_actor and role = 'OWNER' and status = 'active'
  ) then raise exception 'owner authorization required' using errcode = '42501'; end if;
  if p_target = p_actor or p_status not in ('active', 'suspended')
     or p_username !~ '^[a-zA-Z0-9_]{3,24}$'
     or length(trim(p_display_name)) not between 1 and 40
     or length(trim(p_title)) not between 1 and 32
     or position('OWNER' in upper(trim(coalesce(p_title, '')))) > 0
     or p_title_color not in ('#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff') then
    raise exception 'invalid admin update' using errcode = '22023';
  end if;
  select status into v_old_status from private.admin_accounts
  where user_id = p_target and role = 'ADMIN' for update;
  if not found then raise exception 'regular admin not found' using errcode = 'P0002'; end if;

  update private.admin_accounts set
    username = lower(trim(p_username)), display_name = trim(p_display_name),
    title = trim(p_title), title_color = p_title_color, status = p_status,
    tokens_valid_after = case when v_old_status is distinct from p_status then clock_timestamp() else tokens_valid_after end,
    must_change_password = case when v_old_status is distinct from p_status then true else must_change_password end,
    password_change_required_at = case when v_old_status is distinct from p_status then clock_timestamp() else password_change_required_at end,
    updated_at = now()
  where user_id = p_target;

  if v_old_status is distinct from p_status then
    delete from auth.sessions where user_id = p_target;
  end if;
  insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
  values (
    p_actor, p_target,
    case when v_old_status is distinct from p_status then 'account.status_changed' else 'account.profile_changed' end,
    jsonb_build_object('username', lower(trim(p_username)), 'status', p_status, 'title', trim(p_title))
  );
end;
$$;
revoke all on function public.turbo_owner_update_admin(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.turbo_owner_update_admin(uuid, uuid, text, text, text, text, text) to service_role;

create or replace function public.turbo_owner_mark_password_reset(p_actor uuid, p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.admin_accounts
    where user_id = p_actor and role = 'OWNER' and status = 'active'
  ) then raise exception 'owner authorization required' using errcode = '42501'; end if;
  update private.admin_accounts set
    must_change_password = true,
    password_change_required_at = clock_timestamp(),
    tokens_valid_after = clock_timestamp(),
    updated_at = now()
  where user_id = p_target and role = 'ADMIN';
  if not found then raise exception 'regular admin not found' using errcode = 'P0002'; end if;
  delete from auth.sessions where user_id = p_target;
  insert into private.admin_audit_log(actor_user_id, target_user_id, action)
  values (p_actor, p_target, 'account.password_reset');
end;
$$;
revoke all on function public.turbo_owner_mark_password_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_mark_password_reset(uuid, uuid) to service_role;

create or replace function public.turbo_owner_revoke_sessions(p_actor uuid, p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.admin_accounts
    where user_id = p_actor and role = 'OWNER' and status = 'active'
  ) then raise exception 'owner authorization required' using errcode = '42501'; end if;
  if not exists (select 1 from private.admin_accounts where user_id = p_target and role = 'ADMIN') then
    raise exception 'regular admin not found' using errcode = 'P0002';
  end if;
  delete from auth.sessions where user_id = p_target;
  update private.admin_accounts set tokens_valid_after = clock_timestamp(), updated_at = now()
  where user_id = p_target and role = 'ADMIN';
  insert into private.admin_audit_log(actor_user_id, target_user_id, action)
  values (p_actor, p_target, 'account.sessions_revoked');
end;
$$;
revoke all on function public.turbo_owner_revoke_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_revoke_sessions(uuid, uuid) to service_role;

create or replace function public.my_turbo_admin_profile()
returns table (
  role text, username text, display_name text, title text, title_color text,
  status text, must_change_password boolean, last_seen timestamptz
) language sql stable security definer set search_path = ''
as $$
  select a.role, a.username, a.display_name, a.title, a.title_color,
         a.status, a.must_change_password, a.last_seen
  from private.admin_accounts a
  where a.user_id = (select auth.uid())
    and a.status = 'active'
    and exists (
      select 1 from auth.sessions s
      where s.id = ((select auth.jwt())->>'session_id')::uuid
        and s.user_id = a.user_id
    )
$$;
revoke all on function public.my_turbo_admin_profile() from public, anon;
grant execute on function public.my_turbo_admin_profile() to authenticated;

create or replace function public.set_my_turbo_admin_profile(
  p_username text, p_display_name text, p_title text, p_title_color text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_username !~ '^[a-zA-Z0-9_]{3,24}$'
     or length(trim(p_display_name)) not between 1 and 40
     or length(trim(p_title)) not between 1 and 32
     or p_title_color not in ('#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff') then
    raise exception 'invalid profile values' using errcode = '22023';
  end if;
  if position('OWNER' in upper(trim(coalesce(p_title, '')))) > 0 and not exists (
    select 1 from private.admin_accounts where user_id = v_uid and role = 'OWNER'
  ) then
    raise exception 'OWNER is reserved for the account role' using errcode = '22023';
  end if;
  update private.admin_accounts
  set username = lower(p_username), display_name = trim(p_display_name),
      title = trim(p_title), title_color = p_title_color, updated_at = now()
  where user_id = v_uid and status = 'active' and not must_change_password
    and to_timestamp(((select auth.jwt())->>'iat')::double precision) > tokens_valid_after
    and exists (
      select 1 from auth.sessions s
      where s.id = ((select auth.jwt())->>'session_id')::uuid and s.user_id = v_uid
    );
  if not found then raise exception 'admin account unavailable' using errcode = '42501'; end if;
  insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
  values (
    v_uid, v_uid, 'profile.updated',
    jsonb_build_object('username', lower(p_username), 'display_name', trim(p_display_name), 'title', trim(p_title), 'title_color', p_title_color)
  );
end;
$$;
revoke all on function public.set_my_turbo_admin_profile(text, text, text, text) from public, anon;
grant execute on function public.set_my_turbo_admin_profile(text, text, text, text) to authenticated;
