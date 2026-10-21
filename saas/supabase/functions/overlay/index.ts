// The published project of a Site Editor customization, for the wc-runtime.js on customers' sites.
// GET /overlay?key=<public key>  ->  { project, updatedAt }
// Public on purpose (customers' sites have no login): it only returns what was published, found by the key, and
// never lists anything. Open CORS, because the script runs on any domain. The table stays closed by RLS: the
// read here uses the secret key.
import { adminClient } from '../_shared/env.ts';

const KEY = /^[A-Za-z0-9_-]{20,64}$/;

function reply(body: unknown, status: number, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'accept, content-type',
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}, stale-while-revalidate=300` : 'no-store',
    },
  });
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return reply({}, 204);
    if (req.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
    const key = new URL(req.url).searchParams.get('key') ?? '';
    if (!KEY.test(key)) return reply({ error: 'invalid_key' }, 400);
    const { data, error } = await adminClient().from('site_overlays').select('spec, updated_at').eq('public_key', key).eq('published', true).maybeSingle();
    if (error) return reply({ error: 'unavailable' }, 503);
    if (!data) return reply({ error: 'not_found' }, 404);
    return reply({ project: data.spec, updatedAt: data.updated_at }, 200, 60);
  },
};
