-- Runtime authorization and presence RPCs. The privileged functions below are
-- executable only by service_role; Pages Functions must validate the caller's
-- Supabase Auth JWT before supplying the actor UUID.

alter table private.admin_accounts
  add column if not exists tokens_valid_after timestamptz not null default 'epoch',
  add column if not exists password_change_required_at timestamptz,
  add column if not exists last_password_changed_at timestamptz;

create or replace function public.is_turbo_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.admin_accounts a
    where a.user_id = (select auth.uid())
      and a.status = 'active'
      and a.role in ('OWNER', 'ADMIN')
      and not a.must_change_password
      and to_timestamp(((select auth.jwt())->>'iat')::double precision) > a.tokens_valid_after
      and exists(select 1 from auth.sessions s where s.id=((select auth.jwt())->>'session_id')::uuid and s.user_id=a.user_id)
  );
$$;
revoke all on function public.is_turbo_admin() from public, anon;
grant execute on function public.is_turbo_admin() to authenticated;

create or replace function public.turbo_server_admin_access(p_user_id uuid)
returns table(role text, status text, must_change_password boolean, tokens_valid_after timestamptz)
language sql stable security definer set search_path = ''
as $$
 select a.role, a.status, a.must_change_password, a.tokens_valid_after
 from private.admin_accounts a where a.user_id = p_user_id
$$;
revoke all on function public.turbo_server_admin_access(uuid) from public, anon, authenticated;
grant execute on function public.turbo_server_admin_access(uuid) to service_role;

create or replace function public.turbo_server_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.sessions s where s.user_id=p_user_id and s.id=p_session_id)
$$;
revoke all on function public.turbo_server_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.turbo_server_session_active(uuid,uuid) to service_role;

create or replace function public.turbo_server_login_email(p_username text)
returns text language sql stable security definer set search_path = ''
as $$
 select a.internal_email from private.admin_accounts a
 where a.username = lower(trim(p_username)) and a.role = 'ADMIN' and a.status = 'active'
$$;
revoke all on function public.turbo_server_login_email(text) from public, anon, authenticated;
grant execute on function public.turbo_server_login_email(text) to service_role;

create or replace function public.turbo_server_login_status(p_username text)
returns table(role text,status text,must_change_password boolean)
language sql stable security definer set search_path = '' as $$
 select a.role,a.status,a.must_change_password from private.admin_accounts a where a.username=lower(trim(p_username))
$$;
revoke all on function public.turbo_server_login_status(text) from public,anon,authenticated;
grant execute on function public.turbo_server_login_status(text) to service_role;

create or replace function public.turbo_consume_login_attempt(p_key text, p_limit integer default 8)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 5000 then return false; end if;
 insert into private.admin_login_limits(bucket_key,window_started_at,attempts) values(p_key,now(),1)
 on conflict(bucket_key) do update set
  window_started_at=case when private.admin_login_limits.window_started_at < now()-interval '15 minutes' then now() else private.admin_login_limits.window_started_at end,
  attempts=case when private.admin_login_limits.window_started_at < now()-interval '15 minutes' then 1 else private.admin_login_limits.attempts+1 end
 returning attempts into v_count;
 return v_count <= p_limit;
end;
$$;
revoke all on function public.turbo_consume_login_attempt(text,integer) from public, anon, authenticated;
grant execute on function public.turbo_consume_login_attempt(text,integer) to service_role;

create or replace function public.turbo_owner_create_admin(
 p_actor uuid,p_user_id uuid,p_username text,p_internal_email text,p_display_name text,p_title text,p_title_color text
) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Auth account not found' using errcode='22023'; end if;
 if p_username !~ '^[a-zA-Z0-9_]{3,24}$' or length(trim(p_display_name)) not between 1 and 40
    or length(trim(p_title)) not between 1 and 32
    or p_title_color not in ('#b4f34b','#ffd166','#ff6b6b','#7bdff2','#c77dff','#ffffff')
    or lower(trim(p_internal_email)) !~ '^[a-z0-9._-]+@accounts\.turbo-soccer-values\.invalid$' then
   raise exception 'invalid admin profile' using errcode='22023';
 end if;
 insert into private.admin_users(user_id) values(p_user_id) on conflict do nothing;
 insert into private.admin_accounts(user_id,role,username,internal_email,display_name,title,title_color,must_change_password,password_change_required_at)
 values(p_user_id,'ADMIN',lower(trim(p_username)),lower(trim(p_internal_email)),trim(p_display_name),trim(p_title),p_title_color,true,now());
 insert into private.admin_audit_log(actor_user_id,target_user_id,action,details)
 values(p_actor,p_user_id,'account.created',jsonb_build_object('username',lower(p_username)));
