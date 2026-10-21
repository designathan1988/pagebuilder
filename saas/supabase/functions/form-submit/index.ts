// A form submitted on a published site: the sites Worker forwards the POST here with the platform secret.
// POST { slug, page, data } -> stores it in the workspace inbox.
import { adminClient, env } from '../_shared/env.ts';
import { sameSecret } from '../_shared/http.ts';

const MAX_FIELDS = 50;
const MAX_VALUE = 5000;

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (!sameSecret(req.headers.get('x-platform-secret') ?? '', env.required('SITES_PLATFORM_SECRET'))) return new Response('unauthorized', { status: 401 });
    const body = await req.json().catch(() => null) as { slug?: string; page?: string; data?: Record<string, unknown> } | null;
    if (!body?.slug || !body.data || typeof body.data !== 'object') return new Response('bad request', { status: 400 });
    // short text only: no files and no endless fields
    const entries = Object.entries(body.data).slice(0, MAX_FIELDS).map(([key, value]) => [key.slice(0, 100), String(value).slice(0, MAX_VALUE)]);
    const admin = adminClient();
    const { data: site } = await admin.from('sites').select('id, workspace_id').eq('slug', body.slug).not('published_at', 'is', null).maybeSingle();
    if (!site) return new Response('not found', { status: 404 });
    await admin.from('form_submissions').insert({ site_id: site.id, workspace_id: site.workspace_id, page: (body.page ?? '').slice(0, 300), data: Object.fromEntries(entries) });
    return new Response('ok', { status: 200 });
  },
};
