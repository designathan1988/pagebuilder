-- Tests of the published apps' database (site_members, site_records): run after the migrations
-- (tests/run.sh) and the site_overlays tests, which create Carla (owner of a workspace).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'eva@exemplo.com');

-- the site-data function writes with the secret key (here, with no role): a site of Carla's, a member and two rows
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
    raise exception 'an email with uppercase letters got in';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_records (site_id, workspace_id, collection, data) values (site, ws, 'Recados!', '{}');
    raise exception 'an invalid table name got in';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_records (site_id, workspace_id, collection, data) values (site, ws, 'recados', '[1]');
    raise exception 'a row that is not an object got in';
  exception when check_violation then null;
  end;
end $$;

-- Carla reads the rows and the members through the dashboard, changes the role, but never reads the password
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  assert (select count(*) from public.site_records) = 2, 'the owner reads the rows';
  assert (select count(*) from public.site_members) = 1, 'the owner reads the members';
  update public.site_members set role = 'admin' where email = 'ana@exemplo.com';
  get diagnostics changed = row_count;
  assert changed = 1, 'the owner makes Ana an administrator of the site';
  begin
    perform password_hash from public.site_members;
    raise exception 'the password leaked through the dashboard';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.site_members set password_hash = 'x';
    raise exception 'the dashboard changed the password';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eva, from another workspace, sees nothing of Carla's site
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
do $$
declare changed int;
begin
  assert (select count(*) from public.site_records) = 0, 'Eva does not read Carla''s rows';
  assert (select count(*) from public.site_members) = 0, 'Eva does not read Carla''s members';
  delete from public.site_records;
  get diagnostics changed = row_count;
  assert changed = 0, 'Eva does not delete';
end $$;

-- someone not signed in reads nothing directly from the database
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  assert (select count(*) from public.site_records) = 0, 'a visitor does not read the database directly';
end $$;

-- Carla deletes a row
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  delete from public.site_records where data->>'texto' = 'Oi';
  get diagnostics changed = row_count;
  assert changed = 1, 'the owner deletes';
end $$;
reset role;
select 'site_data: ok';
