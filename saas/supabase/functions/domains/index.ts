// Domínio próprio de um site (Cloudflare for SaaS, custom hostnames; developers.cloudflare.com, lido em 2026-10-21):
// POST { action: 'add', siteId, hostname }  -> cria o hostname com validação HTTP e devolve o que o cliente põe no DNS
// POST { action: 'check', domainId }        -> atualiza status e SSL (pronto quando os dois estão "active")
// POST { action: 'remove', domainId }       -> apaga na Cloudflare e o mapeamento no Worker
import { adminClient, env } from '../_shared/env.ts';
import { ADMINS, caller, corsHeaders, failure, json, roleIn } from '../_shared/http.ts';
import { platform } from '../_shared/sites.ts';

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

async function cloudflare<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.required('CF_ZONE_ID')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.required('CF_API_TOKEN')}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json() as { success: boolean; result: T; errors: unknown[] };
  if (!data.success) throw new Error(`cloudflare ${path}: ${JSON.stringify(data.errors)}`);
  return data.result;
}

interface CustomHostname {
  id: string;
  status: string;
  ssl?: { status?: string; validation_records?: unknown[] };
  ownership_verification?: unknown;
  verification_errors?: unknown[];
}

function verificationOf(result: CustomHostname, hostname: string) {
  return {
    // o registro principal: CNAME do domínio do cliente para o alvo da plataforma
    cname: { name: hostname, value: env.required('CF_CNAME_TARGET') },
    ownership: result.ownership_verification ?? null,
    ssl: result.ssl?.validation_records ?? [],
    errors: result.verification_errors ?? [],
  };
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    if (req.method !== 'POST') return failure('method_not_allowed', 405);
    const who = await caller(req);
    if (!who) return failure('unauthorized', 401);
    const body = await req.json().catch(() => null) as Record<string, string> | null;
    if (!body) return failure('bad_request', 400);
    const admin = adminClient();

    if (body.action === 'add') {
      const { data: site } = await who.db.from('sites').select('id, workspace_id, slug').eq('id', body.siteId).maybeSingle();
      if (!site) return failure('not_found', 404);
      const role = await roleIn(who, site.workspace_id);
      if (!role || !ADMINS.includes(role)) return failure('forbidden', 403);
      const hostname = (body.hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
      if (!HOST.test(hostname) || hostname.endsWith(env.required('SITES_DOMAIN'))) return failure('invalid_hostname', 400);
      const { data: plan } = await admin.rpc('workspace_plan', { ws: site.workspace_id }).single();
      const { count } = await admin.from('domains').select('id', { count: 'exact', head: true }).eq('workspace_id', site.workspace_id);
      if ((count ?? 0) >= (plan as { max_domains: number }).max_domains) return failure('plan_limit_domains', 402);
      const created = await cloudflare<CustomHostname>('/custom_hostnames', 'POST', { hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } });
      await platform(`/__platform/domain?host=${encodeURIComponent(hostname)}&slug=${site.slug}`, { method: 'PUT' });
      const { data: row, error } = await admin.from('domains').insert({
        site_id: site.id, workspace_id: site.workspace_id, hostname, cf_hostname_id: created.id,
        status: created.status, ssl_status: created.ssl?.status ?? 'initializing', verification: verificationOf(created, hostname),
      }).select('*').single();
      if (error) return failure('domain_taken', 409, error.message);
      return json(row);
    }

    const { data: domain } = await who.db.from('domains').select('*').eq('id', body.domainId).maybeSingle();
    if (!domain) return failure('not_found', 404);
    const role = await roleIn(who, domain.workspace_id);
    if (!role || !ADMINS.includes(role)) return failure('forbidden', 403);

    if (body.action === 'check') {
      // o POST pode vir sem os registros de validação: um GET depois os traz (docs: common API calls)
      const result = await cloudflare<CustomHostname>(`/custom_hostnames/${domain.cf_hostname_id}`, 'GET');
      const { data: row } = await admin.from('domains').update({
        status: result.status, ssl_status: result.ssl?.status ?? domain.ssl_status,
        verification: verificationOf(result, domain.hostname), checked_at: new Date().toISOString(),
      }).eq('id', domain.id).select('*').single();
      return json(row);
    }
    if (body.action === 'remove') {
      if (domain.cf_hostname_id) await cloudflare(`/custom_hostnames/${domain.cf_hostname_id}`, 'DELETE');
      await platform(`/__platform/domain?host=${encodeURIComponent(domain.hostname)}`, { method: 'DELETE' });
      await admin.from('domains').delete().eq('id', domain.id);
      return json({ ok: true });
    }
    return failure('bad_request', 400);
  },
};
