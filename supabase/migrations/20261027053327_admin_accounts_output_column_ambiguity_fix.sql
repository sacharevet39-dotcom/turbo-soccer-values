-- In a RETURNS TABLE function, output column names are PL/pgSQL variables.
-- Qualify account columns in the authorization check to avoid ambiguity.
create or replace function public.turbo_owner_accounts(p_actor uuid)
returns table(
  user_id uuid,
  username text,
  display_name text,
  role text,
  title text,
  title_color text,
  status text,
  must_change_password boolean,
  last_seen timestamptz,
  online boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.admin_accounts as owner_account
    where owner_account.user_id = p_actor
      and owner_account.role = 'OWNER'
      and owner_account.status = 'active'
  ) then
    raise exception 'owner authorization required' using errcode = '42501';
  end if;

  return query
  select
    account.user_id,
    account.username,
    account.display_name,
    account.role,
    account.title,
    account.title_color,
    account.status,
    account.must_change_password,
    account.last_seen,
    exists (
      select 1
      from private.admin_presence as presence
      where presence.user_id = account.user_id
        and presence.expires_at > now()
    )
  from private.admin_accounts as account
  order by account.role, account.username nulls first;
end;
$$;

revoke all on function public.turbo_owner_accounts(uuid) from public, anon, authenticated;
grant execute on function public.turbo_owner_accounts(uuid) to service_role;
