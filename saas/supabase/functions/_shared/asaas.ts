// Minimal client for the Asaas API v3 (docs.asaas.com, read on 2026-10-21):
// sandbox/production base URL, key in the access_token header (no Bearer) and a required User-Agent.
import { env } from './env.ts';

const BASE = () => (env.optional('ASAAS_ENV') === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3');

export class AsaasError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`Asaas ${status}: ${JSON.stringify(body)}`);
  }
}

export async function asaas<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${BASE()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      access_token: env.required('ASAAS_API_KEY'),
      'User-Agent': env.optional('ASAAS_USER_AGENT') || 'Webconstructor/1.0.0',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AsaasError(response.status, body);
  return body as T;
}

export interface AsaasPayment {
  readonly id: string;
  readonly status: string;
  readonly invoiceUrl: string;
  readonly dueDate: string;
  readonly subscription?: string | null;
  readonly customer: string;
}

export interface AsaasList<T> {
  readonly data: readonly T[];
}

// YYYY-MM-DD in the São Paulo time zone
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function addMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, Math.min(d, 28)));
  return next.toISOString().slice(0, 10);
}
