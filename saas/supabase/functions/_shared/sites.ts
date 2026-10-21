// Chamadas ao Worker dos sites (saas/worker): só pelo host de publicação, com o segredo compartilhado.
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
// nomes que não podem ser subdomínio de cliente
export const RESERVED = new Set(['www', 'app', 'api', 'admin', 'painel', 'publish', 'customers', 'fallback', 'mail', 'status']);
