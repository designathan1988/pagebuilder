// The workspace's projects: create (and open in the editor), rename, delete, and view the published site.
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { go } from './app.tsx';
import { callFunction, canAdmin, canEdit, editorLink, errorText, siteUrl, supabase, when, type Project, type Workspace } from './supabase.ts';

// one color per project, derived from its name, so the cards are not all alike
const hueOf = (name: string) => [...name].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 360, 7);

export function Projects({ workspace }: { workspace: Workspace }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const { data, error: failed } = await supabase
      .from('projects')
      .select('id, name, updated_at, created_at, client_mode, sites(id, slug, version, published_at)')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false });
    if (failed) setError(errorText(failed));
    setProjects((data ?? []) as Project[]);
  }, [workspace.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const { data, error: failed } = await supabase.from('projects').insert({ workspace_id: workspace.id, name: name.trim() }).select('id').single();
    if (failed) {
      setError(errorText(failed));
      return;
    }
    window.location.assign(editorLink(data.id as string));
  };

  const rename = async (project: Project) => {
    const next = window.prompt('Novo nome do projeto', project.name)?.trim();
    if (!next || next === project.name) return;
    const { error: failed } = await supabase.from('projects').update({ name: next }).eq('id', project.id);
    if (failed) setError(errorText(failed));
    void load();
  };

  const remove = async (project: Project) => {
    const published = project.sites.length > 0;
    const sure = window.confirm(`Excluir "${project.name}"?${published ? ' O site publicado sai do ar.' : ''} Isso não pode ser desfeito.`);
    if (!sure) return;
    try {
      if (published) {
        await callFunction('publish', { method: 'DELETE', query: { project: project.id } });
      }
      const { error: failed } = await supabase.from('projects').delete().eq('id', project.id);
      if (failed) throw failed;
    } catch (failure) {
      setError(errorText(failure));
    }
    void load();
  };

  const shown = (projects ?? []).filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Projetos</h1>
          <p className="muted">Cada projeto é um site. Abra no editor para criar as páginas e publicar.</p>
        </div>
        {canEdit(workspace.role) ? (
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>Novo projeto</button>
        ) : null}
      </header>
      {creating ? (
        <form className="card create" onSubmit={create}>
          <label className="field">
            <span>Nome do projeto</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Site da Padaria Pão Quente" maxLength={120} autoFocus required />
          </label>
          <div className="row">
            <button className="button button--primary">Criar e abrir no editor</button>
            <button type="button" className="button" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </form>
      ) : null}
      {error !== null ? <p className="notice notice--error" role="alert">{error}{error.includes('limite') ? <> <a href="#/plano">Ver planos</a></> : null}</p> : null}
      {projects !== null && projects.length > 5 ? (
        <input className="search" type="search" placeholder="Buscar projetos" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar projetos" />
      ) : null}
      {projects === null ? (
        <p className="muted">Carregando…</p>
      ) : projects.length === 0 ? (
        <div className="empty card">
          <h2>Seu primeiro site começa aqui</h2>
          <p className="muted">Crie um projeto e escolha uma landing page pronta ou comece do zero. Você publica com um clique.</p>
          {canEdit(workspace.role) ? <button type="button" className="button button--primary" onClick={() => setCreating(true)}>Criar meu primeiro projeto</button> : null}
        </div>
      ) : (
        <ul className="grid">
          {shown.map((project) => {
            const site = project.sites[0];
            return (
              <li key={project.id} className="card project">
                <a className="project__open" href={editorLink(project.id)}>
                  <span className="project__thumb" aria-hidden="true" style={{ '--hue': hueOf(project.name) } as CSSProperties}>{project.name.slice(0, 1).toUpperCase()}</span>
                  <strong>{project.name}</strong>
                </a>
                <p className="muted small">Editado {when(project.updated_at)}</p>
                {site?.published_at ? (
                  <a className="pill pill--ok" href={siteUrl(site.slug)} target="_blank" rel="noreferrer">No ar · {site.slug}</a>
                ) : (
                  <span className="pill">Não publicado</span>
                )}
                <div className="row project__actions">
                  <a className="button button--small button--primary" href={editorLink(project.id)}>Editar</a>
                  <button type="button" className="button button--small" onClick={() => go(`projeto/${project.id}`)}>Site e domínio</button>
                  {canEdit(workspace.role) ? <button type="button" className="button button--small" onClick={() => void rename(project)}>Renomear</button> : null}
                  {canAdmin(workspace.role) ? <button type="button" className="button button--small button--danger" onClick={() => void remove(project)}>Excluir</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
