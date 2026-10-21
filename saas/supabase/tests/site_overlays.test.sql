-- Testes de RLS das personalizações do Site Editor (site_overlays): rodar depois das migrações (tests/run.sh).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'carla@exemplo.com'),
  ('44444444-4444-4444-4444-444444444444', 'davi@exemplo.com');

-- Carla, dona do workspace, cria e publica uma personalização ligada a um projeto dela
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare ws uuid; proj uuid;
begin
  select id into ws from public.workspaces limit 1;
  insert into public.projects (workspace_id, name) values (ws, 'Loja') returning id into proj;
  insert into public.site_overlays (workspace_id, project_id, local_id, name, matches, spec)
    values (ws, proj, 'p_loja', 'Sistema da loja', '{https://loja.exemplo.com/*}', '{"id":"p_loja","edits":[]}');
  assert (select updated_by from public.site_overlays) = '33333333-3333-3333-3333-333333333333', 'quem gravou fica registrado';
  update public.site_overlays set published = true, public_key = 'abcdefghijklmnopqrstuvwxyz012345' where local_id = 'p_loja';
  assert (select published from public.site_overlays), 'publicou';
  begin
    update public.site_overlays set public_key = 'curta' where local_id = 'p_loja';
    raise exception 'chave pública curta passou';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_overlays (workspace_id, local_id, name, spec) values (ws, 'p_loja', 'Repetido', '{}');
    raise exception 'o mesmo local_id entrou duas vezes no workspace';
  exception when unique_violation then null;
  end;
end $$;

-- Davi não vê nem altera a personalização da Carla, nem liga um projeto dele a ela
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
declare carla_ws uuid; davi_ws uuid; changed int;
begin
  assert (select count(*) from public.site_overlays) = 0, 'Davi não vê personalizações da Carla';
  update public.site_overlays set name = 'Invadido';
  get diagnostics changed = row_count;
  assert changed = 0, 'Davi não altera';
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 0, 'Davi não exclui';
  reset role;
  select workspace_id into carla_ws from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333' limit 1;
  set role authenticated;
  begin
    insert into public.site_overlays (workspace_id, local_id, name, spec) values (carla_ws, 'p_x', 'Intruso', '{}');
    raise exception 'Davi gravou no workspace da Carla';
  exception when insufficient_privilege then null;
  end;
  -- no próprio workspace, não pode apontar para um projeto da Carla
  select id into davi_ws from public.workspaces limit 1;
  reset role;
  begin
    insert into public.site_overlays (workspace_id, project_id, local_id, name, spec)
      values (davi_ws, (select id from public.projects where name = 'Loja'), 'p_y', 'Cruzado', '{}');
    raise exception 'ligou projeto de outro workspace';
  exception when others then
    assert sqlerrm = 'overlay_project_other_workspace', 'erro esperado: ' || sqlerrm;
  end;
  set role authenticated;
end $$;

-- Sem login (anon) a tabela fica fechada; a leitura pública é só pela função overlay, com a chave secreta
reset role;
set role anon;
do $$
begin
  begin
    assert (select count(*) from public.site_overlays) = 0, 'anon não vê nada';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Um membro "viewer" lê mas não altera; só admin/dono exclui
do $$
declare ws uuid;
begin
  select workspace_id into ws from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333' limit 1;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, '44444444-4444-4444-4444-444444444444', 'viewer');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
declare changed int;
begin
  assert (select count(*) from public.site_overlays) = 1, 'o viewer vê';
  update public.site_overlays set name = 'Mudado pelo viewer';
  get diagnostics changed = row_count;
  assert changed = 0, 'o viewer não altera';
end $$;
reset role;
do $$ begin
  update public.workspace_members set role = 'editor' where user_id = '44444444-4444-4444-4444-444444444444' and role = 'viewer';
end $$;
set role authenticated;
do $$
declare changed int;
begin
  update public.site_overlays set name = 'Mudado pelo editor';
  get diagnostics changed = row_count;
  assert changed = 1, 'o editor altera';
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 0, 'o editor não exclui';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 1, 'a dona exclui';
end $$;
reset role;
select 'site_overlays: ok';
