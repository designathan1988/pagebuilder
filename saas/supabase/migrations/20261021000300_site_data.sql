-- The published apps' database (the runtime's app.db and app.auth, js/app-layer/runtime.js): each site has its
-- own tables (site_records rows with the table name in "collection") and its own members (site_members, the people
-- who sign up on the site, separate from the platform accounts). Visitors never talk to Postgres: the sites Worker
-- forwards /_api/* to the site-data function, which checks the access rules the editor published
-- (sites.data_rules) and uses the secret key. Workspace members read and delete through the dashboard.

alter table public.sites add column data_rules jsonb not null default '[]'::jsonb
  check (jsonb_typeof(data_rules) = 'array' and pg_column_size(data_rules) <= 16384);

create table public.site_members (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  name          text not null default '' check (char_length(name) <= 120),
  -- PBKDF2-HMAC-SHA256, 600 000 iterations (OWASP Password Storage Cheat Sheet): pbkdf2$<iterations>$<salt>$<hash>
  password_hash text not null,
  role          text not null default 'member' check (role in ('member', 'admin')),
  created_at    timestamptz not null default now(),
  unique (site_id, email)
);
create index site_members_workspace_idx on public.site_members (workspace_id);

create table public.site_records (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  collection   text not null check (collection ~ '^[a-z][a-z0-9_]{0,39}$'),
  data         jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  -- the member who created the row ("owner" rules read by it); null when the creator was not signed in
  owner_id     uuid references public.site_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index site_records_list_idx on public.site_records (site_id, collection, created_at desc);
create index site_records_owner_idx on public.site_records (owner_id);
create index site_records_workspace_idx on public.site_records (workspace_id);
create index site_records_data_idx on public.site_records using gin (data jsonb_path_ops);

create trigger site_records_touch before update on public.site_records
  for each row execute function private.touch_updated_at();

alter table public.site_members enable row level security;
alter table public.site_records enable row level security;

-- the dashboard: workspace members read; admins change a site member's role and delete
create policy "smem: members read" on public.site_members for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "smem: admins update" on public.site_members for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
  with check (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
create policy "smem: admins delete" on public.site_members for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "srec: members read" on public.site_records for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "srec: editors delete" on public.site_records for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

-- the password never leaves the database through the dashboard: the column stays outside what "authenticated" can read
revoke select on public.site_members from authenticated;
grant select (id, site_id, workspace_id, email, name, role, created_at) on public.site_members to authenticated;
revoke update on public.site_members from authenticated;
grant update (role) on public.site_members to authenticated;
