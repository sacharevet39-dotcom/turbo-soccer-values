create table public.trade_chat_threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.trade_listings(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  starter_id uuid not null references auth.users(id) on delete cascade,
  owner_roblox_user_id text not null,
  owner_roblox_username text not null,
  owner_roblox_display_name text not null,
  owner_avatar_url text,
  starter_roblox_user_id text not null,
  starter_roblox_username text not null,
  starter_roblox_display_name text not null,
  starter_avatar_url text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint trade_chat_different_players check (owner_id <> starter_id),
  constraint trade_chat_listing_starter_key unique (listing_id, starter_id)
);

create index trade_chat_threads_owner_recent_idx on public.trade_chat_threads (owner_id, last_message_at desc);
create index trade_chat_threads_starter_recent_idx on public.trade_chat_threads (starter_id, last_message_at desc);

create table public.trade_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.trade_chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index trade_chat_messages_thread_created_idx on public.trade_chat_messages (thread_id, created_at);
create index trade_chat_messages_sender_recent_idx on public.trade_chat_messages (sender_id, created_at desc);

alter table public.trade_chat_threads enable row level security;
alter table public.trade_chat_messages enable row level security;
revoke all on public.trade_chat_threads, public.trade_chat_messages from anon, authenticated;
grant select on public.trade_chat_threads, public.trade_chat_messages to authenticated;

create schema if not exists trade_chat_private;
revoke all on schema trade_chat_private from public, anon, authenticated;
grant usage on schema trade_chat_private to authenticated;

create function trade_chat_private.is_roblox_chat_member(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from auth.identities as identity
      join public.trade_chat_threads as thread
        on thread.id = p_thread_id
       and (thread.owner_id = identity.user_id or thread.starter_id = identity.user_id)
      where identity.user_id = (select auth.uid())
        and identity.provider = 'custom:roblox'
    );
$function$;

revoke all on function trade_chat_private.is_roblox_chat_member(uuid) from public, anon;
grant execute on function trade_chat_private.is_roblox_chat_member(uuid) to authenticated;

create policy "Roblox chat participants can read their threads"
  on public.trade_chat_threads for select to authenticated
  using ((select trade_chat_private.is_roblox_chat_member(id)));

create policy "Roblox chat participants can read messages"
  on public.trade_chat_messages for select to authenticated
  using ((select trade_chat_private.is_roblox_chat_member(thread_id)));

create function public.start_trade_chat(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_listing public.trade_listings%rowtype;
  v_starter_profile public.trade_profiles%rowtype;
  v_owner_profile public.trade_profiles%rowtype;
  v_thread_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in with Roblox to start a player chat' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.identities as identity
    where identity.user_id = v_user_id and identity.provider = 'custom:roblox'
  ) then
    raise exception 'Link a Roblox account to use player chat' using errcode = '42501';
  end if;

  select listing.* into v_listing
  from public.trade_listings as listing
  where listing.id = p_listing_id
    and listing.status = 'open'
    and listing.identity_provider = 'custom:roblox';
  if not found then
    raise exception 'This Roblox trade listing is no longer available for chat' using errcode = 'P0002';
  end if;
  if v_listing.user_id = v_user_id then
    raise exception 'You cannot start a chat with yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.identities as identity
    where identity.user_id = v_listing.user_id and identity.provider = 'custom:roblox'
  ) then
    raise exception 'This player no longer has a linked Roblox account' using errcode = '22023';
  end if;

  perform public.sync_my_roblox_trade_profile();
  select profile.* into v_starter_profile from public.trade_profiles as profile where profile.user_id = v_user_id;
  if not found then
    raise exception 'Your Roblox profile is not ready yet. Reconnect Roblox and try again.' using errcode = '22023';
  end if;
  select profile.* into v_owner_profile from public.trade_profiles as profile where profile.user_id = v_listing.user_id;

  insert into public.trade_chat_threads (
    listing_id, owner_id, starter_id,
    owner_roblox_user_id, owner_roblox_username, owner_roblox_display_name, owner_avatar_url,
    starter_roblox_user_id, starter_roblox_username, starter_roblox_display_name, starter_avatar_url
  ) values (
    v_listing.id, v_listing.user_id, v_user_id,
    v_listing.identity_provider_id,
    coalesce(v_owner_profile.roblox_username, nullif(v_listing.trader_handle, ''), v_listing.trader_name),
    coalesce(v_owner_profile.roblox_display_name, v_listing.trader_name),
    coalesce(v_owner_profile.roblox_avatar_url, v_listing.trader_avatar_url),
    v_starter_profile.roblox_user_id,
    v_starter_profile.roblox_username,
    v_starter_profile.roblox_display_name,
    v_starter_profile.roblox_avatar_url
  )
  on conflict (listing_id, starter_id) do update
    set last_message_at = excluded.last_message_at
  returning id into v_thread_id;
  return v_thread_id;
end;
$function$;

revoke all on function public.start_trade_chat(uuid) from public, anon;
grant execute on function public.start_trade_chat(uuid) to authenticated;

create function public.send_trade_chat_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Sign in with Roblox to send messages' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.identities as identity
    where identity.user_id = v_user_id and identity.provider = 'custom:roblox'
  ) then
    raise exception 'Link a Roblox account to use player chat' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'Messages must contain between 1 and 1,000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.trade_chat_threads as thread
    where thread.id = p_thread_id and (thread.owner_id = v_user_id or thread.starter_id = v_user_id)
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if (select count(*) from public.trade_chat_messages as message
      where message.sender_id = v_user_id and message.created_at > v_now - interval '1 minute') >= 20 then
    raise exception 'Slow down a little before sending more messages' using errcode = '22023';
  end if;

  insert into public.trade_chat_messages (thread_id, sender_id, body, created_at)
  values (p_thread_id, v_user_id, v_body, v_now)
  returning id into v_message_id;
  update public.trade_chat_threads set last_message_at = v_now where id = p_thread_id;
  return v_message_id;
end;
$function$;

revoke all on function public.send_trade_chat_message(uuid, text) from public, anon;
grant execute on function public.send_trade_chat_message(uuid, text) to authenticated;

notify pgrst, 'reload schema';
