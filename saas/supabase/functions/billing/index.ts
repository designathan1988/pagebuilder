// Assinar, trocar ou cancelar o plano de um workspace (Asaas).
// POST { action: 'subscribe', workspaceId, planId, name, cpfCnpj, email? } -> { invoiceUrl }
// POST { action: 'cancel', workspaceId } -> { ok: true }
// Só a dona ou um admin do workspace. O plano só passa a valer quando o webhook confirmar o pagamento.
import { asaas, today, type AsaasList, type AsaasPayment } from '../_shared/asaas.ts';
import { adminClient, env } from '../_shared/env.ts';
import { ADMINS, caller, corsHeaders, failure, json, roleIn } from '../_shared/http.ts';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

async function firstInvoiceUrl(subscriptionId: string): Promise<string | null> {
  // a primeira cobrança pode aparecer um instante depois de criar a assinatura (docs: não é dito que é síncrona)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const list = await asaas<AsaasList<AsaasPayment>>(`/subscriptions/${subscriptionId}/payments?status=PENDING`);
    const url = list.data[0]?.invoiceUrl;
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return null;
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    if (req.method !== 'POST') return failure('method_not_allowed', 405);
    const who = await caller(req);
    if (!who) return failure('unauthorized', 401);
    const body = await req.json().catch(() => null) as Record<string, string> | null;
    if (!body?.workspaceId) return failure('bad_request', 400);
    const role = await roleIn(who, body.workspaceId);
    if (!role || !ADMINS.includes(role)) return failure('forbidden', 403);
    const admin = adminClient();
    const { data: held } = await admin.from('subscriptions').select('*').eq('workspace_id', body.workspaceId).maybeSingle();

    if (body.action === 'cancel') {
      if (!held?.asaas_subscription_id) return json({ ok: true });
      // fim no período já pago: a assinatura para de gerar cobranças, o histórico fica (docs: PUT status INACTIVE)
      await asaas(`/subscriptions/${held.asaas_subscription_id}`, { method: 'PUT', body: { status: 'INACTIVE' } });
      await admin.from('subscriptions').update({ status: 'canceled', pending_plan_id: null, updated_at: new Date().toISOString() }).eq('workspace_id', body.workspaceId);
      return json({ ok: true });
    }

    if (body.action !== 'subscribe') return failure('bad_request', 400);
    const { data: plan } = await admin.from('plans').select('*').eq('id', body.planId).maybeSingle();
    if (!plan || plan.price_cents === 0) return failure('unknown_plan', 400);
    const value = plan.price_cents / 100;
    const description = `Plano ${plan.name}`;

    // cliente do Asaas: um por workspace (externalReference = id do workspace)
    let customerId = held?.asaas_customer_id as string | undefined;
    if (!customerId) {
      const document = onlyDigits(body.cpfCnpj ?? '');
      if (document.length !== 11 && document.length !== 14) return failure('invalid_cpf_cnpj', 400);
      const customer = await asaas<{ id: string }>('/customers', {
        method: 'POST',
        body: { name: body.name || who.user.email, cpfCnpj: document, email: body.email || who.user.email, externalReference: body.workspaceId },
      });
      customerId = customer.id;
    }

    // já tem assinatura ativa no Asaas: troca de valor (upgrade/downgrade) nas próximas cobranças
    if (held?.asaas_subscription_id && held.status !== 'canceled') {
      await asaas(`/subscriptions/${held.asaas_subscription_id}`, {
        method: 'PUT',
        body: { value, description, externalReference: `${body.workspaceId}:${plan.id}`, updatePendingPayments: true },
      });
      await admin.from('subscriptions').update({ pending_plan_id: plan.id, updated_at: new Date().toISOString() }).eq('workspace_id', body.workspaceId);
      const invoiceUrl = await firstInvoiceUrl(held.asaas_subscription_id);
      return json({ invoiceUrl });
    }

    // assinatura nova: a pessoa escolhe Pix, boleto ou cartão na página de pagamento do Asaas (billingType UNDEFINED)
    const subscription = await asaas<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: {
        customer: customerId,
        billingType: 'UNDEFINED',
        value,
        nextDueDate: today(),
        cycle: 'MONTHLY',
        description,
        externalReference: `${body.workspaceId}:${plan.id}`,
        callback: { successUrl: `${env.appOrigin()}/painel/cobranca?pago=1`, autoRedirect: true },
      },
    });
    const invoiceUrl = await firstInvoiceUrl(subscription.id);
    await admin.from('subscriptions').upsert({
      workspace_id: body.workspaceId,
      plan_id: held?.plan_id ?? 'gratis',
      pending_plan_id: plan.id,
      status: held?.status === 'active' ? 'active' : 'pending',
      asaas_customer_id: customerId,
      asaas_subscription_id: subscription.id,
      invoice_url: invoiceUrl,
      updated_at: new Date().toISOString(),
    });
    return json({ invoiceUrl });
  },
};
