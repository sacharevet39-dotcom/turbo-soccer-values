create table if not exists private.site_visit_sessions (
  visit_id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists private.site_visit_counter (
  singleton boolean primary key default true check (singleton),
  total bigint not null default 0 check (total >= 0),
  updated_at timestamptz not null default now()
);

insert into private.site_visit_counter(singleton, total)
values (true, 0)
on conflict (singleton) do nothing;

alter table private.site_visit_sessions enable row level security;
alter table private.site_visit_counter enable row level security;
revoke all on table private.site_visit_sessions, private.site_visit_counter from public, anon, authenticated;
grant select, insert on table private.site_visit_sessions to service_role;
grant select, insert, update on table private.site_visit_counter to service_role;

create or replace function public.turbo_site_visit_count()
returns bigint
language sql stable security definer set search_path = '' as $$
  select total from private.site_visit_counter where singleton = true
$$;
revoke all on function public.turbo_site_visit_count() from public;
grant execute on function public.turbo_site_visit_count() to anon, authenticated, service_role;

create or replace function public.turbo_register_site_visit(p_visit_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_added boolean;
  v_rows integer;
  v_total bigint;
begin
  if p_visit_id is null then
    raise exception 'visit id required' using errcode = '22023';
  end if;

  insert into private.site_visit_sessions(visit_id)
  values (p_visit_id)
  on conflict (visit_id) do nothing;
  get diagnostics v_rows = row_count;
  v_added := v_rows > 0;

  if v_added then
    update private.site_visit_counter
      set total = total + 1, updated_at = now()
      where singleton = true
      returning total into v_total;
  else
    select total into v_total from private.site_visit_counter where singleton = true;
  end if;

  return jsonb_build_object('total', coalesce(v_total, 0), 'counted', v_added);
end;
$$;
revoke all on function public.turbo_register_site_visit(uuid) from public, anon, authenticated;
grant execute on function public.turbo_register_site_visit(uuid) to service_role;
