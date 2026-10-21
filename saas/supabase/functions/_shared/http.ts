// CORS, respostas JSON e a identificação de quem chama.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.118.0';
import { env, userClient } from './env.ts';

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.appOrigin(),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders() } });
}

export function failure(code: string, status: number, detail?: string): Response {
  return json({ error: code, ...(detail ? { detail } : {}) }, status);
}

export interface Caller {
  readonly user: User;
  readonly db: SupabaseClient;
}

// O token vem em Authorization: Bearer, ou em x-api-key (o assistente do editor manda a chave nesse cabeçalho).
// getUser confere o token no servidor de Auth; getSession não serve para isso (docs: auth-getsession).
export async function caller(req: Request): Promise<Caller | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const token = bearer || req.headers.get('x-api-key') || '';
  if (!token) return null;
  const db = userClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, db };
}

// O papel de quem chama no workspace, lido com o RLS dele (só vê as próprias linhas de membro).
export async function roleIn(who: Caller, workspaceId: string): Promise<string | null> {
  const { data } = await who.db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', who.user.id).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export const EDITORS = ['owner', 'admin', 'editor'];
export const ADMINS = ['owner', 'admin'];

// Comparação em tempo constante para segredos compartilhados (webhooks, chamadas entre serviços).
export function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length || b.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
