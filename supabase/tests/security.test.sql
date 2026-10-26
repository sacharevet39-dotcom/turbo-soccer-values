begin;
select plan(17);

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

select ok(
  (select relrowsecurity from pg_class where oid = 'private.admin_accounts'::regclass),
  'private admin accounts have row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'private.admin_accounts', 'SELECT')
  and not has_table_privilege('authenticated', 'private.admin_accounts', 'SELECT')
  and not has_table_privilege('anon', 'private.admin_audit_log', 'SELECT')
  and not has_table_privilege('authenticated', 'private.admin_audit_log', 'SELECT'),
  'browser roles cannot read private account or audit tables directly'
);

select ok(
  not has_function_privilege('anon', 'public.turbo_server_login_email(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.turbo_owner_accounts(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.turbo_owner_create_admin(uuid,uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.turbo_owner_update_admin(uuid,uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.turbo_owner_mark_password_reset(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.turbo_owner_revoke_sessions(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.turbo_server_login_email(text)', 'EXECUTE'),
  'server-only login and OWNER RPCs are not executable by browser roles'
);

select ok(
  not has_table_privilege('authenticated', 'private.admin_accounts', 'INSERT')
  and not has_table_privilege('authenticated', 'private.admin_accounts', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.admin_accounts', 'DELETE')
  and not has_table_privilege('authenticated', 'private.admin_users', 'INSERT')
  and not has_table_privilege('authenticated', 'private.admin_users', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.admin_users', 'DELETE'),
  'authenticated users cannot write directly to private role tables'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
  and (select count(*) = 3 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in (
           'Only allowlisted admin uploads item images',
           'Only allowlisted admin updates item images',
           'Only allowlisted admin deletes item images'
         )
         and roles @> array['authenticated']::name[]
         and not (roles @> array['anon']::name[])
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_turbo_admin%'),
  'Storage writes require an authenticated allowlisted admin policy'
);

select ok(
  exists (
    select 1 from private.admin_accounts
    where user_id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid
      and role = 'OWNER' and status = 'active'
  ),
  'the configured test OWNER is linked and active'
);

select throws_ok(
  $$update private.admin_accounts set role = 'ADMIN' where user_id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid$$,
  '42501', null,
  'OWNER role demotion is rejected'
);

select throws_ok(
  $$update private.admin_accounts set status = 'suspended' where user_id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid$$,
  '42501', null,
  'OWNER suspension is rejected'
);

select throws_ok(
  $$delete from private.admin_accounts where user_id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid$$,
  '42501', null,
  'OWNER account deletion is rejected'
);

select throws_ok(
  $$delete from private.admin_users where user_id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid$$,
  '42501', null,
  'OWNER allowlist removal is rejected'
);

select throws_ok(
  $$delete from auth.users where id = '99aa849a-29ee-44b5-8951-a2bfb4d590fa'::uuid$$,
  '42501', null,
  'deleting the OWNER Auth user through the foreign-key cascade is rejected'
);

select ok(
  lower(pg_get_functiondef('public.turbo_owner_update_admin(uuid,uuid,text,text,text,text,text)'::regprocedure)) like '%delete from auth.sessions%'
  and lower(pg_get_functiondef('public.turbo_owner_mark_password_reset(uuid,uuid)'::regprocedure)) like '%delete from auth.sessions%'
  and lower(pg_get_functiondef('public.turbo_owner_revoke_sessions(uuid,uuid)'::regprocedure)) like '%delete from auth.sessions%',
  'status changes, password resets, and explicit revocation delete Auth sessions'
);

select ok(
  lower(pg_get_functiondef('public.is_turbo_admin()'::regprocedure)) like '%auth.sessions%'
  and lower(pg_get_functiondef('public.is_turbo_admin()'::regprocedure)) like '%must_change_password%'
  and lower(pg_get_functiondef('public.is_turbo_admin()'::regprocedure)) like '%tokens_valid_after%',
  'catalogue authorization checks live sessions, required password changes, and token freshness'
);

select * from finish();
rollback;
