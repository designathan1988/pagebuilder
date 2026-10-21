-- RLS and limit tests: run after the migrations (saas/supabase/tests/run.sh).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.com'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@exemplo.com');

do $$ begin
  assert (select count(*) from public.workspaces) = 2, 'each new account gets a workspace';
  assert (select count(*) from public.workspace_members where role = 'owner') = 2, 'the account owns its workspace';
end $$;

-- Ana, signed in
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare ws uuid;
begin
  assert (select count(*) from public.workspaces) = 1, 'Ana sees only her own workspace';
  select id into ws from public.workspaces;
  insert into public.projects (workspace_id, name) values (ws, 'Site 1'), (ws, 'Site 2'), (ws, 'Site 3');
  begin
    insert into public.projects (workspace_id, name) values (ws, 'Site 4');
    raise exception 'the free plan limit let it through';
  exception when others then
    assert sqlerrm = 'plan_limit_projects', 'expected error: ' || sqlerrm;
  end;
  assert (public.workspace_plan(ws)).id = 'gratis', 'without a subscription, the free plan';
  assert (select count(*) from public.plans) = 3, 'plans are public';
  assert (select id from public.create_workspace('Agência da Ana')) is not null, 'create_workspace returns the row';
  assert (select count(*) from public.workspaces) = 2, 'the new workspace shows up';
end $$;

-- Bruno sees nothing of Ana's and cannot write to her workspace
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare ana_ws uuid;
begin
  assert (select count(*) from public.projects) = 0, 'Bruno does not see Ana''s projects';
  reset role;
  select workspace_id into ana_ws from public.workspace_members where user_id = '11111111-1111-1111-1111-111111111111' limit 1;
  set role authenticated;
  begin
    insert into public.projects (workspace_id, name) values (ana_ws, 'Invasão');
    raise exception 'Bruno wrote to Ana''s workspace';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.workspace_members (workspace_id, user_id, role) values (ana_ws, '22222222-2222-2222-2222-222222222222', 'admin');
    raise exception 'Bruno made himself a member of Ana''s workspace';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (workspace_id, plan_id, status) values (ana_ws, 'agencia', 'active');
    raise exception 'Bruno wrote a subscription';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.billing_events) = 0, 'billing events are invisible';
end $$;

-- The backend (secret key) activates Ana's Pro plan: the limit goes up
reset role;
insert into public.subscriptions (workspace_id, plan_id, status, paid_until)
select workspace_id, 'pro', 'active', current_date + 30 from public.workspace_members
where user_id = '11111111-1111-1111-1111-111111111111' and role = 'owner' order by created_at limit 1;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare ws uuid;
begin
  select s.workspace_id into ws from public.subscriptions s;
  assert (public.workspace_plan(ws)).id = 'pro', 'an active subscription grants the Pro plan';
  insert into public.projects (workspace_id, name) values (ws, 'Site 4');
end $$;
reset role;
\echo 'RLS: all tests passed'
