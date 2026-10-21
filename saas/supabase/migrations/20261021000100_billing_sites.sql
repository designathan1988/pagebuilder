-- Planos, assinaturas (Asaas), sites publicados, domínios próprios, formulários recebidos e uso da IA.
-- O cliente só lê estas tabelas: quem escreve são as Edge Functions, com a chave secreta (passa por cima do RLS).

create table public.plans (
  id                 text primary key,
  name               text not null,
  price_cents        integer not null check (price_cents >= 0),
  max_projects       integer not null,
  max_sites          integer not null,
  max_domains        integer not null,
  ai_credits_month   integer not null,
  show_badge         boolean not null default true,
  client_mode        boolean not null default false,
  sort_order         integer not null default 0
);

insert into public.plans (id, name, price_cents, max_projects, max_sites, max_domains, ai_credits_month, show_badge, client_mode, sort_order) values
  ('gratis',  'Grátis',  0,     3,   1,  0,  10,   true,  false, 0),
  ('pro',     'Pro',     3900,  20,  5,  5,  100,  false, false, 1),
  ('agencia', 'Agência', 12900, 200, 40, 40, 400, false, true,  2);

create type public.subscription_status as enum ('active', 'pending', 'past_due', 'canceled');

create table public.subscriptions (
  workspace_id          uuid primary key references public.workspaces(id) on delete cascade,
  plan_id               text not null references public.plans(id),
  status                public.subscription_status not null default 'pending',
  asaas_customer_id     text,
  asaas_subscription_id text unique,
  -- a última fatura gerada: o link de pagamento do Asaas (Pix, boleto ou cartão)
  invoice_url           text,
  -- o plano pedido numa troca: vale quando o primeiro pagamento dele for confirmado
  pending_plan_id       text references public.plans(id),
  paid_until            date,
  updated_at            timestamptz not null default now()
);

-- eventos do webhook do Asaas: a entrega é "pelo menos uma vez", então o id do evento é a chave
create table public.billing_events (
  id           text primary key,
  event        text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create table public.sites (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null unique references public.projects(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  -- o subdomínio: <slug>.<domínio dos sites>
  slug             text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  version          integer not null default 0,
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index sites_workspace_id_idx on public.sites (workspace_id);

create table public.domains (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references public.sites(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  hostname         text not null unique,
  cf_hostname_id   text,
  status           text not null default 'pending',
  ssl_status       text not null default 'initializing',
  -- os registros que o cliente precisa criar no DNS dele
  verification     jsonb,
  created_at       timestamptz not null default now(),
  checked_at       timestamptz
);
create index domains_workspace_id_idx on public.domains (workspace_id);
create index domains_site_id_idx on public.domains (site_id);

create table public.form_submissions (
  id           bigint generated always as identity primary key,
  site_id      uuid not null references public.sites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  page         text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index form_submissions_workspace_idx on public.form_submissions (workspace_id, created_at desc);

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  input_tokens  integer not null,
  output_tokens integer not null,
  credits       integer not null,
  created_at    timestamptz not null default now()
);
create index ai_usage_workspace_idx on public.ai_usage (workspace_id, created_at desc);

alter table public.plans            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.billing_events   enable row level security;
alter table public.sites            enable row level security;
alter table public.domains          enable row level security;
alter table public.form_submissions enable row level security;
alter table public.ai_usage         enable row level security;

-- os planos são públicos (a página de preços os lê sem login)
create policy "plans: everyone reads" on public.plans for select to anon, authenticated using (true);
create policy "subs: members read" on public.subscriptions for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
-- billing_events: nenhuma política, só a chave secreta acessa
create policy "sites: members read" on public.sites for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "domains: members read" on public.domains for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "forms: members read" on public.form_submissions for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));
create policy "forms: editors mark read" on public.form_submissions for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (private.has_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));
create policy "forms: admins delete" on public.form_submissions for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
create policy "ai: members read" on public.ai_usage for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));

-- O plano em vigor de um workspace: o assinado enquanto pago (com 5 dias de tolerância), senão o grátis.
create or replace function public.workspace_plan(ws uuid)
returns public.plans language sql stable security definer set search_path = '' as $$
  select p.* from public.plans p
  where p.id = coalesce((
    select s.plan_id from public.subscriptions s
    where s.workspace_id = ws and (
      -- pago, com 5 dias de tolerância depois do vencimento
      (s.status in ('active', 'past_due') and s.paid_until is not null and s.paid_until + 5 >= current_date)
      -- cancelado: vale até o fim do período já pago
      or (s.status = 'canceled' and s.paid_until is not null and s.paid_until >= current_date)
    )
  ), 'gratis');
$$;
revoke execute on function public.workspace_plan(uuid) from public, anon;
grant execute on function public.workspace_plan(uuid) to authenticated, service_role;

-- Créditos de IA usados no mês corrente
create or replace function public.ai_credits_used(ws uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(credits), 0)::integer from public.ai_usage
  where workspace_id = ws and created_at >= date_trunc('month', now());
$$;
revoke execute on function public.ai_credits_used(uuid) from public, anon;
grant execute on function public.ai_credits_used(uuid) to authenticated, service_role;

-- Limite de projetos do plano, conferido no banco: nenhum cliente passa por cima dele
create or replace function private.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed integer := (public.workspace_plan(new.workspace_id)).max_projects;
  held integer;
begin
  -- quem não é membro é recusado pelo RLS logo depois: o gatilho não lhe diz nada sobre o workspace
  if (select auth.uid()) is not null and new.workspace_id not in (select private.my_workspace_ids()) then
    return new;
  end if;
  select count(*) into held from public.projects where workspace_id = new.workspace_id;
  if held >= allowed then
    raise exception 'plan_limit_projects' using hint = 'Faça upgrade do plano para criar mais projetos.';
  end if;
  return new;
end $$;
create trigger projects_limit before insert on public.projects
  for each row execute function private.enforce_project_limit();
