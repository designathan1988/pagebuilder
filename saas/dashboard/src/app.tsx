// O painel: a sessão (ou a tela de entrar), o espaço de trabalho escolhido e as páginas, por endereço com # para
// funcionar em qualquer hospedagem estática.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthScreen, NewPassword } from './auth.tsx';
import { Billing } from './billing.tsx';
import { Database } from './database.tsx';
import { Forms } from './forms.tsx';
import { Overlays } from './overlays.tsx';
import { Account } from './account.tsx';
import { ProjectDetail } from './project.tsx';
import { Projects } from './projects.tsx';
import { configured, supabase, type Workspace, type Role } from './supabase.ts';

const subscribeHash = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
const readHash = () => window.location.hash.replace(/^#\/?/, '') || 'projetos';
export const go = (path: string) => {
  window.location.hash = `/${path}`;
};

// depois de entrar, de volta ao editor que pediu a sessão (?next=), se for desta origem
function returnToNext(): boolean {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return false;
  try {
    const target = new URL(next, window.location.origin);
    if (target.origin !== window.location.origin) return false;
    window.location.replace(target.href);
    return true;
  } catch {
    return false;
  }
}

const WORKSPACE_KEY = 'painel.workspace';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && next !== null && returnToNext()) return;
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <main className="auth">
        <section className="auth__card">
          <h1>Painel não configurado</h1>
          <p className="muted">Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja saas/README.md).</p>
        </section>
      </main>
    );
  }
  if (session === undefined) return <div className="loading">Carregando…</div>;
  if (recovering && session !== null) return <NewPassword onDone={() => setRecovering(false)} />;
  if (session === null) return <AuthScreen />;
  return <Shell session={session} />;
}

function Shell({ session }: { session: Session }) {
  const route = useSyncExternalStore(subscribeHash, readHash);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [current, setCurrent] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(WORKSPACE_KEY);
    } catch {
      return null;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    const { data } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id, name)')
      .eq('user_id', session.user.id);
    const list = (data ?? []).flatMap((row) => {
      const ws = row.workspaces as unknown as { id: string; name: string } | null;
      return ws ? [{ id: ws.id, name: ws.name, role: row.role as Role }] : [];
    });
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setWorkspaces(list);
  }, [session.user.id]);
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const workspace = workspaces?.find((w) => w.id === current) ?? workspaces?.find((w) => w.role === 'owner') ?? workspaces?.[0] ?? null;
  const choose = (id: string) => {
    setCurrent(id);
    try {
      window.localStorage.setItem(WORKSPACE_KEY, id);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  };

  if (workspaces === null) return <div className="loading">Carregando…</div>;
  const [page, param] = route.split('/');
  const nav = [
    { path: 'projetos', label: 'Projetos' },
    { path: 'formularios', label: 'Formulários' },
    { path: 'dados', label: 'Banco de dados' },
    { path: 'personalizacoes', label: 'Personalizações' },
    { path: 'plano', label: 'Plano e cobrança' },
    { path: 'conta', label: 'Conta e espaços' },
  ];
  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="topbar__menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>☰</button>
        <span className="brand">Webconstructor</span>
        {workspace !== null ? (
          <label className="workspace-picker">
            <span className="visually-hidden">Espaço de trabalho</span>
            <select value={workspace.id} onChange={(e) => choose(e.target.value)}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="topbar__user" title={session.user.email}>{session.user.email}</span>
      </header>
      <nav className={`sidenav${menuOpen ? ' is-open' : ''}`} aria-label="Seções do painel">
        {nav.map((item) => (
          <a key={item.path} href={`#/${item.path}`} className={page === item.path || (page === 'projeto' && item.path === 'projetos') ? 'is-active' : ''} onClick={() => setMenuOpen(false)}>
            {item.label}
          </a>
        ))}
        <button type="button" className="link sidenav__out" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Sair</button>
      </nav>
      <main className="content">
        {workspace === null ? (
          <p className="muted">Nenhum espaço de trabalho. Crie um em Conta e espaços.</p>
        ) : page === 'projeto' && param ? (
          <ProjectDetail key={param} projectId={param} workspace={workspace} />
        ) : page === 'formularios' ? (
          <Forms key={workspace.id} workspace={workspace} />
        ) : page === 'dados' ? (
          <Database key={workspace.id} workspace={workspace} />
        ) : page === 'personalizacoes' ? (
          <Overlays key={workspace.id} workspace={workspace} />
        ) : page === 'plano' ? (
          <Billing key={workspace.id} workspace={workspace} email={session.user.email ?? ''} />
        ) : page === 'conta' ? (
          <Account session={session} workspace={workspace} onChanged={loadWorkspaces} onCreated={(id) => { choose(id); void loadWorkspaces(); }} />
        ) : (
          <Projects key={workspace.id} workspace={workspace} />
        )}
      </main>
    </div>
  );
}
