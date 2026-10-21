// Variáveis de ambiente das Edge Functions. As do Supabase são injetadas pela plataforma
// (supabase.com/docs/guides/functions/secrets); as demais são definidas com `supabase secrets set`.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === '') throw new Error(`variável de ambiente ausente: ${name}`);
  return value;
}

// As chaves novas vêm como JSON de chaves nomeadas; as antigas (anon/service_role) ficam como alternativa.
function namedKey(listName: string, legacy: string): string {
  const list = Deno.env.get(listName);
  if (list) {
    const parsed = JSON.parse(list) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return required(legacy);
}

export const env = {
  url: () => required('SUPABASE_URL'),
  publishableKey: () => namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'),
  secretKey: () => namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'),
  // a origem do painel e do editor (https://app.seudominio.com.br): CORS e links de retorno
  appOrigin: () => required('APP_ORIGIN'),
  optional: (name: string) => Deno.env.get(name) ?? '',
  required,
};

// Cliente com a chave secreta: passa por cima do RLS. Só depois de conferir quem chama e o que pode fazer.
export function adminClient(): SupabaseClient {
  return createClient(env.url(), env.secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cliente com o token de quem chama: o RLS vale como no navegador.
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.url(), env.publishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
