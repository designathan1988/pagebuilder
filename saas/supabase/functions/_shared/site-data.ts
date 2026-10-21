// As regras do banco de dados dos apps publicados (função site-data): quem lê e quem grava cada tabela, as senhas
// dos membros dos sites e os tokens de sessão deles. Sem dependência do Deno nem do Supabase: o mesmo código roda nos
// testes (src/core/logic/site-data.test.ts) e na função. Só Web Crypto (crypto.subtle), que os dois têm.

// Quem lê: qualquer visitante, só membros logados, cada membro só as próprias linhas, só administradores do site.
export const READ_ACCESS = ['public', 'members', 'owner', 'admin'] as const;
// Quem cria: qualquer visitante, só membros logados, só administradores. Alterar e apagar: o dono da linha ou um
// administrador.
export const WRITE_ACCESS = ['public', 'members', 'admin'] as const;
export type ReadAccess = (typeof READ_ACCESS)[number];
export type WriteAccess = (typeof WRITE_ACCESS)[number];

export interface TableRule {
  readonly name: string;
  readonly read: ReadAccess;
  readonly write: WriteAccess;
}

export interface Member {
  readonly id: string;
  readonly role: 'member' | 'admin';
}

export const TABLE_NAME = /^[a-z][a-z0-9_]{0,39}$/u;
export const MAX_TABLES = 50;

// As regras que o editor manda ao publicar, conferidas; null quando não são uma lista de regras.
export function readRules(value: unknown): readonly TableRule[] | null {
  if (!Array.isArray(value) || value.length > MAX_TABLES) return null;
  const names = new Set<string>();
  const rules: TableRule[] = [];
  for (const one of value) {
    if (one === null || typeof one !== 'object') return null;
    const { name, read, write } = one as Record<string, unknown>;
    if (typeof name !== 'string' || !TABLE_NAME.test(name) || names.has(name)) return null;
    if (!(READ_ACCESS as readonly unknown[]).includes(read) || !(WRITE_ACCESS as readonly unknown[]).includes(write)) return null;
    names.add(name);
    rules.push({ name, read: read as ReadAccess, write: write as WriteAccess });
  }
  return rules;
}

export const ruleOf = (rules: readonly TableRule[], table: string): TableRule | null => rules.find((rule) => rule.name === table) ?? null;

// Pode listar ou ler a tabela? "owner" deixa ler, mas só as próprias linhas (ownOnly).
export function canRead(rule: TableRule, member: Member | null): { readonly allowed: boolean; readonly ownOnly: boolean } {
  if (member?.role === 'admin') return { allowed: true, ownOnly: false };
  if (rule.read === 'public') return { allowed: true, ownOnly: false };
  if (rule.read === 'members') return { allowed: member !== null, ownOnly: false };
  if (rule.read === 'owner') return { allowed: member !== null, ownOnly: true };
  return { allowed: false, ownOnly: false };
}

export function canCreate(rule: TableRule, member: Member | null): boolean {
  if (member?.role === 'admin') return true;
  if (rule.write === 'public') return true;
  if (rule.write === 'members') return member !== null;
  return false;
}

// Alterar ou apagar uma linha: o membro que a criou, ou um administrador do site.
export function canChange(rule: TableRule, member: Member | null, ownerId: string | null): boolean {
  if (member === null) return false;
  if (member.role === 'admin') return true;
  if (rule.write === 'admin') return false;
  return ownerId !== null && ownerId === member.id;
}

// ---------------------------------------------------------------- consultas

export interface ListQuery {
  readonly where: Readonly<Record<string, string | number | boolean | null>>;
  readonly order: { readonly field: string; readonly ascending: boolean };
  readonly limit: number;
  readonly offset: number;
  readonly mine: boolean;
}

const FIELD = /^[A-Za-z_][\w]{0,63}$/u;
export const MAX_LIMIT = 500;

// A consulta que o runtime manda em ?q=<json>: { where, order: 'campo' | '-campo', limit, offset, mine }.
export function readQuery(text: string | null): ListQuery | null {
  let raw: Record<string, unknown> = {};
  if (text !== null && text !== '') {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      raw = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const where: Record<string, string | number | boolean | null> = {};
  if (raw.where !== undefined) {
    if (raw.where === null || typeof raw.where !== 'object' || Array.isArray(raw.where)) return null;
    for (const [key, value] of Object.entries(raw.where as Record<string, unknown>)) {
      if (!FIELD.test(key) || !(value === null || ['string', 'number', 'boolean'].includes(typeof value))) return null;
      where[key] = value as string | number | boolean | null;
    }
  }
  const orderText = typeof raw.order === 'string' && raw.order !== '' ? raw.order : '-_created';
  const descending = orderText.startsWith('-');
  const field = descending ? orderText.slice(1) : orderText;
  if (!FIELD.test(field)) return null;
  const limit = raw.limit === undefined ? 100 : Number(raw.limit);
  const offset = raw.offset === undefined ? 0 : Number(raw.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT || !Number.isInteger(offset) || offset < 0) return null;
  return { where, order: { field, ascending: !descending }, limit, offset, mine: raw.mine === true };
}

// Uma linha do banco como o runtime a entrega: os dados, o id, quem criou e quando.
export interface StoredRecord {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly owner_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const recordOut = (row: StoredRecord): Record<string, unknown> => ({ ...row.data, id: row.id, _owner: row.owner_id, _created: row.created_at, _updated: row.updated_at });

// Os dados que um visitante grava: um objeto de até 64 KB, sem os campos que o banco escreve.
export const MAX_RECORD_BYTES = 64 * 1024;
export function readData(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !['id', '_owner', '_created', '_updated'].includes(key)));
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_RECORD_BYTES) return null;
  return data;
}

// Ordena as linhas por um campo dos dados (os criados e alterados pelos do banco), números como números.
export function sortRecords(rows: readonly Record<string, unknown>[], order: ListQuery['order']): Record<string, unknown>[] {
  const sign = order.ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[order.field];
    const y = b[order.field];
    if (x === y) return 0;
    if (x === undefined || x === null) return 1;
    if (y === undefined || y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * sign;
  });
}

// ---------------------------------------------------------------- senhas e sessões

const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const normal = text.replace(/-/gu, '+').replace(/_/gu, '/');
  return Uint8Array.from(atob(normal + '='.repeat((4 - (normal.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

// OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256 com 600 000 iterações e sal único por senha.
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(await pbkdf2(password, salt, iterations))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, count, salt, hash] = stored.split('$');
  const iterations = Number(count);
  if (kind !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || salt === undefined || hash === undefined) return false;
  return sameBytes(await pbkdf2(password, fromBase64Url(salt), iterations), fromBase64Url(hash));
}

export const SESSION_DAYS = 30;

async function hmac(secret: string, text: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

// O token de sessão de um membro: <dados em base64url>.<HMAC-SHA256>, válido só no site em que entrou.
export async function signSession(secret: string, memberId: string, siteId: string, now = Date.now()): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify({ sub: memberId, site: siteId, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 })));
  return `${body}.${toBase64Url(await hmac(secret, body))}`;
}

export async function readSession(secret: string, token: string, siteId: string, now = Date.now()): Promise<string | null> {
  const [body, signature] = token.split('.');
  if (body === undefined || signature === undefined || body === '' || signature === '') return null;
  try {
    if (!sameBytes(await hmac(secret, body), fromBase64Url(signature))) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as { sub?: unknown; site?: unknown; exp?: unknown };
    if (typeof claims.sub !== 'string' || claims.site !== siteId || typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/u;
