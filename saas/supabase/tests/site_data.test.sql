-- Testes do banco de dados dos apps publicados (site_members, site_records): rodar depois das migrações
-- (tests/run.sh) e dos testes de site_overlays, que criam a Carla (dona de um workspace).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'eva@exemplo.com');

-- a função site-data grava com a chave secreta (aqui, sem papel): um site da Carla, um membro e duas linhas
do $$
declare ws uuid; proj uuid; site uuid; member uuid;
begin
  select workspace_id into ws from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333' limit 1;
  insert into public.projects (workspace_id, name) values (ws, 'Mural') returning id into proj;
  insert into public.sites (project_id, workspace_id, slug, version, published_at, data_rules)
    values (proj, ws, 'mural', 1, now(), '[{"name":"recados","read":"public","write":"members"}]') returning id into site;
  insert into public.site_members (site_id, workspace_id, email, name, password_hash)
    values (site, ws, 'ana@exemplo.com', 'Ana', 'pbkdf2$600000$c2Fs$aGFzaA') returning id into member;
  insert into public.site_records (site_id, workspace_id, collection, data, owner_id)
    values (site, ws, 'recados', '{"texto":"Olá"}', member), (site, ws, 'recados', '{"texto":"Oi"}', null);
  begin
    insert into public.site_members (site_id, workspace_id, email, password_hash) values (site, ws, 'ANA@exemplo.com', 'x');
    raise exception 'e-mail com maiúsculas entrou';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_records (site_id, workspace_id, collection, data) values (site, ws, 'Recados!', '{}');
    raise exception 'nome de tabela inválido entrou';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_records (site_id, workspace_id, collection, data) values (site, ws, 'recados', '[1]');
    raise exception 'linha que não é objeto entrou';
  exception when check_violation then null;
  end;
end $$;

-- a Carla lê as linhas e os membros pelo painel, muda o papel, mas nunca lê a senha
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  assert (select count(*) from public.site_records) = 2, 'a dona lê as linhas';
  assert (select count(*) from public.site_members) = 1, 'a dona lê os membros';
  update public.site_members set role = 'admin' where email = 'ana@exemplo.com';
  get diagnostics changed = row_count;
  assert changed = 1, 'a dona faz a Ana administradora do site';
  begin
    perform password_hash from public.site_members;
    raise exception 'a senha saiu pelo painel';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.site_members set password_hash = 'x';
    raise exception 'o painel trocou a senha';
  exception when insufficient_privilege then null;
  end;
end $$;

-- a Eva, de outro workspace, não vê nada do site da Carla
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
do $$
declare changed int;
begin
  assert (select count(*) from public.site_records) = 0, 'Eva não lê linhas da Carla';
  assert (select count(*) from public.site_members) = 0, 'Eva não lê membros da Carla';
  delete from public.site_records;
  get diagnostics changed = row_count;
  assert changed = 0, 'Eva não apaga';
end $$;

-- quem não está logado não lê nada direto do banco
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  assert (select count(*) from public.site_records) = 0, 'visitante não lê o banco direto';
end $$;

-- a Carla apaga uma linha
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  delete from public.site_records where data->>'texto' = 'Oi';
  get diagnostics changed = row_count;
  assert changed = 1, 'a dona apaga';
end $$;
reset role;
select 'site_data: ok';
