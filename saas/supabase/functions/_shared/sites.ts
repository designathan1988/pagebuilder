// Calls to the sites Worker (saas/worker): only through the publishing host, with the shared secret.
import { env } from './env.ts';

export async function platform(path: string, init: { method: string; body?: BodyInit; contentType?: string }): Promise<Response> {
  const response = await fetch(`${env.required('SITES_PLATFORM_URL')}${path}`, {
    method: init.method,
    headers: {
      'x-platform-secret': env.required('SITES_PLATFORM_SECRET'),
      ...(init.contentType ? { 'content-type': init.contentType } : {}),
    },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
  if (!response.ok) throw new Error(`worker ${path}: ${response.status} ${await response.text()}`);
  return response;
}

export const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// names that cannot be a customer subdomain
export const RESERVED = new Set(['www', 'app', 'api', 'admin', 'painel', 'publish', 'customers', 'fallback', 'mail', 'status']);
