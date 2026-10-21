// A project: the published site (take it offline), the custom domains with the DNS instructions and verification, and
// the versions saved by the editor (restore one).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { go } from './app.tsx';
import { callFunction, canAdmin, canEdit, editorLink, errorText, siteUrl, supabase, when, type Domain, type Project, type Version, type Workspace } from './supabase.ts';

const DOMAIN_STATUS: Record<string, { text: string; tone: 'ok' | 'wait' | 'error' }> = {
  active: { text: 'Ativo', tone: 'ok' },
  pending: { text: 'Aguardando DNS', tone: 'wait' },
  moved: { text: 'DNS apontando para outro lugar', tone: 'error' },
  blocked: { text: 'Bloqueado', tone: 'error' },
  deleted: { text: 'Removido', tone: 'error' },
};

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="button button--small"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function DnsRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <tr>
      <td><code>{type}</code></td>
      <td><code>{name}</code> <Copy value={name} /></td>
      <td><code>{value}</code> <Copy value={value} /></td>
    </tr>
  );
}

function DomainCard({ domain, admin, onChanged }: { domain: Domain; admin: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = DOMAIN_STATUS[domain.status] ?? { text: domain.status, tone: 'wait' as const };
  const ready = domain.status === 'active' && domain.ssl_status === 'active';
  const act = async (action: 'check' | 'remove') => {
    if (action === 'remove' && !window.confirm(`Desligar ${domain.hostname} deste site?`)) return;
    setBusy(true);
    setError(null);
    try {
      await callFunction('domains', { body: { action, domainId: domain.id } });
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const v = domain.verification;
  return (
    <li className="card domain">
      <div className="row row--between">
        <strong>{domain.hostname}</strong>
        <span className={`pill pill--${ready ? 'ok' : status.tone}`}>{ready ? 'No ar com HTTPS' : status.text}{!ready && domain.status === 'active' ? ' · gerando certificado' : ''}</span>
      </div>
      {!ready && v !== null ? (
        <>
          <p className="muted small">No painel do seu provedor de domínio (Registro.br, GoDaddy, Hostinger…), crie estes registros. A ativação costuma levar de alguns minutos a algumas horas.</p>
          <div className="table-wrap">
            <table className="dns">
              <thead><tr><th>Tipo</th><th>Nome</th><th>Valor</th></tr></thead>
              <tbody>
                <DnsRow type="CNAME" name={v.cname.name} value={v.cname.value} />
                {v.ownership ? <DnsRow type={v.ownership.type.toUpperCase()} name={v.ownership.name} value={v.ownership.value} /> : null}
                {v.ssl.flatMap((record, i) => (record.txt_name && record.txt_value ? [<DnsRow key={i} type="TXT" name={record.txt_name} value={record.txt_value} />] : []))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Domínio sem "www" (ex.: suaempresa.com.br)? Muitos provedores não aceitam CNAME na raiz: use www e redirecione a raiz para ele no provedor.</p>
          {v.errors.length > 0 ? <p className="notice notice--error">{v.errors.join(' ')}</p> : null}
        </>
      ) : null}
      {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}
      <div className="row">
        {ready ? <a className="button button--small" href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">Abrir</a> : null}
        {admin ? <button type="button" className="button button--small" disabled={busy} onClick={() => void act('check')}>{busy ? 'Verificando…' : 'Verificar agora'}</button> : null}
        {admin ? <button type="button" className="button button--small button--danger" disabled={busy} onClick={() => void act('remove')}>Remover</button> : null}
        {domain.checked_at ? <span className="muted small">Verificado {when(domain.checked_at)}</span> : null}
      </div>
    </li>
  );
}

export function ProjectDetail({ projectId, workspace }: { projectId: string; workspace: Workspace }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admin = canAdmin(workspace.role);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name, updated_at, created_at, client_mode, sites(id, slug, version, published_at)')
      .eq('id', projectId)
      .maybeSingle();
    setProject((data as Project | null) ?? null);
    const site = (data as Project | null)?.sites[0];
    if (site) {
      const { data: rows } = await supabase.from('domains').select('*').eq('site_id', site.id).order('created_at');
      setDomains((rows ?? []) as Domain[]);
    } else setDomains([]);
    const { data: kept } = await supabase.from('project_versions').select('id, label, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20);
    setVersions((kept ?? []) as Version[]);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (project === undefined) return <p className="muted">Carregando…</p>;
  if (project === null) return <p className="muted">Projeto não encontrado. <a href="#/projetos">Voltar</a></p>;
  const site = project.sites[0];

  const addDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      await callFunction('domains', { body: { action: 'add', siteId: site.id, hostname: hostname.trim() } });
      setHostname('');
      await load();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!window.confirm('Tirar o site do ar? O endereço e os domínios deixam de funcionar até você publicar de novo.')) return;
    try {
      await callFunction('publish', { method: 'DELETE', query: { project: project.id } });
      await load();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  const restore = async (version: Version) => {
    if (!window.confirm(`Voltar o projeto para a versão de ${new Date(version.created_at).toLocaleString('pt-BR')}? O estado atual é guardado como versão antes.`)) return;
    const { data: current } = await supabase.from('projects').select('document').eq('id', project.id).single();
    const { data: chosen } = await supabase.from('project_versions').select('document').eq('id', version.id).single();
    if (!chosen) return;
    if (current?.document) await supabase.from('project_versions').insert({ project_id: project.id, workspace_id: workspace.id, document: current.document, label: 'Antes de restaurar' });
    const { error: failed } = await supabase.from('projects').update({ document: chosen.document }).eq('id', project.id);
    if (failed) setError(errorText(failed));
    else window.location.assign(editorLink(project.id));
  };

  return (
    <section className="page">
      <button type="button" className="link" onClick={() => go('projetos')}>← Projetos</button>
      <header className="page__head">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">Editado {when(project.updated_at)}</p>
        </div>
        <a className="button button--primary" href={editorLink(project.id)}>Abrir no editor</a>
      </header>
      {error !== null ? <p className="notice notice--error" role="alert">{error}{error.includes('limite') ? <> <a href="#/plano">Ver planos</a></> : null}</p> : null}

      <article className="card">
        <h2>Site publicado</h2>
        {site?.published_at ? (
          <>
            <p><a href={siteUrl(site.slug)} target="_blank" rel="noreferrer">{siteUrl(site.slug)}</a></p>
            <p className="muted small">Versão {site.version}, publicada {when(site.published_at)}. Para atualizar, clique em Publicar no editor.</p>
            {canEdit(workspace.role) ? <button type="button" className="button button--danger button--small" onClick={() => void unpublish()}>Tirar do ar</button> : null}
          </>
        ) : (
          <p className="muted">Ainda não publicado. No editor, clique em <strong>Publicar</strong> e escolha o endereço.</p>
        )}
      </article>

      <article className="card">
        <h2>Domínio próprio</h2>
        {!site?.published_at ? (
          <p className="muted">Publique o site primeiro; depois ligue seu domínio aqui.</p>
        ) : (
          <>
            <ul className="stack">
              {domains.map((domain) => (
                <DomainCard key={domain.id} domain={domain} admin={admin} onChanged={() => void load()} />
              ))}
            </ul>
            {admin ? (
              <form className="row" onSubmit={addDomain}>
                <input className="grow" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="www.suaempresa.com.br" aria-label="Domínio" required />
                <button className="button button--primary" disabled={busy}>{busy ? 'Ligando…' : 'Ligar domínio'}</button>
              </form>
            ) : null}
          </>
        )}
      </article>

      <article className="card">
        <h2>Versões</h2>
        <p className="muted small">O editor guarda uma versão a cada 10 minutos de trabalho.</p>
        {versions.length === 0 ? (
          <p className="muted">Nenhuma versão guardada ainda.</p>
        ) : (
          <ul className="versions">
            {versions.map((version) => (
              <li key={version.id} className="row row--between">
                <span>{new Date(version.created_at).toLocaleString('pt-BR')}{version.label ? ` · ${version.label}` : ''}</span>
                {canEdit(workspace.role) ? <button type="button" className="button button--small" onClick={() => void restore(version)}>Restaurar</button> : null}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
