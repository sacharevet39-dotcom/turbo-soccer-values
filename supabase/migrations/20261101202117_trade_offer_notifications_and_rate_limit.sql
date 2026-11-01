create table if not exists private.trade_listing_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

alter table private.trade_listing_rate_events enable row level security;
revoke all on table private.trade_listing_rate_events from public, anon, authenticated;
create index if not exists trade_listing_rate_events_user_time_idx
  on private.trade_listing_rate_events (user_id, created_at desc);

create or replace function private.enforce_trade_listing_hourly_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recent_count integer;
begin
  if new.user_id is null then
    raise exception 'A trade listing must have an owner.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trade-offers:' || new.user_id::text, 0));
  select count(*)::integer into v_recent_count
  from private.trade_listing_rate_events as event
  where event.user_id = new.user_id
    and event.created_at > pg_catalog.clock_timestamp() - interval '1 hour';

  if v_recent_count >= 10 then
    raise exception 'You have reached the limit of 10 offers per hour. Please try again later.' using errcode = 'P0001';
  end if;

  insert into private.trade_listing_rate_events (user_id) values (new.user_id);
  return new;
end;
$function$;

revoke all on function private.enforce_trade_listing_hourly_limit() from public, anon, authenticated;
drop trigger if exists enforce_trade_listing_hourly_limit on public.trade_listings;
create trigger enforce_trade_listing_hourly_limit
  before insert on public.trade_listings
  for each row execute function private.enforce_trade_listing_hourly_limit();

create table if not exists public.trade_offer_acceptances (
  listing_id uuid not null references public.trade_listings(id) on delete cascade,
  accepter_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (listing_id, accepter_id)
);

alter table public.trade_offer_acceptances enable row level security;
revoke all on table public.trade_offer_acceptances from public, anon, authenticated;
grant select on table public.trade_offer_acceptances to authenticated;
create policy "Players can read relevant offer acceptances"
  on public.trade_offer_acceptances for select to authenticated
  using (
    accepter_id = (select auth.uid())
    or exists (
      select 1 from public.trade_listings as listing
      where listing.id = trade_offer_acceptances.listing_id
        and listing.user_id = (select auth.uid())
    )
  );

create table if not exists public.trade_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.trade_listings(id) on delete set null,
  event_type text not null check (event_type in ('offer_accepted', 'acceptance_sent')),
  counterpart_name text not null check (char_length(counterpart_name) between 1 and 80),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (recipient_id <> actor_id)
);

alter table public.trade_notifications enable row level security;
revoke all on table public.trade_notifications from public, anon, authenticated;
grant select on table public.trade_notifications to authenticated;
grant update (read_at) on table public.trade_notifications to authenticated;
create index if not exists trade_notifications_recipient_created_idx
  on public.trade_notifications (recipient_id, created_at desc);
create index if not exists trade_notifications_unread_idx
  on public.trade_notifications (recipient_id) where read_at is null;
create policy "Players can read their own trade notifications"
  on public.trade_notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Players can mark their own trade notifications read"
  on public.trade_notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create or replace function public.accept_trade_offer(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_listing public.trade_listings%rowtype;
  v_identity auth.identities%rowtype;
  v_actor_name text;
  v_owner_name text;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'Sign in with Roblox or Discord before accepting an offer.' using errcode = '42501';
  end if;

  select listing.* into v_listing
  from public.trade_listings as listing
  where listing.id = p_listing_id and listing.status = 'open'
  for update;
  if not found then
    raise exception 'This offer is no longer available.' using errcode = 'P0002';
  end if;
  if v_listing.user_id = v_user_id then
    raise exception 'You cannot accept your own offer.' using errcode = '22023';
  end if;

  select identity.* into v_identity
  from auth.identities as identity
  where identity.user_id = v_user_id and identity.provider in ('custom:roblox', 'discord')
  order by case identity.provider when 'custom:roblox' then 0 else 1 end
  limit 1;
  if not found then
    raise exception 'Link a Roblox or Discord account before accepting an offer.' using errcode = '42501';
  end if;

  v_actor_name := left(coalesce(
    nullif(btrim(v_identity.identity_data ->> 'preferred_username'), ''),
    nullif(btrim(v_identity.identity_data ->> 'username'), ''),
    nullif(btrim(v_identity.identity_data ->> 'user_name'), ''),
    nullif(btrim(v_identity.identity_data ->> 'global_name'), ''),
    nullif(btrim(v_identity.identity_data ->> 'name'), ''),
    'Player'
  ), 80);
  if v_identity.provider = 'custom:roblox' then
    select coalesce(nullif(btrim(profile.roblox_display_name), ''), nullif(btrim(profile.roblox_username), ''), v_actor_name)
      into v_actor_name
    from public.trade_profiles as profile where profile.user_id = v_user_id;
    v_actor_name := coalesce(v_actor_name, 'Player');
  end if;

  v_owner_name := left(btrim(coalesce(nullif(btrim(v_listing.trader_name), ''), 'Player')), 80);
  if v_listing.identity_provider = 'custom:roblox' then
    select coalesce(nullif(btrim(profile.roblox_display_name), ''), nullif(btrim(profile.roblox_username), ''), v_owner_name)
      into v_owner_name
    from public.trade_profiles as profile where profile.user_id = v_listing.user_id;
    v_owner_name := coalesce(v_owner_name, 'Player');
  end if;

  insert into public.trade_offer_acceptances (listing_id, accepter_id)
  values (v_listing.id, v_user_id)
  on conflict (listing_id, accepter_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'You already accepted this offer.' using errcode = '23505';
  end if;

  insert into public.trade_notifications (recipient_id, actor_id, listing_id, event_type, counterpart_name)
  values
    (v_listing.user_id, v_user_id, v_listing.id, 'offer_accepted', v_actor_name),
    (v_user_id, v_listing.user_id, v_listing.id, 'acceptance_sent', v_owner_name);

  return v_listing.id;
end;
$function$;

revoke all on function public.accept_trade_offer(uuid) from public, anon;
grant execute on function public.accept_trade_offer(uuid) to authenticated;

notify pgrst, 'reload schema';
