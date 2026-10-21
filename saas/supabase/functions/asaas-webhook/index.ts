// Webhook do Asaas (docs.asaas.com, "Receba eventos do Asaas no seu endpoint de webhook"):
// o token cadastrado chega no cabeçalho asaas-access-token; a entrega é "pelo menos uma vez", então o id do
// evento é deduplicado; a resposta é sempre 200 depois de autenticado, ou a fila do Asaas trava (envio sequencial).
import { addMonth } from '../_shared/asaas.ts';
import { adminClient, env } from '../_shared/env.ts';
import { sameSecret } from '../_shared/http.ts';

interface AsaasEvent {
  id: string;
  event: string;
  payment?: { id: string; subscription?: string | null; invoiceUrl?: string; dueDate?: string; status?: string };
  subscription?: { id: string };
}

async function apply(evt: AsaasEvent): Promise<void> {
  const admin = adminClient();
  const subscriptionId = evt.payment?.subscription ?? evt.subscription?.id ?? null;
  if (!subscriptionId) return;
  const { data: row } = await admin.from('subscriptions').select('*').eq('asaas_subscription_id', subscriptionId).maybeSingle();
  if (!row) return;
  const now = new Date().toISOString();
  const update = (fields: Record<string, unknown>) => admin.from('subscriptions').update({ ...fields, updated_at: now }).eq('workspace_id', row.workspace_id);
  switch (evt.event) {
    case 'PAYMENT_CREATED':
    case 'PAYMENT_UPDATED':
      if (evt.payment?.invoiceUrl) await update({ invoice_url: evt.payment.invoiceUrl });
      break;
    // CONFIRMED (cartão) ou RECEIVED (Pix e boleto): qualquer um dos dois pode chegar primeiro, ou sozinho
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      const due = evt.payment?.dueDate ?? now.slice(0, 10);
      const paidUntil = addMonth(due);
      await update({
        status: 'active',
        plan_id: row.pending_plan_id ?? row.plan_id,
        pending_plan_id: null,
        paid_until: row.paid_until && row.paid_until > paidUntil ? row.paid_until : paidUntil,
      });
      break;
    }
    case 'PAYMENT_OVERDUE':
      await update({ status: 'past_due' });
      break;
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      await update({ status: 'canceled', paid_until: now.slice(0, 10) });
      break;
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      await update({ status: 'canceled', pending_plan_id: null });
      break;
    default:
      break;
  }
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (!sameSecret(req.headers.get('asaas-access-token') ?? '', env.required('ASAAS_WEBHOOK_TOKEN'))) {
      return new Response('unauthorized', { status: 401 });
    }
    const evt = await req.json().catch(() => null) as AsaasEvent | null;
    if (!evt?.id || !evt.event) return new Response('ok', { status: 200 });
    const admin = adminClient();
    const { data: inserted, error } = await admin.from('billing_events').upsert(
      { id: evt.id, event: evt.event, payload: evt },
      { onConflict: 'id', ignoreDuplicates: true },
    ).select('id');
    // repetido: já tratado
    if (!error && (!inserted || inserted.length === 0)) return new Response('ok', { status: 200 });
    try {
      await apply(evt);
      await admin.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('id', evt.id);
    } catch (problem) {
      await admin.from('billing_events').update({ error: String(problem) }).eq('id', evt.id);
    }
    return new Response('ok', { status: 200 });
  },
};
