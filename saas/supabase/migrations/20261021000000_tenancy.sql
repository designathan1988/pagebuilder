-- Contas, workspaces (empresas ou agências), membros com papéis, projetos e versões.
-- Regras da documentação do Supabase (guides/database/postgres/row-level-security):
-- RLS em toda tabela exposta, uma política por operação, "to authenticated", (select auth.uid()),
-- índices nas colunas usadas pelas políticas e funções security definer num schema privado com search_path vazio.

create schema if not exists private;

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.workspace_role not null default 'editor',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- a chave primária não indexa user_id sozinho
create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  -- o documento do editor (DocumentJson), como o autosave o guarda
  document     jsonb,
  -- modo cliente: o cliente final só edita textos e imagens (Etapa 5)
  client_mode  boolean not null default false,
  updated_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_workspace_id_idx on public.projects (workspace_id);

create table public.project_versions (
  id           bigint generated always as identity primary key,
  project_id   uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document     jsonb not null,
  label        text,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index project_versions_project_idx on public.project_versions (project_id, created_at desc);
create index project_versions_workspace_id_idx on public.project_versions (workspace_id);

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;
alter table public.project_versions  enable row level security;

-- Funções auxiliares no schema privado (não exposto pela API): passam por cima do RLS de workspace_members,
-- o que evita políticas recursivas.
create or replace function private.my_workspace_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.workspace_id from public.workspace_members m where m.user_id = (select auth.uid());
$$;

create or replace function private.has_role(ws uuid, roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = any(roles)
  );
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- perfis: cada pessoa lê e edita o próprio
create policy "profiles: own read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: own update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces
create policy "ws: members read" on public.workspaces for select to authenticated
  using (id in (select private.my_workspace_ids()));
create policy "ws: owner/admin update" on public.workspaces for update to authenticated
  using (private.has_role(id, array['owner', 'admin']::public.workspace_role[]));
create policy "ws: owner delete" on public.workspaces for delete to authenticated
  using (private.has_role(id, array['owner']::public.workspace_role[]));
-- criar workspace passa pela função public.create_workspace (abaixo), que já devolve a linha

-- membros
create policy "wm: members read" on public.workspace_members for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "wm: admins insert" on public.workspace_members for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');
create policy "wm: admins update" on public.workspace_members for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner')
  with check (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');
create policy "wm: admins delete" on public.workspace_members for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');

-- projetos
create policy "p: members read" on public.projects for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "p: editors insert" on public.projects for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "p: editors update" on public.projects for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "p: admins delete" on public.projects for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

-- versões: só acrescentar, pelo cliente
create policy "pv: members read" on public.project_versions for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "pv: editors insert" on public.project_versions for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

-- updated_at mantido pelo banco
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger projects_touch before update on public.projects
  for each row execute function private.touch_updated_at();

-- Criar workspace: a pessoa vira dona na mesma transação e a linha volta para o cliente.
create or replace function public.create_workspace(workspace_name text)
returns public.workspaces language plpgsql security definer set search_path = '' as $$
declare
  made public.workspaces;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.workspaces (name, created_by) values (workspace_name, (select auth.uid())) returning * into made;
  insert into public.workspace_members (workspace_id, user_id, role) values (made.id, (select auth.uid()), 'owner');
  return made;
end $$;
revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- Cada conta nova ganha um perfil e um workspace pessoal.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  display text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name) values (new.id, display);
  insert into public.workspaces (name, created_by) values ('Meu espaço', new.id) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
