// Publicar um projeto: o editor manda o ZIP que o Exportar ZIP gera; a função confere quem é, o limite do plano e
// o endereço, e entrega o ZIP ao Worker, que grava a nova versão no R2 e troca o ponteiro de uma vez.
// POST /publish?project=<id>&slug=<subdominio>&rules=<json>   corpo: application/zip   -> { url, version }
// rules: as tabelas do banco do app e quem lê e grava cada uma (site-data), a lista que o editor escreve
// DELETE /publish?project=<id>                    -> tira o site do ar
import { adminClient, env } from '../_shared/env.ts';
import { EDITORS, caller, corsHeaders, failure, json, roleIn } from '../_shared/http.ts';
import { RESERVED, SLUG, platform } from '../_shared/sites.ts';
import { readRules } from '../_shared/site-data.ts';

const MAX_ZIP = 50 * 1024 * 1024;

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    const who = await caller(req);
    if (!who) return failure('unauthorized', 401);
    const url = new URL(req.url);
    const projectId = url.searchParams.get('project') ?? '';
    // o RLS de quem chama: só acha o projeto se for membro
    const { data: project } = await who.db.from('projects').select('id, workspace_id').eq('id', projectId).maybeSingle();
    if (!project) return failure('not_found', 404);
    const role = await roleIn(who, project.workspace_id);
    if (!role || !EDITORS.includes(role)) return failure('forbidden', 403);
    const admin = adminClient();
    const { data: site } = await admin.from('sites').select('*').eq('project_id', project.id).maybeSingle();

    if (req.method === 'DELETE') {
      if (!site) return json({ ok: true });
      await platform(`/__platform/site?slug=${site.slug}`, { method: 'DELETE' });
      await admin.from('sites').update({ published_at: null }).eq('id', site.id);
      return json({ ok: true });
    }
    if (req.method !== 'POST') return failure('method_not_allowed', 405);

    const { data: plan } = await admin.rpc('workspace_plan', { ws: project.workspace_id }).single();
    if (!plan) return failure('no_plan', 500);
    const slug = (url.searchParams.get('slug') ?? site?.slug ?? '').toLowerCase();
    if (!SLUG.test(slug) || RESERVED.has(slug)) return failure('invalid_slug', 400);
    if (!site) {
      const { count } = await admin.from('sites').select('id', { count: 'exact', head: true }).eq('workspace_id', project.workspace_id).not('published_at', 'is', null);
      if ((count ?? 0) >= (plan as { max_sites: number }).max_sites) return failure('plan_limit_sites', 402);
    }
    if (!site || site.slug !== slug) {
      const { data: taken } = await admin.from('sites').select('id').eq('slug', slug).maybeSingle();
      if (taken && taken.id !== site?.id) return failure('slug_taken', 409);
    }
    let rules: unknown = [];
    try {
      rules = JSON.parse(url.searchParams.get('rules') ?? '[]');
    } catch {
      return failure('invalid_rules', 400);
    }
    const dataRules = readRules(rules);
    if (dataRules === null) return failure('invalid_rules', 400);
    const zip = new Uint8Array(await req.arrayBuffer());
    if (zip.length === 0 || zip.length > MAX_ZIP) return failure('invalid_zip_size', 413);

    const version = (site?.version ?? 0) + 1;
    const badge = (plan as { show_badge: boolean }).show_badge ? '1' : '0';
    // trocou de endereço: o antigo sai do ar
    if (site && site.slug !== slug) await platform(`/__platform/site?slug=${site.slug}`, { method: 'DELETE' });
    await platform(`/__platform/publish?slug=${slug}&version=${version}&badge=${badge}`, { method: 'PUT', body: zip, contentType: 'application/zip' });
    const now = new Date().toISOString();
    if (site) await admin.from('sites').update({ slug, version, published_at: now, data_rules: dataRules }).eq('id', site.id);
    else await admin.from('sites').insert({ project_id: project.id, workspace_id: project.workspace_id, slug, version, published_at: now, data_rules: dataRules });
    return json({ url: `https://${slug}.${env.required('SITES_DOMAIN')}`, version });
  },
};
