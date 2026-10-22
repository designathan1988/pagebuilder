import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startAssistantCompanion } from './companion.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = process.argv.slice(2);
const values = name => options.flatMap((value, index) => value === name ? [options[index + 1]] : []).filter(Boolean);
const origins = values('--origin');
// the editor's own address: the dev server's PORT, as vite.config.ts reads it (5320 when none is set)
if (!origins.length) origins.push(`http://localhost:${process.env.PORT ?? '5320'}`);
for (const origin of origins) if (new URL(origin).origin !== origin) throw new Error('An editor origin must contain only scheme, host and port');
const port = Number(values('--port')[0] ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Companion port');
const pairingFile = path.resolve(values('--pairing-file')[0] ?? path.join(os.homedir(), '.builder', 'companion.json'));
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const references = await read('manifest/references.json');
const built = new Set(references.references.filter(reference => reference.kind === 'handler' && reference.status === 'registered').map(reference => reference.id));
const names = (await fs.readdir(path.join(root, 'manifest/commands'))).filter(name => name.endsWith('.json')).sort();
const commands = (await Promise.all(names.map(name => read(`manifest/commands/${name}`)))).flatMap(group => group.commands).filter(command => built.has(command.id));
const catalogue = await read('src/i18n/locales/en.json');
let active = null;
let companion;
const selectEditor = async (request, response) => {
  if (request.url !== '/session/select') return false;
  if (request.method !== 'POST') { response.writeHead(405); response.end(); return true; }
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 4096) { response.writeHead(413); response.end(); return true; } }
  let session;
  try { session = JSON.parse(text).session; } catch { response.writeHead(400); response.end(); return true; }
  if (typeof session !== 'string' || !companion.sessions().includes(session)) { response.writeHead(409); response.end(); return true; }
  active = session;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ selected: session }));
  return true;
};
companion = await startAssistantCompanion({
  commands, words: key => { const word = catalogue[key]; if (typeof word !== 'string') throw new Error(`Unknown catalogue key ${key}`); return word; },
  origins, port, input: process.stdin, output: process.stdout,
  selectSession: sessions => active !== null && sessions.includes(active) ? active : null,
  handlers: [selectEditor],
});
await fs.mkdir(path.dirname(pairingFile), { recursive: true, mode: 0o700 });
try {
  const existing = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
  if (existing.version !== 1 || typeof existing.token !== 'string' || !/^ws:\/\/127\.0\.0\.1:\d+\/editor$/.test(existing.url)) throw new Error('Refusing to overwrite an unrelated connection file');
} catch (error) {
  if (error.code !== 'ENOENT') { await companion.close(); throw error; }
}
await fs.writeFile(pairingFile, JSON.stringify({ version: 1, url: companion.url, token: companion.token }, null, 2), { mode: 0o600 });
await fs.chmod(pairingFile, 0o600);
// Standard output is reserved for MCP. The token is never printed, including diagnostics.
process.stderr.write(`Builder Companion is ready. Choose this connection file in the editor: ${pairingFile}\n`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await companion.close();
  try {
    const current = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
    if (current.token === companion.token) await fs.unlink(pairingFile);
  } catch (error) { if (error.code !== 'ENOENT') process.stderr.write('The old connection file could not be removed. It is no longer authorized.\n'); }
}
process.once('SIGINT', () => { void close().then(() => process.exit(0)); });
process.once('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.stdin.once('end', () => { void close(); });
