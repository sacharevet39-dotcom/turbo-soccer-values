drop policy if exists "Admins manage promo codes" on public.promo_codes;
drop policy if exists "Admins insert promo codes" on public.promo_codes;
drop policy if exists "Admins update promo codes" on public.promo_codes;
drop policy if exists "Admins delete promo codes" on public.promo_codes;

create policy "Admins insert promo codes" on public.promo_codes
for insert to authenticated with check ((select public.is_turbo_admin()));
create policy "Admins update promo codes" on public.promo_codes
for update to authenticated using ((select public.is_turbo_admin()))
with check ((select public.is_turbo_admin()));
create policy "Admins delete promo codes" on public.promo_codes
for delete to authenticated using ((select public.is_turbo_admin()));

create or replace function public.enforce_item_variant_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_variant_count integer;
begin
  if new.variant_parent_id is null then
    return new;
  end if;
  perform 1 from public.items where id = new.variant_parent_id for update;
  select count(*) into v_variant_count
  from public.items
  where variant_parent_id = new.variant_parent_id
    and id is distinct from new.id;
  if v_variant_count >= 15 then
    raise exception 'An item can have no more than 15 color variants' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_item_variant_limit() from public, anon, authenticated;
drop trigger if exists enforce_item_variant_limit on public.items;
create trigger enforce_item_variant_limit
before insert or update of variant_parent_id on public.items
for each row execute function public.enforce_item_variant_limit();
