-- Optional community demand rating for catalogue items (one to five stars).
alter table public.items
  add column if not exists demand smallint
  check (demand is null or demand between 1 and 5);

comment on column public.items.demand is
  'Optional community demand rating from 1 (low) to 5 (high) stars.';
