-- RLS tests of the Site Editor customizations (site_overlays): run after the migrations (tests/run.sh).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'carla@exemplo.com'),
  ('44444444-4444-4444-4444-444444444444', 'davi@exemplo.com');

-- Carla, owner of the workspace, creates and publishes a customization linked to one of her projects
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare ws uuid; proj uuid;
begin
  select id into ws from public.workspaces limit 1;
  insert into public.projects (workspace_id, name) values (ws, 'Loja') returning id into proj;
  insert into public.site_overlays (workspace_id, project_id, local_id, name, matches, spec)
    values (ws, proj, 'p_loja', 'Sistema da loja', '{https://loja.exemplo.com/*}', '{"id":"p_loja","edits":[]}');
  assert (select updated_by from public.site_overlays) = '33333333-3333-3333-3333-333333333333', 'who saved it is recorded';
  update public.site_overlays set published = true, public_key = 'abcdefghijklmnopqrstuvwxyz012345' where local_id = 'p_loja';
  assert (select published from public.site_overlays), 'it was published';
  begin
    update public.site_overlays set public_key = 'curta' where local_id = 'p_loja';
    raise exception 'a short public key got through';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_overlays (workspace_id, local_id, name, spec) values (ws, 'p_loja', 'Repetido', '{}');
    raise exception 'the same local_id got into the workspace twice';
  exception when unique_violation then null;
  end;
end $$;

-- Davi neither sees nor changes Carla's customization, nor links a project of his to it
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
declare carla_ws uuid; davi_ws uuid; changed int;
begin
  assert (select count(*) from public.site_overlays) = 0, 'Davi does not see Carla''s customizations';
  update public.site_overlays set name = 'Invadido';
  get diagnostics changed = row_count;
  assert changed = 0, 'Davi does not change it';
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 0, 'Davi does not delete it';
  reset role;
  select workspace_id into carla_ws from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333' limit 1;
  set role authenticated;
  begin
    insert into public.site_overlays (workspace_id, local_id, name, spec) values (carla_ws, 'p_x', 'Intruso', '{}');
    raise exception 'Davi wrote to Carla''s workspace';
  exception when insufficient_privilege then null;
  end;
  -- in his own workspace, he cannot point to a project of Carla's
  select id into davi_ws from public.workspaces limit 1;
  reset role;
  begin
    insert into public.site_overlays (workspace_id, project_id, local_id, name, spec)
      values (davi_ws, (select id from public.projects where name = 'Loja'), 'p_y', 'Cruzado', '{}');
    raise exception 'linked a project from another workspace';
  exception when others then
    assert sqlerrm = 'overlay_project_other_workspace', 'expected error: ' || sqlerrm;
  end;
  set role authenticated;
end $$;

-- Without login (anon) the table stays closed; public reading is only through the overlay function, with the secret key
reset role;
set role anon;
do $$
begin
  begin
    assert (select count(*) from public.site_overlays) = 0, 'anon sees nothing';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A "viewer" member reads but does not change; only admin/owner deletes
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
  assert (select count(*) from public.site_overlays) = 1, 'the viewer sees it';
  update public.site_overlays set name = 'Mudado pelo viewer';
  get diagnostics changed = row_count;
  assert changed = 0, 'the viewer does not change it';
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
  assert changed = 1, 'the editor changes it';
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 0, 'the editor does not delete it';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$
declare changed int;
begin
  delete from public.site_overlays;
  get diagnostics changed = row_count;
  assert changed = 1, 'the owner deletes it';
end $$;
reset role;
select 'site_overlays: ok';
