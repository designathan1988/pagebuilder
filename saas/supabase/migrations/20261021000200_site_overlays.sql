-- Site Editor customizations (the extension that edits any site): one project per row, stored whole in spec
-- (the same JSON as the extension, site-editor/src/shared/model.ts). Members read; editors create and change; admins delete.
-- Publishing gives a public key: the sites' wc-runtime.js fetches the project by it from the "overlay" function, which
-- reads with the secret key. The table itself is never open to anyone not signed in.

create table public.site_overlays (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- the editor project this customization belongs to (optional)
  project_id   uuid references public.projects(id) on delete set null,
  -- the project id inside the extension: sync finds the row by it
  local_id     text not null check (char_length(local_id) between 1 and 80),
  name         text not null check (char_length(name) between 1 and 120),
  matches      text[] not null default '{}',
  spec         jsonb not null,
  published    boolean not null default false,
  public_key   text unique check (public_key is null or public_key ~ '^[A-Za-z0-9_-]{20,64}$'),
  updated_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, local_id),
  -- 5 MB per project: uploaded images become data URLs inside the project
  constraint site_overlays_spec_size check (pg_column_size(spec) <= 5 * 1024 * 1024)
);
create index site_overlays_workspace_id_idx on public.site_overlays (workspace_id);
create index site_overlays_project_id_idx on public.site_overlays (project_id);

alter table public.site_overlays enable row level security;

create policy "so: members read" on public.site_overlays for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "so: editors insert" on public.site_overlays for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "so: editors update" on public.site_overlays for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "so: admins delete" on public.site_overlays for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create trigger site_overlays_touch before update on public.site_overlays
  for each row execute function private.touch_updated_at();

-- the linked project must belong to the same workspace
create or replace function private.check_overlay_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.workspace_id = new.workspace_id
  ) then
    raise exception 'overlay_project_other_workspace';
  end if;
  return new;
end $$;
create trigger site_overlays_project_check before insert or update on public.site_overlays
  for each row execute function private.check_overlay_project();
