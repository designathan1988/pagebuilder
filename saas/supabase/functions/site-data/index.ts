// The database and the members of the published apps (the runtime's app.db and app.auth). The sites Worker forwards
// each /_api/* of a site here with the platform secret, the site slug (x-site-slug) and the path (x-api-path); the
// visitor sends the member token in Authorization. Each table's rules are the ones the editor published
// (sites.data_rules); a table without a rule does not exist.
//   POST   auth/signup  { email, password, name }  -> { token, user }
//   POST   auth/login   { email, password }        -> { token, user }
//   GET    auth/me                                 -> { user }
//   GET    db/<table>?q=<query>                    -> { items }
//   GET    db/<table>/<id>                         -> { item }
//   POST   db/<table>  { data }                    -> { item }
//   PATCH  db/<table>/<id> { data }                -> { item }   (merges the fields)
//   DELETE db/<table>/<id>                         -> { ok }
import { adminClient, env } from '../_shared/env.ts';
import { sameSecret } from '../_shared/http.ts';
import {
  EMAIL,
  MIN_PASSWORD,
  canChange,
  canCreate,
  canRead,
  checkPassword,
  hashPassword,
  readData,
  readQuery,
  readRules,
  readSession,
  recordOut,
  ruleOf,
  signSession,
  sortRecords,
  type Member,
  type StoredRecord,
} from '../_shared/site-data.ts';

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// rows per table of a site: the limit that protects the account from a site that fills the database
const MAX_ROWS_PER_TABLE = 20000;
const MAX_MEMBERS = 50000;
const FIELDS = 'id, data, owner_id, created_at, updated_at';

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const failure = (error: string, status: number): Response => reply({ error }, status);

// the key for the members' tokens: derived from the platform secret, so no extra secret is required
const sessionSecret = (): string => `site-members:${env.required('SITES_PLATFORM_SECRET')}`;

interface SiteRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly data_rules: unknown;
}

