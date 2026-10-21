-- Testes de RLS e limites: rodar depois das migrações (saas/supabase/tests/run.sh).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.com'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@exemplo.com');

do $$ begin
  assert (select count(*) from public.workspaces) = 2, 'cada conta nova ganha um workspace';
  assert (select count(*) from public.workspace_members where role = 'owner') = 2, 'a conta é dona do seu workspace';
end $$;

-- Ana, logada
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare ws uuid;
begin
  assert (select count(*) from public.workspaces) = 1, 'Ana vê só o próprio workspace';
  select id into ws from public.workspaces;
  insert into public.projects (workspace_id, name) values (ws, 'Site 1'), (ws, 'Site 2'), (ws, 'Site 3');
  begin
    insert into public.projects (workspace_id, name) values (ws, 'Site 4');
    raise exception 'o limite do plano grátis deixou passar';
  exception when others then
    assert sqlerrm = 'plan_limit_projects', 'erro esperado: ' || sqlerrm;
  end;
  assert (public.workspace_plan(ws)).id = 'gratis', 'sem assinatura, plano grátis';
  assert (select count(*) from public.plans) = 3, 'planos são públicos';
  assert (select id from public.create_workspace('Agência da Ana')) is not null, 'create_workspace devolve a linha';
  assert (select count(*) from public.workspaces) = 2, 'o novo workspace aparece';
end $$;

-- Bruno não vê nada da Ana e não consegue escrever no workspace dela
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare ana_ws uuid;
begin
  assert (select count(*) from public.projects) = 0, 'Bruno não vê projetos da Ana';
  reset role;
  select workspace_id into ana_ws from public.workspace_members where user_id = '11111111-1111-1111-1111-111111111111' limit 1;
  set role authenticated;
  begin
    insert into public.projects (workspace_id, name) values (ana_ws, 'Invasão');
    raise exception 'Bruno escreveu no workspace da Ana';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.workspace_members (workspace_id, user_id, role) values (ana_ws, '22222222-2222-2222-2222-222222222222', 'admin');
    raise exception 'Bruno se colocou como membro da Ana';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (workspace_id, plan_id, status) values (ana_ws, 'agencia', 'active');
    raise exception 'Bruno gravou uma assinatura';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.billing_events) = 0, 'eventos de cobrança invisíveis';
end $$;

-- O backend (chave secreta) ativa o plano Pro da Ana: o limite sobe
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
  assert (public.workspace_plan(ws)).id = 'pro', 'assinatura ativa vale o plano Pro';
  insert into public.projects (workspace_id, name) values (ws, 'Site 4');
end $$;
reset role;
\echo 'RLS: todos os testes passaram'
