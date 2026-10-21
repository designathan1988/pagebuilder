// End-to-end test of the site-data function (the published apps' database and members), against a Postgres
// with the migrations (tests/run.sh), PostgREST and the function running in Deno. How it was run:
//   1. sh saas/supabase/tests/run.sh   (creates Carla's "mural" site)
//   2. in the database: update public.sites set data_rules = '[{"name":"recados","read":"public","write":"members"},
//      {"name":"notas","read":"owner","write":"members"},{"name":"posts","read":"public","write":"admin"},
//      {"name":"contatos","read":"admin","write":"public"}]' where slug = 'mural';
//   3. PostgREST on port 3101 and a proxy on 3100 that strips the /rest/v1 prefix (the path supabase-js uses)
//   4. SUPABASE_URL=http://localhost:3100 SUPABASE_SERVICE_ROLE_KEY=<JWT service_role> SITES_PLATFORM_SECRET=segredo-de-teste-123 \
//      deno serve --allow-net --allow-env --port 3200 saas/supabase/functions/site-data/index.ts
//   5. node saas/supabase/tests/site-data.e2e.mjs
import { execSync } from "node:child_process";
const call = async (method, path, { token, body, q } = {}) => {
  const r = await fetch('http://localhost:3200/' + (q ? '?q=' + encodeURIComponent(JSON.stringify(q)) : ''), {
    method, headers: { 'x-platform-secret': 'segredo-de-teste-123', 'x-site-slug': 'mural', 'x-api-path': path, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
};
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : ' ' + JSON.stringify(extra))); if (!ok) fails++; };
const t0 = Date.now();
const ana = await call('POST', 'auth/signup', { body: { email: 'Ana@Exemplo.com', password: 'senha-forte-1', name: 'Ana' } });
console.log('signup ms', Date.now() - t0);
check('signup returns a token', ana.status === 201 && ana.body.token && ana.body.user.email === 'ana@exemplo.com', ana);
check('repeated email refused', (await call('POST', 'auth/signup', { body: { email: 'ana@exemplo.com', password: 'outra-senha-1' } })).status === 409);
check('short password refused', (await call('POST', 'auth/signup', { body: { email: 'x@exemplo.com', password: '123' } })).body.error === 'weak_password');
const bia = await call('POST', 'auth/signup', { body: { email: 'bia@exemplo.com', password: 'senha-da-bia', name: 'Bia' } });
check('correct login', (await call('POST', 'auth/login', { body: { email: 'ana@exemplo.com', password: 'senha-forte-1' } })).status === 200);
const wrong = await call('POST', 'auth/login', { body: { email: 'ana@exemplo.com', password: 'errada' } });
check('wrong password refused', wrong.status === 401 && wrong.body.error === 'invalid_credentials', wrong);
check('me with a token', (await call('GET', 'auth/me', { token: ana.body.token })).body.user?.name === 'Ana');
check('me with a forged token', (await call('GET', 'auth/me', { token: ana.body.token.slice(0, -3) + 'abc' })).body.user === null);
// recados: the public reads, members write
check('a visitor does not write a message', (await call('POST', 'db/recados', { body: { data: { texto: 'anônimo' } } })).status === 401);
const r1 = await call('POST', 'db/recados', { token: ana.body.token, body: { data: { texto: 'Oi da Ana', n: 2 } } });
check('a member writes a message', r1.status === 201 && r1.body.item._owner === ana.body.user.id, r1);
await call('POST', 'db/recados', { token: bia.body.token, body: { data: { texto: 'Oi da Bia', n: 1 } } });
const all = await call('GET', 'db/recados');
check('a visitor reads messages', all.status === 200 && all.body.items.length === 3, all);
const ordered = await call('GET', 'db/recados', { q: { order: 'n', where: {} } });
check('sorts by field', ordered.body.items[0].n === 1 && ordered.body.items[1].n === 2, ordered.body.items);
const where = await call('GET', 'db/recados', { q: { where: { texto: 'Oi da Bia' } } });
check('filters by field', where.body.items.length === 1, where.body);
check('mine', (await call('GET', 'db/recados', { token: ana.body.token, q: { mine: true } })).body.items.length === 1);
check('invalid query', (await call('GET', 'db/recados', { q: { limit: 99999 } })).status === 400);
const id = r1.body.item.id;
check('Bia does not change Ana\'s message', (await call('PATCH', 'db/recados/' + id, { token: bia.body.token, body: { data: { texto: 'hack' } } })).status === 403);
const patched = await call('PATCH', 'db/recados/' + id, { token: ana.body.token, body: { data: { texto: 'editado' } } });
check('Ana changes her own (merges fields)', patched.body.item?.texto === 'editado' && patched.body.item.n === 2, patched);
check('Bia does not delete', (await call('DELETE', 'db/recados/' + id, { token: bia.body.token })).status === 403);
check('Ana deletes', (await call('DELETE', 'db/recados/' + id, { token: ana.body.token })).body.ok === true);
check('read by id is gone', (await call('GET', 'db/recados/' + id)).status === 404);
// notas: each one only their own
await call('POST', 'db/notas', { token: ana.body.token, body: { data: { t: 'nota da Ana' } } });
await call('POST', 'db/notas', { token: bia.body.token, body: { data: { t: 'nota da Bia' } } });
check('a visitor does not read notes', (await call('GET', 'db/notas')).status === 401);
const anaNotes = await call('GET', 'db/notas', { token: ana.body.token });
check('Ana sees only her own notes', anaNotes.body.items.length === 1 && anaNotes.body.items[0].t === 'nota da Ana', anaNotes);
// posts: only administrators write
check('a member does not publish a post', (await call('POST', 'db/posts', { token: ana.body.token, body: { data: { titulo: 'x' } } })).status === 403);
execSync(`su postgres -c "psql -h /var/run/postgresql -d webconstructor_test -qc \\"update public.site_members set role='admin' where email='ana@exemplo.com'\\""`);
check('an admin publishes a post', (await call('POST', 'db/posts', { token: ana.body.token, body: { data: { titulo: 'Primeiro post' } } })).status === 201);
check('an admin sees everyone\'s notes', (await call('GET', 'db/notas', { token: ana.body.token })).body.items.length === 2);
// contatos: anyone sends, only an admin reads
check('a visitor sends a contact', (await call('POST', 'db/contatos', { body: { data: { nome: 'Zé', msg: 'Olá' } } })).status === 201);
check('a regular member does not read contacts', (await call('GET', 'db/contatos', { token: bia.body.token })).status === 403);
check('an admin reads contacts', (await call('GET', 'db/contatos', { token: ana.body.token })).body.items.length === 1);
check('a table without a rule does not exist', (await call('GET', 'db/segredos')).status === 404);
check('without the platform secret', (await fetch('http://localhost:3200/', { headers: { 'x-site-slug': 'mural', 'x-api-path': 'db/recados' } })).status === 401);
console.log(fails === 0 ? 'ALL OK' : fails + ' failures');
