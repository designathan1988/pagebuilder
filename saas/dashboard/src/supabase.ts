// The dashboard's Supabase client, and the types of the rows the dashboard reads (saas/supabase/migrations).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const configured = Boolean(url && key);
export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'missing');

export const SITES_DOMAIN = (import.meta.env.VITE_SITES_DOMAIN as string | undefined) ?? '';
export const EDITOR_URL = (import.meta.env.VITE_EDITOR_URL as string | undefined) ?? '/';
export const editorLink = (projectId: string): string => {
  const address = new URL(EDITOR_URL, window.location.origin);
  address.searchParams.set('project', projectId);
  return address.href;
};

export type Role = 'owner' | 'admin' | 'editor' | 'client';
export interface Workspace { id: string; name: string; role: Role }
export interface Site { id: string; slug: string; version: number; published_at: string | null }
export interface Project { id: string; name: string; updated_at: string; created_at: string; client_mode: boolean; sites: Site[] }
export interface Domain {
  id: string;
  site_id: string;
  hostname: string;
  status: string;
  ssl_status: string;
  checked_at: string | null;
  verification: {
    cname: { name: string; value: string };
    ownership: { type: string; name: string; value: string } | null;
    ssl: { txt_name?: string; txt_value?: string; http_url?: string; http_body?: string }[];
    errors: string[];
  } | null;
}
export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  max_projects: number;
  max_sites: number;
  max_domains: number;
  ai_credits_month: number;
  show_badge: boolean;
  client_mode: boolean;
  sort_order: number;
}
export interface Subscription {
  plan_id: string;
  status: 'active' | 'pending' | 'past_due' | 'canceled';
  invoice_url: string | null;
  pending_plan_id: string | null;
  paid_until: string | null;
}
export interface Submission { id: number; site_id: string; page: string | null; data: Record<string, unknown>; created_at: string; read_at: string | null }
export interface Version { id: number; label: string | null; created_at: string }

export const siteUrl = (slug: string): string => `https://${slug}.${SITES_DOMAIN}`;
export const canAdmin = (role: Role): boolean => role === 'owner' || role === 'admin';
export const canEdit = (role: Role): boolean => role !== 'client';

// Calls an Edge Function with the person's session. Returns the body, or throws the error code the function returned.
export async function callFunction<T>(name: string, init: { body?: unknown; method?: string; query?: Record<string, string> } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthorized');
  const address = new URL(`/functions/v1/${name}`, url);
  for (const [k, v] of Object.entries(init.query ?? {})) address.searchParams.set(k, v);
  const response = await fetch(address, {
    method: init.method ?? 'POST',
    headers: { authorization: `Bearer ${token}`, apikey: key ?? '', 'content-type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `http_${response.status}`);
  return body;
}

// The messages for errors the person can fix; any other becomes the generic message.
const ERRORS: Record<string, string> = {
  plan_limit_projects: 'Você chegou ao limite de projetos do seu plano. Mude de plano para criar mais.',
  plan_limit_sites: 'Você chegou ao limite de sites publicados do seu plano.',
  plan_limit_domains: 'Você chegou ao limite de domínios do seu plano.',
  invalid_hostname: 'Domínio inválido. Use algo como www.suaempresa.com.br.',
  domain_taken: 'Este domínio já está ligado a outro site.',
  invalid_cpf_cnpj: 'CPF ou CNPJ inválido.',
  forbidden: 'Você não tem permissão para isso neste espaço.',
  unauthorized: 'Sua sessão expirou. Entre de novo.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
};
export function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  for (const [code, text] of Object.entries(ERRORS)) if (raw.includes(code)) return text;
  return 'Algo deu errado. Tente de novo em instantes.';
}

export const money = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const when = (iso: string): string => {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};
