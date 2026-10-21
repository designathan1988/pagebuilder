// Environment variables of the Edge Functions. Supabase's own are injected by the platform
// (supabase.com/docs/guides/functions/secrets); the rest are set with `supabase secrets set`.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === '') throw new Error(`missing environment variable: ${name}`);
  return value;
}

// The new keys come as JSON of named keys; the legacy ones (anon/service_role) remain as a fallback.
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
  // the origin of the dashboard and the editor (https://app.yourdomain.com): CORS and return links
  appOrigin: () => required('APP_ORIGIN'),
  optional: (name: string) => Deno.env.get(name) ?? '',
  required,
};

// Client with the secret key: it bypasses RLS. Use only after checking who calls and what they may do.
export function adminClient(): SupabaseClient {
  return createClient(env.url(), env.secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

// Client with the caller's token: RLS applies as it does in the browser.
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.url(), env.publishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
