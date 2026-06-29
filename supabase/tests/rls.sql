begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table test_ids (
  key text primary key,
  value uuid not null
);

insert into test_ids values
  ('user_a', '10000000-0000-0000-0000-000000000001'),
  ('user_b', '10000000-0000-0000-0000-000000000002');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', (select value from test_ids where key='user_a'), 'authenticated', 'authenticated', 'a@example.com', '', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', (select value from test_ids where key='user_b'), 'authenticated', 'authenticated', 'b@example.com', '', now(), now(), now(), '', '', '', '');

insert into test_ids
select 'workspace_a', workspace_id from public.memberships where user_id = (select value from test_ids where key='user_a');
insert into test_ids
select 'workspace_b', workspace_id from public.memberships where user_id = (select value from test_ids where key='user_b');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select value from test_ids where key='user_a'),
  'role', 'authenticated'
)::text, true);

select is(
  (select count(*)::integer from public.workspaces),
  1,
  'a user sees only their own workspace'
);

select is(
  (select count(*)::integer from public.memberships where workspace_id = (select value from test_ids where key='workspace_b')),
  0,
  'membership rows do not leak across workspaces'
);

select throws_ok(
  format(
    'insert into public.audits(workspace_id,name,currency,created_by) values (%L,%L,%L,%L)',
    (select value from test_ids where key='workspace_b'), 'Guessed workspace audit', 'USD',
    (select value from test_ids where key='user_a')
  ),
  '42501',
  null,
  'a guessed workspace ID cannot be used to create an audit'
);

select is(
  (select count(*)::integer from public.audit_runs where id = '90000000-0000-0000-0000-000000000001'),
  0,
  'guessed audit-run IDs reveal no rows'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id='contracts' and name like
    (select value::text || '/%' from test_ids where key='workspace_b')),
  0,
  'private storage metadata does not leak across workspaces'
);

set local role postgres;
update public.subscriptions set plan_code='team', status='active'
where workspace_id=(select value from test_ids where key='workspace_a');
insert into public.memberships(workspace_id,user_id,role)
values (
  (select value from test_ids where key='workspace_a'),
  (select value from test_ids where key='user_b'),
  'viewer'
);
insert into public.invitations(workspace_id,email,role,token_hash,invited_by)
values (
  (select value from test_ids where key='workspace_a'),
  'future@example.com',
  'analyst',
  repeat('a', 64),
  (select value from test_ids where key='user_a')
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select value from test_ids where key='user_b'),
  'role', 'authenticated'
)::text, true);

select throws_ok(
  format(
    'update public.memberships set role=%L where workspace_id=%L and user_id=%L',
    'admin', (select value from test_ids where key='workspace_a'),
    (select value from test_ids where key='user_b')
  ),
  '42501',
  null,
  'a viewer cannot promote their own role'
);

select throws_ok(
  format(
    'delete from public.memberships where workspace_id=%L and user_id=%L',
    (select value from test_ids where key='workspace_a'),
    (select value from test_ids where key='user_a')
  ),
  '42501',
  null,
  'a viewer cannot remove the workspace owner'
);

select is(
  (select count(*)::integer from public.invitations where workspace_id = (select value from test_ids where key='workspace_a')),
  0,
  'a viewer cannot read workspace invitation tokens or invitation metadata'
);

select is(
  public.workspace_role_for((select value from test_ids where key='workspace_a'))::text,
  'viewer',
  'workspace role resolution is scoped to the current user'
);

select * from finish();
rollback;
