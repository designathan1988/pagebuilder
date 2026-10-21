// Conta e espaços: o nome da pessoa, o nome do espaço atual, um novo espaço (uma agência separa os clientes por espaço)
// e sair.
import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { canAdmin, errorText, supabase, type Workspace } from './supabase.ts';

export function Account({ session, workspace, onChanged, onCreated }: { session: Session; workspace: Workspace; onChanged: () => void; onCreated: (id: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [wsName, setWsName] = useState(workspace.name);
  const [newWs, setNewWs] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => setFullName((data?.full_name as string | null) ?? ''));
  }, [session.user.id]);
  useEffect(() => setWsName(workspace.name), [workspace.name]);

  const done = (what: string) => {
    setSaved(what);
    setError(null);
    window.setTimeout(() => setSaved(null), 2500);
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const { error: failed } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', session.user.id);
    if (failed) setError(errorText(failed));
    else done('Nome salvo.');
  };
  const renameWs = async (event: FormEvent) => {
    event.preventDefault();
    const { error: failed } = await supabase.from('workspaces').update({ name: wsName.trim() }).eq('id', workspace.id);
    if (failed) setError(errorText(failed));
    else {
      done('Espaço renomeado.');
      onChanged();
    }
  };
  const createWs = async (event: FormEvent) => {
    event.preventDefault();
    const { data, error: failed } = await supabase.rpc('create_workspace', { workspace_name: newWs.trim() });
    if (failed) setError(errorText(failed));
    else {
      setNewWs('');
      done('Espaço criado.');
      onCreated((data as { id: string }).id);
    }
  };

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Conta e espaços</h1>
          <p className="muted">{session.user.email}</p>
        </div>
      </header>
      {saved !== null ? <p className="notice notice--ok" role="status">{saved}</p> : null}
      {error !== null ? <p className="notice notice--error" role="alert">{error}</p> : null}
      <article className="card">
        <h2>Seu nome</h2>
        <form className="row" onSubmit={saveProfile}>
          <input className="grow" value={fullName} onChange={(e) => setFullName(e.target.value)} aria-label="Seu nome" />
          <button className="button">Salvar</button>
        </form>
      </article>
      {canAdmin(workspace.role) ? (
        <article className="card">
          <h2>Espaço atual</h2>
          <form className="row" onSubmit={renameWs}>
            <input className="grow" value={wsName} onChange={(e) => setWsName(e.target.value)} maxLength={80} aria-label="Nome do espaço" required />
            <button className="button">Renomear</button>
          </form>
        </article>
      ) : null}
      <article className="card">
        <h2>Novo espaço</h2>
        <p className="muted small">Cada espaço tem seus projetos, sites e plano. Agências usam um espaço por cliente.</p>
        <form className="row" onSubmit={createWs}>
          <input className="grow" value={newWs} onChange={(e) => setNewWs(e.target.value)} placeholder="Ex.: Cliente Padaria" maxLength={80} aria-label="Nome do novo espaço" required />
          <button className="button button--primary">Criar espaço</button>
        </form>
      </article>
      <button type="button" className="button" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Sair desta conta</button>
    </section>
  );
}
