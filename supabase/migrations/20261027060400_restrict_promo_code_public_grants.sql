revoke all privileges on table public.promo_codes from public, anon, authenticated;
grant select on table public.promo_codes to anon;
grant select, insert, update, delete on table public.promo_codes to authenticated;
