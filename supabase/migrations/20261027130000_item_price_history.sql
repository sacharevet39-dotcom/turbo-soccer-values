-- Keep a durable record whenever an item's value is first set or changes.
create table if not exists public.item_price_history (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  value bigint not null check (value >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists item_price_history_item_time_idx
  on public.item_price_history(item_id, recorded_at desc, id desc);
create unique index if not exists item_price_history_dedupe_idx
  on public.item_price_history(item_id, recorded_at, value);

alter table public.item_price_history enable row level security;
grant select on public.item_price_history to anon, authenticated;
drop policy if exists "Price history is publicly readable" on public.item_price_history;
create policy "Price history is publicly readable"
  on public.item_price_history for select to anon, authenticated using (true);

-- Seed one honest baseline from each item's current value. Real historical
-- movement starts accumulating from the moment this migration is applied.
insert into public.item_price_history(item_id, value, recorded_at)
select id, value, coalesce(updated_at, created_at, now())
from public.items
where value is not null
on conflict (item_id, recorded_at, value) do nothing;

create or replace function public.record_item_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.value is not null then
      insert into public.item_price_history(item_id, value)
      values (new.id, new.value)
      on conflict (item_id, recorded_at, value) do nothing;
    end if;
  elsif new.value is distinct from old.value and new.value is not null then
    insert into public.item_price_history(item_id, value)
    values (new.id, new.value)
    on conflict (item_id, recorded_at, value) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_item_price_history() from public, anon, authenticated;

drop trigger if exists items_record_price_history on public.items;
create trigger items_record_price_history
after insert or update of value on public.items
for each row execute function public.record_item_price_history();

create or replace view public.item_price_trends with (security_invoker = true) as
with ranked as (
  select item_id, value, recorded_at,
    row_number() over (partition by item_id order by recorded_at desc, id desc) as position
  from public.item_price_history
)
select item_id,
  max(value) filter (where position = 1) as current_value,
  max(value) filter (where position = 2) as previous_value,
  max(recorded_at) filter (where position = 1) as current_recorded_at,
  max(recorded_at) filter (where position = 2) as previous_recorded_at
from ranked
where position <= 2
group by item_id;

grant select on public.item_price_trends to anon, authenticated;

notify pgrst, 'reload schema';
