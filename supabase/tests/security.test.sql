begin;
select plan(4);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.items'::regclass),
  'items has row level security enabled'
);

select ok(
  has_table_privilege('anon', 'public.items', 'SELECT')
  and not has_table_privilege('anon', 'public.items', 'INSERT')
  and not has_table_privilege('anon', 'public.items', 'UPDATE')
  and not has_table_privilege('anon', 'public.items', 'DELETE'),
  'anonymous role can read but has no write grants'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.items (name, value) values ('security-test-unauthorized', 1)$$,
  '42501', null,
  'authenticated user outside the allowlist cannot insert'
);
reset role;

select ok(
  (select count(*) >= 1 from pg_policies where schemaname = 'public' and tablename = 'items' and cmd = 'SELECT'),
  'public read policy is present'
);

select * from finish();
rollback;
