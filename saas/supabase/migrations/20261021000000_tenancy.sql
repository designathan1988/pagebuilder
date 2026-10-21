-- Accounts, workspaces (companies or agencies), members with roles, projects and versions.
-- Rules from the Supabase documentation (guides/database/postgres/row-level-security):
-- RLS on every exposed table, one policy per operation, "to authenticated", (select auth.uid()),
-- indexes on the columns the policies use, and security definer functions in a private schema with an empty search_path.

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
-- the primary key does not index user_id on its own
create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  -- the editor document (DocumentJson), as autosave stores it
  document     jsonb,
  -- client mode: the end client only edits texts and images (Stage 5)
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

-- Helper functions in the private schema (not exposed by the API): they bypass the RLS of workspace_members,
-- which avoids recursive policies.
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

-- profiles: each person reads and edits their own
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
-- creating a workspace goes through the function public.create_workspace (below), which returns the row

-- members
create policy "wm: members read" on public.workspace_members for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "wm: admins insert" on public.workspace_members for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');
create policy "wm: admins update" on public.workspace_members for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner')
  with check (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');
create policy "wm: admins delete" on public.workspace_members for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]) and role <> 'owner');

-- projects
create policy "p: members read" on public.projects for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "p: editors insert" on public.projects for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "p: editors update" on public.projects for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "p: admins delete" on public.projects for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

-- versions: append only, from the client
create policy "pv: members read" on public.project_versions for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "pv: editors insert" on public.project_versions for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

-- updated_at kept by the database
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger projects_touch before update on public.projects
  for each row execute function private.touch_updated_at();

-- Creating a workspace: the person becomes its owner in the same transaction and the row goes back to the client.
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

-- Each new account gets a profile and a personal workspace.
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