end; $$;
revoke all on function public.turbo_owner_create_admin(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.turbo_owner_create_admin(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.turbo_owner_accounts(p_actor uuid)
returns table(user_id uuid,username text,display_name text,role text,title text,title_color text,status text,must_change_password boolean,last_seen timestamptz,online boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 return query select a.user_id,a.username,a.display_name,a.role,a.title,a.title_color,a.status,a.must_change_password,a.last_seen,
  exists(select 1 from private.admin_presence p where p.user_id=a.user_id and p.expires_at>now())
 from private.admin_accounts a order by a.role,a.username nulls first;
end; $$;
revoke all on function public.turbo_owner_accounts(uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_accounts(uuid) to service_role;

create or replace function public.turbo_owner_update_admin(
 p_actor uuid,p_target uuid,p_username text,p_display_name text,p_title text,p_title_color text,p_status text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_old_status text;
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 if p_target=p_actor or p_status not in ('active','suspended') or p_username !~ '^[a-zA-Z0-9_]{3,24}$'
  or length(trim(p_display_name)) not between 1 and 40 or length(trim(p_title)) not between 1 and 32
  or p_title_color not in ('#b4f34b','#ffd166','#ff6b6b','#7bdff2','#c77dff','#ffffff') then raise exception 'invalid admin update' using errcode='22023'; end if;
 select status into v_old_status from private.admin_accounts where user_id=p_target and role='ADMIN' for update;
 if not found then raise exception 'regular admin not found' using errcode='P0002'; end if;
 update private.admin_accounts set username=lower(trim(p_username)),display_name=trim(p_display_name),title=trim(p_title),title_color=p_title_color,status=p_status,
  tokens_valid_after=case when v_old_status is distinct from p_status then clock_timestamp() else tokens_valid_after end,
  must_change_password=case when v_old_status is distinct from p_status then true else must_change_password end,
  password_change_required_at=case when v_old_status is distinct from p_status then clock_timestamp() else password_change_required_at end,updated_at=now()
 where user_id=p_target;
 insert into private.admin_audit_log(actor_user_id,target_user_id,action,details)
 values(p_actor,p_target,case when v_old_status is distinct from p_status then 'account.status_changed' else 'account.profile_changed' end,
  jsonb_build_object('username',lower(trim(p_username)),'status',p_status,'title',trim(p_title)));
end; $$;
revoke all on function public.turbo_owner_update_admin(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.turbo_owner_update_admin(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.turbo_owner_mark_password_reset(p_actor uuid,p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 update private.admin_accounts set must_change_password=true,password_change_required_at=clock_timestamp(),tokens_valid_after=clock_timestamp(),updated_at=now()
 where user_id=p_target and role='ADMIN';
 if not found then raise exception 'regular admin not found' using errcode='P0002'; end if;
 insert into private.admin_audit_log(actor_user_id,target_user_id,action) values(p_actor,p_target,'account.password_reset');
end; $$;
revoke all on function public.turbo_owner_mark_password_reset(uuid,uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_mark_password_reset(uuid,uuid) to service_role;

create or replace function public.turbo_owner_revoke_sessions(p_actor uuid,p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 if not exists(select 1 from private.admin_accounts where user_id=p_target and role='ADMIN') then raise exception 'regular admin not found' using errcode='P0002'; end if;
 update private.admin_accounts set tokens_valid_after=clock_timestamp(),updated_at=now() where user_id=p_target;
 insert into private.admin_audit_log(actor_user_id,target_user_id,action) values(p_actor,p_target,'account.sessions_revoked');
end; $$;
revoke all on function public.turbo_owner_revoke_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.turbo_owner_revoke_sessions(uuid,uuid) to service_role;

create or replace function public.turbo_owner_audit(p_actor uuid)
returns table(id bigint,actor_user_id uuid,target_user_id uuid,action text,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 return query select l.id,l.actor_user_id,l.target_user_id,l.action,l.details,l.created_at from private.admin_audit_log l order by l.created_at desc limit 500;
end; $$;
revoke all on function public.turbo_owner_audit(uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_audit(uuid) to service_role;

drop function if exists public.turbo_complete_password_change();
create or replace function public.turbo_server_complete_password_change(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update private.admin_accounts set must_change_password=false,updated_at=now()
 where user_id=p_user_id and role='ADMIN' and status='active' and must_change_password
   and last_password_changed_at is not null and last_password_changed_at >= password_change_required_at;
 if not found then raise exception 'admin account unavailable' using errcode='42501'; end if;
end; $$;
revoke all on function public.turbo_server_complete_password_change(uuid) from public,anon,authenticated;
grant execute on function public.turbo_server_complete_password_change(uuid) to service_role;

create or replace function public.turbo_presence_heartbeat(p_session_id uuid,p_user_id uuid default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_active bigint;
begin
 if p_user_id is not null and not exists(select 1 from private.admin_accounts where user_id=p_user_id and role in ('OWNER','ADMIN') and status='active') then
  raise exception 'admin account unavailable' using errcode='42501';
 end if;
 insert into private.admin_presence(session_id,user_id,visitor_key,updated_at,expires_at)
 values(p_session_id,p_user_id,p_session_id::text,now(),now()+interval '90 seconds')
 on conflict(session_id) do update set user_id=coalesce(excluded.user_id,private.admin_presence.user_id),updated_at=now(),expires_at=now()+interval '90 seconds';
 if p_user_id is not null then update private.admin_accounts set last_seen=now() where user_id=p_user_id; end if;
 select count(distinct visitor_key) into v_active from private.admin_presence where expires_at>now();
 return v_active;
end; $$;
revoke all on function public.turbo_presence_heartbeat(uuid,uuid) from public, anon, authenticated;
grant execute on function public.turbo_presence_heartbeat(uuid,uuid) to service_role;

create or replace function public.turbo_public_online_count()
returns bigint language sql stable security definer set search_path = '' as $$
 select count(distinct visitor_key) from private.admin_presence where expires_at>now()
$$;
revoke all on function public.turbo_public_online_count() from public;
grant execute on function public.turbo_public_online_count() to anon,authenticated;

create or replace function public.turbo_owner_presence(p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if not exists(select 1 from private.admin_accounts where user_id=p_actor and role='OWNER' and status='active') then raise exception 'owner authorization required' using errcode='42501'; end if;
 select jsonb_build_object(
  'visitorCount',(select count(distinct visitor_key) from private.admin_presence where user_id is null and expires_at>now()),
  'adminCount',(select count(distinct p.user_id) from private.admin_presence p join private.admin_accounts a on a.user_id=p.user_id where a.role='ADMIN' and a.status='active' and p.expires_at>now()),
  'ownerOnline',exists(select 1 from private.admin_presence where user_id=p_actor and expires_at>now()),
  'admins',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'username',a.username,'displayName',a.display_name,'title',a.title,'titleColor',a.title_color,'lastSeen',a.last_seen)
    order by a.username) from private.admin_accounts a where a.role='ADMIN' and a.status='active'
     and exists(select 1 from private.admin_presence p where p.user_id=a.user_id and p.expires_at>now())),'[]'::jsonb)
 ) into v_result;
 return v_result;
end; $$;
revoke all on function public.turbo_owner_presence(uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_presence(uuid) to service_role;

create or replace function private.audit_turbo_auth_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update private.admin_accounts set last_password_changed_at=clock_timestamp(),tokens_valid_after=clock_timestamp(),updated_at=now()
  where user_id=new.id;
  insert into private.admin_audit_log(actor_user_id,target_user_id,action)
  select new.id,new.id,'account.password_changed' where exists(select 1 from private.admin_accounts a where a.user_id=new.id);
 end if;
 return new;
end; $$;
revoke all on function private.audit_turbo_auth_password_change() from public,anon,authenticated;
drop trigger if exists turbo_auth_password_audit on auth.users;
create trigger turbo_auth_password_audit after update of encrypted_password on auth.users
for each row execute function private.audit_turbo_auth_password_change();

-- Ensure the service key is the only route into the private schema/tables.
grant usage on schema private to service_role;
grant select,insert,update on private.admin_accounts,private.admin_users,private.admin_audit_log,private.admin_presence,private.admin_login_limits to service_role;
revoke delete on private.admin_accounts,private.admin_users,private.admin_audit_log,private.admin_presence,private.admin_login_limits from service_role;
grant usage,select on all sequences in schema private to service_role;