const userOut = (row: { id: string; email: string; name: string; role: string }) => ({ id: row.id, email: row.email, name: row.name, role: row.role });

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (!sameSecret(req.headers.get('x-platform-secret') ?? '', env.required('SITES_PLATFORM_SECRET'))) return failure('unauthorized', 401);
    const slug = req.headers.get('x-site-slug') ?? '';
    const path = (req.headers.get('x-api-path') ?? '').replace(/^\/+|\/+$/g, '');
    if (!SLUG.test(slug)) return failure('bad_request', 400);
    const admin = adminClient();
    const { data: site } = await admin.from('sites').select('id, workspace_id, data_rules').eq('slug', slug).not('published_at', 'is', null).maybeSingle<SiteRow>();
    if (!site) return failure('not_found', 404);
    const rules = readRules(site.data_rules) ?? [];

    // who is signed in: the site's token, of a member that still exists
    let member: (Member & { email: string; name: string }) | null = null;
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (token !== '') {
      const memberId = await readSession(sessionSecret(), token, site.id);
      if (memberId !== null) {
        const { data } = await admin.from('site_members').select('id, email, name, role').eq('id', memberId).eq('site_id', site.id).maybeSingle();
        if (data) member = { id: data.id, email: data.email, name: data.name, role: data.role === 'admin' ? 'admin' : 'member' };
      }
    }
    const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json().catch(() => null) as Record<string, unknown> | null : null;
    const parts = path.split('/');

    // ------------------------------------------------------------ members
    if (parts[0] === 'auth') {
      const route = `${req.method} ${parts[1] ?? ''}`;
      if (route === 'GET me') return reply({ user: member === null ? null : userOut(member) });
      if (route !== 'POST signup' && route !== 'POST login') return failure('not_found', 404);
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!EMAIL.test(email) || email.length > 254) return failure('invalid_email', 400);
      if (route === 'POST signup') {
        if (password.length < MIN_PASSWORD || password.length > 200) return failure('weak_password', 400);
        const { count } = await admin.from('site_members').select('id', { count: 'exact', head: true }).eq('site_id', site.id);
        if ((count ?? 0) >= MAX_MEMBERS) return failure('site_full', 403);
        const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
        const { data, error } = await admin.from('site_members')
          .insert({ site_id: site.id, workspace_id: site.workspace_id, email, name, password_hash: await hashPassword(password) })
          .select('id, email, name, role').single();
        if (error) return failure(error.code === '23505' ? 'email_taken' : 'unavailable', error.code === '23505' ? 409 : 503);
        return reply({ token: await signSession(sessionSecret(), data.id, site.id), user: userOut(data) }, 201);
      }
      const { data } = await admin.from('site_members').select('id, email, name, role, password_hash').eq('site_id', site.id).eq('email', email).maybeSingle();
      // the same response for an unknown email and a wrong password
      if (!data || !(await checkPassword(password, data.password_hash))) return failure('invalid_credentials', 401);
      return reply({ token: await signSession(sessionSecret(), data.id, site.id), user: userOut(data) });
    }

    // ------------------------------------------------------------ tables
    if (parts[0] !== 'db' || parts.length < 2 || parts.length > 3) return failure('not_found', 404);
    const rule = ruleOf(rules, parts[1] ?? '');
    if (rule === null) return failure('unknown_table', 404);
    const id = parts[2];
    if (id !== undefined && !ID.test(id)) return failure('not_found', 404);
    const table = () => admin.from('site_records').select(FIELDS).eq('site_id', site.id).eq('collection', rule.name);

    if (req.method === 'GET' && id === undefined) {
      const query = readQuery(new URL(req.url).searchParams.get('q'));
      if (query === null) return failure('invalid_query', 400);
      const access = canRead(rule, member);
      if (!access.allowed) return failure(member === null ? 'login_required' : 'forbidden', member === null ? 401 : 403);
      let select = table();
      if (Object.keys(query.where).length > 0) select = select.contains('data', query.where);
      if (access.ownOnly || query.mine) {
        if (member === null) return failure('login_required', 401);
        select = select.eq('owner_id', member.id);
      }
      const byDate = query.order.field === '_created' || query.order.field === '_updated';
      if (byDate) {
        const { data, error } = await select.order(query.order.field === '_created' ? 'created_at' : 'updated_at', { ascending: query.order.ascending }).range(query.offset, query.offset + query.limit - 1);
        if (error) return failure('unavailable', 503);
        return reply({ items: (data as StoredRecord[]).map(recordOut) });
      }
      // by a data field: read in full (up to the table limit) and sorted here
      const { data, error } = await select.order('created_at', { ascending: false }).limit(MAX_ROWS_PER_TABLE);
      if (error) return failure('unavailable', 503);
      return reply({ items: sortRecords((data as StoredRecord[]).map(recordOut), query.order).slice(query.offset, query.offset + query.limit) });
    }

    if (req.method === 'POST' && id === undefined) {
      if (!canCreate(rule, member)) return failure(member === null ? 'login_required' : 'forbidden', member === null ? 401 : 403);
      const data = readData(body?.data);
      if (data === null) return failure('invalid_data', 400);
      const { count } = await admin.from('site_records').select('id', { count: 'exact', head: true }).eq('site_id', site.id).eq('collection', rule.name);
      if ((count ?? 0) >= MAX_ROWS_PER_TABLE) return failure('table_full', 403);
      const { data: row, error } = await admin.from('site_records')
        .insert({ site_id: site.id, workspace_id: site.workspace_id, collection: rule.name, data, owner_id: member?.id ?? null })
        .select(FIELDS).single();
      if (error) return failure('unavailable', 503);
      return reply({ item: recordOut(row as StoredRecord) }, 201);
    }

    if (id === undefined) return failure('method_not_allowed', 405);
    const { data: found } = await table().eq('id', id).maybeSingle();
    const row = found as StoredRecord | null;
    if (req.method === 'GET') {
      const access = canRead(rule, member);
      if (!access.allowed || row === null || (access.ownOnly && row.owner_id !== member?.id)) return failure('not_found', 404);
      return reply({ item: recordOut(row) });
    }
    if (row === null) return failure('not_found', 404);
    if (!canChange(rule, member, row.owner_id)) return failure(member === null ? 'login_required' : 'forbidden', member === null ? 401 : 403);
    if (req.method === 'PATCH') {
      const patch = readData(body?.data);
      if (patch === null) return failure('invalid_data', 400);
      const merged = readData({ ...row.data, ...patch });
      if (merged === null) return failure('invalid_data', 400);
      const { data: changed, error } = await admin.from('site_records').update({ data: merged }).eq('id', row.id).select(FIELDS).single();
      if (error) return failure('unavailable', 503);
      return reply({ item: recordOut(changed as StoredRecord) });
    }
    if (req.method === 'DELETE') {
      const { error } = await admin.from('site_records').delete().eq('id', row.id);
      if (error) return failure('unavailable', 503);
      return reply({ ok: true });
    }
    return failure('method_not_allowed', 405);
  },
};
