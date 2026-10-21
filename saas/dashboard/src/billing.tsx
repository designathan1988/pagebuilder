// Plan and billing: the plan in force, the usage (projects, sites, domains, AI credits), the plans to subscribe to via
// Asaas (Pix, boleto or card on the Asaas invoice) and cancellation.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { documentMask, documentValid } from './documents.ts';
import { callFunction, canAdmin, errorText, money, supabase, type Plan, type Subscription, type Workspace } from './supabase.ts';

interface Usage { projects: number; sites: number; domains: number; credits: number }

const STATUS: Record<Subscription['status'], string> = {
  active: 'Ativa',
  pending: 'Aguardando o primeiro pagamento',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
};

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, used / max) : 1;
  if (max === 0) {
    return (
      <div className="meter">
        <div className="row row--between small"><span>{label}</span><span className="muted">Não incluso</span></div>
        <div className="meter__track" />
      </div>
    );
  }
  return (
    <div className="meter">
      <div className="row row--between small"><span>{label}</span><span>{used} de {max}</span></div>
      <div className="meter__track"><div className={`meter__fill${ratio >= 0.9 ? ' is-full' : ''}`} style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

export function Billing({ workspace, email }: { workspace: Workspace; email: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Plan | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admin = canAdmin(workspace.role);

  const load = useCallback(async () => {
    const [{ data: all }, { data: plan }, { data: sub }, { data: credits }, projects, sites, domains] = await Promise.all([
      supabase.from('plans').select('*').order('sort_order'),
      supabase.rpc('workspace_plan', { ws: workspace.id }).single(),
      supabase.from('subscriptions').select('plan_id, status, invoice_url, pending_plan_id, paid_until').eq('workspace_id', workspace.id).maybeSingle(),
      supabase.rpc('ai_credits_used', { ws: workspace.id }),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase.from('sites').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase.from('domains').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
    ]);
    setPlans((all ?? []) as Plan[]);
    setCurrent((plan as Plan | null) ?? null);
    setSubscription((sub as Subscription | null) ?? null);
    setUsage({ projects: projects.count ?? 0, sites: sites.count ?? 0, domains: domains.count ?? 0, credits: Number(credits ?? 0) });
  }, [workspace.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async (event: FormEvent) => {
    event.preventDefault();
    if (!choosing) return;
    if (!documentValid(doc)) {
      setError('CPF ou CNPJ inválido. Confira os números.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { invoiceUrl } = await callFunction<{ invoiceUrl: string | null }>('billing', {
        body: { action: 'subscribe', workspaceId: workspace.id, planId: choosing.id, name: name.trim(), cpfCnpj: doc.replace(/\D/g, ''), email },
      });
      if (invoiceUrl) window.location.assign(invoiceUrl);
      else {
        setChoosing(null);
        await load();
      }
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancelar a assinatura? Você continua com o plano até o fim do período pago e depois volta para o Grátis.')) return;
    try {
      await callFunction('billing', { body: { action: 'cancel', workspaceId: workspace.id } });
      await load();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  const paying = subscription !== null && subscription.status !== 'canceled';
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Plano e cobrança</h1>
          <p className="muted">Pague por Pix, boleto ou cartão. Sem fidelidade: cancele quando quiser.</p>
        </div>
      </header>
      {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}

      {current !== null && usage !== null ? (
        <article className="card">
          <div className="row row--between">
            <h2>Plano {current.name}</h2>
            {subscription ? <span className={`pill pill--${subscription.status === 'active' ? 'ok' : subscription.status === 'canceled' ? '' : 'wait'}`}>{STATUS[subscription.status]}</span> : <span className="pill">Grátis</span>}
          </div>
          {subscription?.paid_until ? (
            <p className="muted small">{subscription.status === 'canceled' ? 'Vale até' : 'Pago até'} {new Date(`${subscription.paid_until}T12:00:00`).toLocaleDateString('pt-BR')}</p>
          ) : null}
          {subscription?.invoice_url && subscription.status !== 'active' ? (
            <p className="notice notice--wait">
              {subscription.pending_plan_id ? 'Sua mudança de plano aguarda o pagamento. ' : 'Há uma fatura em aberto. '}
              <a href={subscription.invoice_url} target="_blank" rel="noreferrer">Pagar a fatura</a>
            </p>
          ) : null}
          <div className="meters">
            <Meter label="Projetos" used={usage.projects} max={current.max_projects} />
            <Meter label="Sites publicados" used={usage.sites} max={current.max_sites} />
            <Meter label="Domínios próprios" used={usage.domains} max={current.max_domains} />
            <Meter label="Créditos de IA neste mês" used={usage.credits} max={current.ai_credits_month} />
          </div>
          {admin && paying ? <button type="button" className="link link--danger" onClick={() => void cancel()}>Cancelar assinatura</button> : null}
        </article>
      ) : (
        <p className="muted">Carregando…</p>
      )}

      {!admin ? <p className="notice notice--wait">Só o dono ou um administrador deste espaço pode mudar o plano.</p> : null}
      <ul className="plans">
        {plans.map((plan) => {
          const isCurrent = current?.id === plan.id;
          return (
            <li key={plan.id} className={`card plan${plan.id === 'pro' ? ' plan--featured' : ''}`}>
              {plan.id === 'pro' ? <span className="plan__tag">Mais escolhido</span> : null}
              <h3>{plan.name}</h3>
              <p className="plan__price">{plan.price_cents === 0 ? 'R$ 0' : money(plan.price_cents)}<span className="muted small">{plan.price_cents === 0 ? ' para sempre' : ' por mês'}</span></p>
              <ul className="plan__features">
                <li>{plan.max_projects} projetos</li>
                <li>{plan.max_sites} {plan.max_sites === 1 ? 'site publicado' : 'sites publicados'}</li>
                <li>{plan.max_domains === 0 ? 'Endereço .' + (import.meta.env.VITE_SITES_DOMAIN ?? 'seusite') : `${plan.max_domains} domínios próprios com HTTPS`}</li>
                <li>{plan.ai_credits_month} créditos de IA por mês</li>
                <li>{plan.show_badge ? 'Selo "Feito com Webconstructor"' : 'Sem selo da plataforma'}</li>
                <li>Formulários com caixa de entrada</li>
                {plan.client_mode ? <li>Modo cliente: seu cliente edita só textos e imagens</li> : null}
              </ul>
              {isCurrent ? (
                <span className="pill pill--ok">Seu plano</span>
              ) : plan.price_cents > 0 && admin ? (
                <button type="button" className="button button--primary" onClick={() => { setChoosing(plan); setError(null); }}>Assinar {plan.name}</button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {choosing !== null ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={`Assinar ${choosing.name}`}>
          <form className="card modal__card stack" onSubmit={subscribe}>
            <h2>Assinar {choosing.name} · {money(choosing.price_cents)}/mês</h2>
            <p className="muted small">Os dados vão para a nota e a cobrança. Na próxima tela você escolhe Pix, boleto ou cartão.</p>
            <label className="field">
              <span>Nome ou razão social</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
            </label>
            <label className="field">
              <span>CPF ou CNPJ</span>
              <input value={doc} onChange={(e) => setDoc(documentMask(e.target.value))} inputMode="numeric" required aria-invalid={doc.length >= 14 && !documentValid(doc)} />
            </label>
            {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}
            <div className="row">
              <button className="button button--primary" disabled={busy}>{busy ? 'Gerando a fatura…' : 'Continuar para o pagamento'}</button>
              <button type="button" className="button" onClick={() => setChoosing(null)}>Voltar</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
