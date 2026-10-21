// Personalizações: os projetos da extensão Site Editor guardados no espaço de trabalho (tabela site_overlays). Daqui se
// publica (o wc-runtime.js dos sites busca pela chave), se copia o código de instalação por cliente, se liga a um
// projeto do editor e se abre no navegador com a extensão (pela ponte window.postMessage da extensão).
import { useCallback, useEffect, useState } from 'react';
import { canAdmin, canEdit, errorText, supabase, when, type Workspace } from './supabase.ts';

interface OverlayClient { id: string; name: string }
interface OverlayRow {
  id: string;
  name: string;
  local_id: string;
  project_id: string | null;
  matches: string[];
  published: boolean;
  public_key: string | null;
  updated_at: string;
  spec: { clients?: OverlayClient[]; activeClientId?: string | null; edits?: unknown[]; variables?: unknown[]; rules?: unknown[] };
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const ENDPOINT = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/overlay`;
const RUNTIME_URL = new URL('wc-runtime.js', new URL(import.meta.env.BASE_URL, window.location.origin)).href;

// A ponte da extensão (site-editor/src/content/bridge.ts): pedido e resposta por window.postMessage.
function bridge<T>(action: string, payload?: Record<string, unknown>, timeout = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', listen);
      reject(new Error('A extensão Site Editor não respondeu.'));
    }, timeout);
    const listen = (event: MessageEvent) => {
      const data = event.data as { wce?: string; id?: string; ok?: boolean; result?: T; error?: string } | null;
      if (event.source !== window || data?.wce !== 'response' || data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', listen);
      if (data.ok) resolve(data.result as T);
      else reject(new Error(data.error === 'not_paired' ? 'A extensão ainda não autorizou este painel.' : data.error ?? 'erro'));
    };
    window.addEventListener('message', listen);
    window.postMessage({ wce: 'request', id, action, payload }, window.location.origin);
  });
}

function snippet(row: OverlayRow, clientId: string): string {
  return `<script src="${RUNTIME_URL}" data-wce-endpoint="${ENDPOINT}" data-wce-key="${row.public_key ?? ''}"${clientId ? ` data-wce-client="${clientId}"` : ''} defer></script>`;
}

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function Overlays({ workspace }: { workspace: Workspace }) {
  const [rows, setRows] = useState<OverlayRow[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientOf, setClientOf] = useState<Record<string, string>>({});
  const [extension, setExtension] = useState<'unknown' | 'missing' | 'present'>('unknown');

  const load = useCallback(async () => {
    const [{ data, error: failed }, { data: projectRows }] = await Promise.all([
      supabase.from('site_overlays').select('id, name, local_id, project_id, matches, published, public_key, updated_at, spec').eq('workspace_id', workspace.id).order('updated_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('workspace_id', workspace.id).order('name'),
    ]);
    if (failed) setError(errorText(failed));
    setRows((data ?? []) as OverlayRow[]);
    setProjects(projectRows ?? []);
  }, [workspace.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const present = document.documentElement.hasAttribute('data-wce-bridge');
    setExtension(present ? 'present' : 'missing');
  }, []);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await work();
      setNotice(done);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : errorText(failure));
    }
  };

  const setPublished = (row: OverlayRow, on: boolean) =>
    act(async () => {
      const { error: failed } = await supabase.from('site_overlays').update({ published: on, public_key: row.public_key ?? (on ? newKey() : null) }).eq('id', row.id);
      if (failed) throw failed;
    }, on ? 'Publicado: os sites com o código recebem as personalizações em até 1 minuto.' : 'Despublicado.');
  const link = (row: OverlayRow, projectId: string) =>
    act(async () => {
      const { error: failed } = await supabase.from('site_overlays').update({ project_id: projectId || null }).eq('id', row.id);
      if (failed) throw failed;
    }, 'Ligação salva.');
  const remove = (row: OverlayRow) => {
    if (!window.confirm(`Excluir "${row.name}" da nuvem? Os sites que usam a chave param de receber as personalizações.`)) return;
    void act(async () => {
      const { error: failed } = await supabase.from('site_overlays').delete().eq('id', row.id);
      if (failed) throw failed;
    }, 'Excluído.');
  };
  const openWithExtension = (row: OverlayRow) =>
    act(async () => {
      const paired = await bridge<{ paired: boolean }>('pair', undefined, 120000);
      if (!paired.paired) throw new Error('A conexão com a extensão não foi permitida.');
      const { data, error: failed } = await supabase.from('site_overlays').select('spec').eq('id', row.id).single();
      if (failed) throw failed;
      await bridge('save', { project: data.spec });
      const first = row.matches.map((pattern) => pattern.replace(/\*+$/, '').replace(/^\*:\/\//, 'https://')).find((url) => /^https?:\/\/[^*]+$/.test(url));
      if (first) await bridge('open', { url: first, projectId: row.local_id });
    }, 'Projeto enviado à extensão.');
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => setNotice('Código copiado.'));

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Personalizações</h1>
          <p className="muted">Sites e sistemas editados com a extensão Site Editor: um conteúdo para cada cliente, sem mexer no código do sistema.</p>
        </div>
      </header>
      {extension === 'missing' ? (
        <p className="notice notice--wait">Instale a extensão Site Editor (pasta site-editor do projeto) para editar qualquer site e enviar as personalizações para cá. Na extensão, em Configurações, informe o endereço deste app e as chaves do Supabase.</p>
      ) : null}
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      {notice ? <p className="notice notice--ok" role="status">{notice}</p> : null}
      {rows === null ? (
        <p className="muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nenhuma personalização neste espaço ainda. Na extensão, abra o gerenciador › Instalar e publicar › Enviar para a nuvem.</p>
      ) : (
        <ul className="overlay-list">
          {rows.map((row) => {
            const clients = row.spec.clients ?? [];
            const clientId = clientOf[row.id] ?? row.spec.activeClientId ?? clients[0]?.id ?? '';
            return (
              <li key={row.id} className="card">
                <div className="row row--between">
                  <div>
                    <h2>{row.name}</h2>
                    <p className="muted small">{row.matches.join(' · ') || 'sem endereço'} · {(row.spec.edits ?? []).length} alterações · {(row.spec.variables ?? []).length} variáveis · {(row.spec.rules ?? []).length} eventos · atualizado {when(row.updated_at)}</p>
                  </div>
                  <span className={`overlay-badge${row.published ? ' overlay-badge--on' : ''}`}>{row.published ? 'Publicado' : 'Não publicado'}</span>
                </div>
                <div className="row">
                  <label>
                    <span className="small muted">Projeto do editor</span>
                    <select value={row.project_id ?? ''} disabled={!canEdit(workspace.role)} onChange={(e) => void link(row, e.target.value)}>
                      <option value="">— nenhum —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="small muted">Cliente do código</span>
                    <select value={clientId} onChange={(e) => setClientOf({ ...clientOf, [row.id]: e.target.value })}>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {row.published && row.public_key ? (
                  <div>
                    <p className="small muted">Cole no site do cliente, antes do &lt;/body&gt;:</p>
                    <pre className="overlay-code"><code>{snippet(row, clientId)}</code></pre>
                  </div>
                ) : null}
                <div className="row">
                  {canEdit(workspace.role) ? (
                    <button type="button" className={row.published ? 'button' : 'button button--primary'} onClick={() => void setPublished(row, !row.published)}>{row.published ? 'Despublicar' : 'Publicar'}</button>
                  ) : null}
                  {row.published && row.public_key ? <button type="button" className="button" onClick={() => copy(snippet(row, clientId))}>Copiar código</button> : null}
                  {extension === 'present' ? <button type="button" className="button" onClick={() => void openWithExtension(row)}>Abrir com a extensão</button> : null}
                  {canAdmin(workspace.role) ? <button type="button" className="button button--danger" onClick={() => remove(row)}>Excluir</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
