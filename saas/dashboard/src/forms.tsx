// The messages the sites' forms receive: per site, unread first, mark as read, export CSV.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { canAdmin, canEdit, errorText, supabase, when, type Submission, type Workspace } from './supabase.ts';

interface SiteName { id: string; slug: string; projects: { name: string } | null }

const PAGE = 50;

function csv(rows: Submission[], sites: Map<string, string>): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row.data)))];
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // a cell starting with = + - @ becomes text, so the spreadsheet does not run it as a formula
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const head = ['Data', 'Site', 'Página', ...keys].map(cell).join(';');
  const body = rows.map((row) => [new Date(row.created_at).toLocaleString('pt-BR'), sites.get(row.site_id) ?? '', row.page ?? '', ...keys.map((k) => row.data[k])].map(cell).join(';'));
  return `﻿${[head, ...body].join('\r\n')}`;
}

export function Forms({ workspace }: { workspace: Workspace }) {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [sites, setSites] = useState<SiteName[]>([]);
  const [site, setSite] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: siteRows } = await supabase.from('sites').select('id, slug, projects(name)').eq('workspace_id', workspace.id);
    setSites((siteRows ?? []) as unknown as SiteName[]);
    let query = supabase.from('form_submissions').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(limit);
    if (site) query = query.eq('site_id', site);
    if (onlyUnread) query = query.is('read_at', null);
    const { data, error: failed } = await query;
    if (failed) setError(errorText(failed));
    setRows((data ?? []) as Submission[]);
  }, [workspace.id, site, onlyUnread, limit]);
  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => new Map(sites.map((s) => [s.id, s.projects?.name ?? s.slug])), [sites]);

  const markRead = async (row: Submission, read: boolean) => {
    await supabase.from('form_submissions').update({ read_at: read ? new Date().toISOString() : null }).eq('id', row.id);
    void load();
  };
  const remove = async (row: Submission) => {
    if (!window.confirm('Excluir esta mensagem?')) return;
    await supabase.from('form_submissions').delete().eq('id', row.id);
    void load();
  };
  const exportCsv = () => {
    if (!rows) return;
    const blob = new Blob([csv(rows, names)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `formularios-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const unread = (rows ?? []).filter((r) => r.read_at === null).length;
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Formulários</h1>
          <p className="muted">O que os visitantes enviam pelos formulários dos seus sites chega aqui.</p>
        </div>
        <button type="button" className="button" onClick={exportCsv} disabled={!rows || rows.length === 0}>Exportar CSV</button>
      </header>
      <div className="row filters">
        <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
          <option value="">Todos os sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.projects?.name ?? s.slug}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Só não lidas
        </label>
        {unread > 0 ? <span className="pill pill--wait">{unread} não lida{unread > 1 ? 's' : ''}</span> : null}
      </div>
      {error !== null ? <p className="notice notice--error">{error}</p> : null}
      {rows === null ? (
        <p className="muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="empty card">
          <h2>Nenhuma mensagem ainda</h2>
          <p className="muted">Coloque a seção Contato (ou qualquer formulário) no seu site e publique. As respostas aparecem aqui.</p>
        </div>
      ) : (
        <ul className="stack">
          {rows.map((row) => {
            const entries = Object.entries(row.data);
            const preview = entries.slice(0, 2).map(([, v]) => String(v)).join(' · ');
            return (
              <li key={row.id} className={`card message${row.read_at === null ? ' is-unread' : ''}`}>
                <button
                  type="button"
                  className="message__head"
                  aria-expanded={open === row.id}
                  onClick={() => {
                    setOpen(open === row.id ? null : row.id);
                    if (row.read_at === null && canEdit(workspace.role)) void markRead(row, true);
                  }}
                >
                  <strong>{names.get(row.site_id) ?? 'Site'}</strong>
                  <span className="muted message__preview">{preview}</span>
                  <span className="muted small">{when(row.created_at)}</span>
                </button>
                {open === row.id ? (
                  <div className="message__body">
                    <dl>
                      {entries.map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                    {row.page ? <p className="muted small">Enviado de {row.page}</p> : null}
                    <div className="row">
                      {canEdit(workspace.role) ? <button type="button" className="button button--small" onClick={() => void markRead(row, false)}>Marcar como não lida</button> : null}
                      {canAdmin(workspace.role) ? <button type="button" className="button button--small button--danger" onClick={() => void remove(row)}>Excluir</button> : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {rows !== null && rows.length === limit ? (
        <button type="button" className="button" onClick={() => setLimit(limit + PAGE)}>Carregar mais</button>
      ) : null}
    </section>
  );
}
