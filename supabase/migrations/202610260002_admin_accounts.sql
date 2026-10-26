-- Additive admin-system foundation. Existing Auth users, allowlist rows, items,
-- and storage objects are preserved. The supplied OWNER UUID is linked below;
-- the migration refuses to proceed unless that exact Auth user already exists.

create table if not exists private.admin_accounts (
  user_id uuid primary key references private.admin_users(user_id) on delete cascade,
  role text not null default 'ADMIN' check (role in ('OWNER', 'ADMIN')),
  username text unique,
  internal_email text unique,
  display_name text not null default 'Turbo Admin' check (length(trim(display_name)) between 1 and 40),
  title text not null default 'Admin' check (length(trim(title)) between 1 and 32),
  title_color text not null default '#b4f34b' check (title_color in ('#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table private.admin_accounts enable row level security;
revoke all on private.admin_accounts from public, anon, authenticated;

-- Backfill every currently authorized account as active. Keep the owner UUID
-- fixed to the value the user supplied; do not create or alter an Auth user.
insert into private.admin_accounts (user_id)
select user_id from private.admin_users
on conflict (user_id) do nothing;

do $$
declare v_owner uuid := '99aa849a-29ee-44b5-8951-a2bfb4d590fa';
begin
  if not exists (select 1 from auth.users where id = v_owner) then
    raise exception 'Configured OWNER UUID is not present in auth.users; no owner role was assigned.';
  end if;
  if exists (select 1 from private.admin_accounts where role = 'OWNER' and user_id <> v_owner) then
    raise exception 'A different OWNER is already configured; review existing records before applying this migration.';
  end if;
  insert into private.admin_users(user_id) values (v_owner) on conflict do nothing;
  insert into private.admin_accounts(user_id, role, display_name, title, status)
  values (v_owner, 'OWNER', 'Owner', 'OWNER', 'active')
  on conflict (user_id) do update set role = 'OWNER',
    title = case when private.admin_accounts.role = 'ADMIN' then 'OWNER' else private.admin_accounts.title end;
end $$;

create or replace function private.protect_turbo_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'admin_users' then
    if exists (select 1 from private.admin_accounts a where a.user_id = old.user_id and a.role = 'OWNER') then
      raise exception 'The OWNER account is protected.' using errcode = '42501';
    end if;
  elsif old.role = 'OWNER' and (tg_op = 'DELETE' or new.user_id is distinct from old.user_id
      or new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'The OWNER role, status, and account identity are protected.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_turbo_owner() from public, anon, authenticated;
drop trigger if exists protect_turbo_owner_membership on private.admin_users;
create trigger protect_turbo_owner_membership before delete or update of user_id on private.admin_users
for each row execute function private.protect_turbo_owner();
drop trigger if exists protect_turbo_owner_account on private.admin_accounts;
create trigger protect_turbo_owner_account before update or delete on private.admin_accounts
for each row execute function private.protect_turbo_owner();

create unique index if not exists admin_accounts_single_owner
  on private.admin_accounts (role) where role = 'OWNER';
create index if not exists admin_accounts_active_idx
  on private.admin_accounts (status, role);

create table if not exists private.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  target_user_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on private.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on private.admin_audit_log (target_user_id, created_at desc);
alter table private.admin_audit_log enable row level security;
revoke all on private.admin_audit_log from public, anon, authenticated;
grant usage, select on sequence private.admin_audit_log_id_seq to service_role;

create table if not exists private.admin_presence (
  session_id uuid primary key,
  user_id uuid,
  visitor_key text not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists admin_presence_expiry_idx on private.admin_presence (expires_at);
create index if not exists admin_presence_user_idx on private.admin_presence (user_id) where user_id is not null;
alter table private.admin_presence enable row level security;
revoke all on private.admin_presence from public, anon, authenticated;

create table if not exists private.admin_login_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 0
);
alter table private.admin_login_limits enable row level security;
revoke all on private.admin_login_limits from public, anon, authenticated;

create or replace function public.is_turbo_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_accounts a
    where a.user_id = (select auth.uid())
      and a.status = 'active'
      and a.role in ('OWNER', 'ADMIN')
      and not a.must_change_password
      and exists (
        select 1 from auth.sessions s
        where s.id = ((select auth.jwt())->>'session_id')::uuid
          and s.user_id = a.user_id
      )
  );
$$;
revoke all on function public.is_turbo_admin() from public, anon;
grant execute on function public.is_turbo_admin() to authenticated;

create or replace function public.my_turbo_admin_profile()
returns table (
  role text, username text, display_name text, title text, title_color text,
  status text, must_change_password boolean, last_seen timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select a.role, a.username, a.display_name, a.title, a.title_color,
         a.status, a.must_change_password, a.last_seen
  from private.admin_accounts a
  where a.user_id = (select auth.uid()) and a.status = 'active'
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
)
returns void language plpgsql security definer set search_path = ''
as $$
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
  update private.admin_accounts
  set username = lower(p_username), display_name = trim(p_display_name),
      title = trim(p_title), title_color = p_title_color, updated_at = now()
  where user_id = v_uid and status = 'active' and not must_change_password
    and exists(select 1 from auth.sessions s where s.id=((select auth.jwt())->>'session_id')::uuid and s.user_id=v_uid);
  if not found then raise exception 'admin account unavailable' using errcode = '42501'; end if;
  insert into private.admin_audit_log(actor_user_id, target_user_id, action, details)
  values (v_uid, v_uid, 'profile.updated', jsonb_build_object('username', lower(p_username), 'display_name', trim(p_display_name), 'title', trim(p_title), 'title_color', p_title_color));
end;
$$;
revoke all on function public.set_my_turbo_admin_profile(text, text, text, text) from public, anon;
grant execute on function public.set_my_turbo_admin_profile(text, text, text, text) to authenticated;

-- Public identities are deliberately limited to display information. Private
-- usernames, internal auth emails, IDs, and account state are never exposed.
create or replace view public.turbo_admin_profiles as
select a.display_name, a.title, a.title_color,
       (a.last_seen > now() - interval '90 seconds') as online
from private.admin_accounts a
where a.status = 'active';
revoke all on public.turbo_admin_profiles from public;
grant select on public.turbo_admin_profiles to anon, authenticated;

create or replace function private.audit_item_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'DELETE' then
    insert into private.admin_audit_log(actor_user_id, action, details)
    values (v_actor, 'item.deleted', jsonb_build_object('record', to_jsonb(old)));
    return old;
  elsif tg_op = 'INSERT' then
    insert into private.admin_audit_log(actor_user_id, action, details)
    values (v_actor, 'item.created', jsonb_build_object('record', to_jsonb(new)));
    return new;
  else
    insert into private.admin_audit_log(actor_user_id, action, details)
    values (v_actor, 'item.updated', jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
    return new;
  end if;
end;
$$;
revoke all on function private.audit_item_change() from public, anon, authenticated;
drop trigger if exists items_admin_audit on public.items;
create trigger items_admin_audit after insert or update or delete on public.items
for each row execute function private.audit_item_change();

-- Runtime RPCs and the Pages Functions server endpoints are supplied in the
-- next migration/source tree. No service key or initial password is stored here.
