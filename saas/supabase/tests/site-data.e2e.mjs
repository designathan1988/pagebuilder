// Teste de ponta a ponta da função site-data (o banco de dados e os membros dos apps publicados), contra um Postgres
// com as migrações (tests/run.sh), o PostgREST e a função rodando no Deno. Como foi rodado:
//   1. sh saas/supabase/tests/run.sh   (cria o site "mural" da Carla)
//   2. no banco: update public.sites set data_rules = '[{"name":"recados","read":"public","write":"members"},
//      {"name":"notas","read":"owner","write":"members"},{"name":"posts","read":"public","write":"admin"},
//      {"name":"contatos","read":"admin","write":"public"}]' where slug = 'mural';
//   3. PostgREST na porta 3101 e um proxy que tira o prefixo /rest/v1 na 3100 (o caminho que o supabase-js usa)
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
check('cadastro devolve token', ana.status === 201 && ana.body.token && ana.body.user.email === 'ana@exemplo.com', ana);
check('e-mail repetido recusado', (await call('POST', 'auth/signup', { body: { email: 'ana@exemplo.com', password: 'outra-senha-1' } })).status === 409);
check('senha curta recusada', (await call('POST', 'auth/signup', { body: { email: 'x@exemplo.com', password: '123' } })).body.error === 'weak_password');
const bia = await call('POST', 'auth/signup', { body: { email: 'bia@exemplo.com', password: 'senha-da-bia', name: 'Bia' } });
check('login certo', (await call('POST', 'auth/login', { body: { email: 'ana@exemplo.com', password: 'senha-forte-1' } })).status === 200);
const wrong = await call('POST', 'auth/login', { body: { email: 'ana@exemplo.com', password: 'errada' } });
check('senha errada recusada', wrong.status === 401 && wrong.body.error === 'invalid_credentials', wrong);
check('me com token', (await call('GET', 'auth/me', { token: ana.body.token })).body.user?.name === 'Ana');
check('me com token falso', (await call('GET', 'auth/me', { token: ana.body.token.slice(0, -3) + 'abc' })).body.user === null);
// recados: público lê, membros escrevem
check('visitante não grava recado', (await call('POST', 'db/recados', { body: { data: { texto: 'anônimo' } } })).status === 401);
const r1 = await call('POST', 'db/recados', { token: ana.body.token, body: { data: { texto: 'Oi da Ana', n: 2 } } });
check('membro grava recado', r1.status === 201 && r1.body.item._owner === ana.body.user.id, r1);
await call('POST', 'db/recados', { token: bia.body.token, body: { data: { texto: 'Oi da Bia', n: 1 } } });
const all = await call('GET', 'db/recados');
check('visitante lê recados', all.status === 200 && all.body.items.length === 3, all);
const ordered = await call('GET', 'db/recados', { q: { order: 'n', where: {} } });
check('ordena por campo', ordered.body.items[0].n === 1 && ordered.body.items[1].n === 2, ordered.body.items);
const where = await call('GET', 'db/recados', { q: { where: { texto: 'Oi da Bia' } } });
check('filtra por campo', where.body.items.length === 1, where.body);
check('mine', (await call('GET', 'db/recados', { token: ana.body.token, q: { mine: true } })).body.items.length === 1);
check('consulta inválida', (await call('GET', 'db/recados', { q: { limit: 99999 } })).status === 400);
const id = r1.body.item.id;
check('Bia não altera recado da Ana', (await call('PATCH', 'db/recados/' + id, { token: bia.body.token, body: { data: { texto: 'hack' } } })).status === 403);
const patched = await call('PATCH', 'db/recados/' + id, { token: ana.body.token, body: { data: { texto: 'editado' } } });
check('Ana altera o próprio (junta campos)', patched.body.item?.texto === 'editado' && patched.body.item.n === 2, patched);
check('Bia não apaga', (await call('DELETE', 'db/recados/' + id, { token: bia.body.token })).status === 403);
check('Ana apaga', (await call('DELETE', 'db/recados/' + id, { token: ana.body.token })).body.ok === true);
check('lido por id some', (await call('GET', 'db/recados/' + id)).status === 404);
// notas: cada um só as suas
await call('POST', 'db/notas', { token: ana.body.token, body: { data: { t: 'nota da Ana' } } });
await call('POST', 'db/notas', { token: bia.body.token, body: { data: { t: 'nota da Bia' } } });
check('visitante não lê notas', (await call('GET', 'db/notas')).status === 401);
const anaNotes = await call('GET', 'db/notas', { token: ana.body.token });
check('Ana só vê as próprias notas', anaNotes.body.items.length === 1 && anaNotes.body.items[0].t === 'nota da Ana', anaNotes);
// posts: só administradores escrevem
check('membro não publica post', (await call('POST', 'db/posts', { token: ana.body.token, body: { data: { titulo: 'x' } } })).status === 403);
execSync(`su postgres -c "psql -h /var/run/postgresql -d webconstructor_test -qc \\"update public.site_members set role='admin' where email='ana@exemplo.com'\\""`);
check('admin publica post', (await call('POST', 'db/posts', { token: ana.body.token, body: { data: { titulo: 'Primeiro post' } } })).status === 201);
check('admin vê notas de todos', (await call('GET', 'db/notas', { token: ana.body.token })).body.items.length === 2);
// contatos: qualquer um envia, só admin lê
check('visitante envia contato', (await call('POST', 'db/contatos', { body: { data: { nome: 'Zé', msg: 'Olá' } } })).status === 201);
check('membro comum não lê contatos', (await call('GET', 'db/contatos', { token: bia.body.token })).status === 403);
check('admin lê contatos', (await call('GET', 'db/contatos', { token: ana.body.token })).body.items.length === 1);
check('tabela sem regra não existe', (await call('GET', 'db/segredos')).status === 404);
check('sem segredo da plataforma', (await fetch('http://localhost:3200/', { headers: { 'x-site-slug': 'mural', 'x-api-path': 'db/recados' } })).status === 401);
console.log(fails === 0 ? 'TODOS OK' : fails + ' falhas');
