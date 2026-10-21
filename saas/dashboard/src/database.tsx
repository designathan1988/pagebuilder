// O banco de dados dos apps publicados: por site, as tabelas que o editor declarou (sites.data_rules), as linhas de
// cada uma (ver, exportar CSV, excluir) e os membros que se cadastraram no site (tornar administrador, remover).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { canAdmin, canEdit, errorText, supabase, when, type Workspace } from './supabase.ts';

interface Rule { name: string; read: string; write: string }
interface SiteRow { id: string; slug: string; data_rules: Rule[] | null; projects: { name: string } | null }
interface RecordRow { id: string; data: Record<string, unknown>; owner_id: string | null; created_at: string }
interface MemberRow { id: string; email: string; name: string; role: string; created_at: string }

const READ: Record<string, string> = { public: 'qualquer visitante lê', members: 'membros logados leem', owner: 'cada membro lê as próprias', admin: 'só administradores leem' };
const WRITE: Record<string, string> = { public: 'qualquer visitante adiciona', members: 'membros adicionam', admin: 'só administradores adicionam' };
const PAGE = 100;

const cellText = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

function csv(rows: RecordRow[], members: Map<string, string>): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row.data)))];
  const cell = (value: unknown) => {
    const text = cellText(value);
    // uma célula que começa com = + - @ vira texto, para a planilha não executá-la como fórmula
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const head = ['Criado em', 'Membro', ...keys].map(cell).join(';');
  const body = rows.map((row) => [new Date(row.created_at).toLocaleString('pt-BR'), row.owner_id ? members.get(row.owner_id) ?? '' : '', ...keys.map((k) => row.data[k])].map(cell).join(';'));
  return `﻿${[head, ...body].join('\r\n')}`;
}

export function Database({ workspace }: { workspace: Workspace }) {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [site, setSite] = useState('');
  const [table, setTable] = useState('');
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: failed } = await supabase.from('sites').select('id, slug, data_rules, projects(name)').eq('workspace_id', workspace.id).not('published_at', 'is', null);
      if (failed) setError(errorText(failed));
      const list = (data ?? []) as unknown as SiteRow[];
      setSites(list);
      const first = list.find((s) => (s.data_rules ?? []).length > 0) ?? list[0];
      if (first) setSite(first.id);
    })();
  }, [workspace.id]);

  const current = sites?.find((s) => s.id === site) ?? null;
  const rules = useMemo(() => current?.data_rules ?? [], [current]);
  useEffect(() => {
    setTable(rules[0]?.name ?? '');
    setLimit(PAGE);
  }, [rules]);

  const load = useCallback(async () => {
    if (site === '') return;
    const { data: people } = await supabase.from('site_members').select('id, email, name, role, created_at').eq('site_id', site).order('created_at', { ascending: false });
    setMembers((people ?? []) as MemberRow[]);
    if (table === '') {
      setRows([]);
      return;
    }
    const { data, error: failed } = await supabase.from('site_records').select('id, data, owner_id, created_at').eq('site_id', site).eq('collection', table).order('created_at', { ascending: false }).limit(limit);
    if (failed) setError(errorText(failed));
    setRows((data ?? []) as RecordRow[]);
  }, [site, table, limit]);
  useEffect(() => {
    void load();
  }, [load]);

  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.name || m.email])), [members]);
  const keys = useMemo(() => [...new Set((rows ?? []).flatMap((row) => Object.keys(row.data)))].slice(0, 8), [rows]);

  const removeRow = async (row: RecordRow) => {
    if (!window.confirm('Excluir esta linha? O site deixa de mostrá-la na hora.')) return;
    const { error: failed } = await supabase.from('site_records').delete().eq('id', row.id);
    if (failed) setError(errorText(failed));
    void load();
  };
  const setRole = async (member: MemberRow, role: string) => {
    const { error: failed } = await supabase.from('site_members').update({ role }).eq('id', member.id);
    if (failed) setError(errorText(failed));
    void load();
  };
  const removeMember = async (member: MemberRow) => {
    if (!window.confirm(`Remover ${member.email}? A pessoa perde o acesso; o que ela escreveu continua no site.`)) return;
    const { error: failed } = await supabase.from('site_members').delete().eq('id', member.id);
    if (failed) setError(errorText(failed));
    void load();
  };
  const exportCsv = () => {
    if (!rows) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv(rows, memberNames)], { type: 'text/csv;charset=utf-8' }));
    link.download = `${current?.slug ?? 'site'}-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const rule = rules.find((r) => r.name === table);
  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h1>Banco de dados</h1>
          <p className="muted">O que os apps dos seus sites guardam (app.db) e as pessoas que se cadastraram neles (app.auth).</p>
        </div>
        <button type="button" className="button" onClick={exportCsv} disabled={!rows || rows.length === 0}>Exportar CSV</button>
      </header>
      {error !== null ? <p className="notice notice--error">{error}</p> : null}
      {sites === null ? (
        <p className="muted">Carregando…</p>
      ) : sites.length === 0 ? (
        <div className="empty card">
          <h2>Nenhum site publicado</h2>
          <p className="muted">No editor, crie tabelas no painel App › Banco de dados, use app.db no seu app e publique. Os dados aparecem aqui.</p>
        </div>
      ) : (
        <>
          <div className="row filters">
            <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projects?.name ?? s.slug}</option>
              ))}
            </select>
            <select value={table} onChange={(e) => setTable(e.target.value)} aria-label="Tabela" disabled={rules.length === 0}>
              {rules.length === 0 ? <option value="">Sem tabelas</option> : null}
              {rules.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
            {rule ? <span className="muted small">{READ[rule.read]} · {WRITE[rule.write]}</span> : null}
          </div>
          {rows === null ? (
            <p className="muted">Carregando…</p>
          ) : rows.length === 0 ? (
            <div className="empty card">
              <h2>{rules.length === 0 ? 'Este site não tem tabelas' : 'Nenhuma linha ainda'}</h2>
              <p className="muted">{rules.length === 0 ? 'Crie tabelas no painel App › Banco de dados do editor e publique de novo.' : 'Quando o app gravar nesta tabela, as linhas aparecem aqui.'}</p>
            </div>
          ) : (
            <div className="card table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Criado em</th>
                    <th>Membro</th>
                    {keys.map((k) => <th key={k}>{k}</th>)}
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="small">{when(row.created_at)}</td>
                      <td className="small">{row.owner_id ? memberNames.get(row.owner_id) ?? '—' : 'visitante'}</td>
                      {keys.map((k) => <td key={k} title={cellText(row.data[k])}>{cellText(row.data[k]).slice(0, 120)}</td>)}
                      <td>{canEdit(workspace.role) ? <button type="button" className="button button--small button--danger" onClick={() => void removeRow(row)}>Excluir</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows !== null && rows.length === limit ? <button type="button" className="button" onClick={() => setLimit(limit + PAGE)}>Carregar mais</button> : null}

          <h2 className="section-title">Membros do site ({members.length})</h2>
          {members.length === 0 ? (
            <p className="muted">Ninguém se cadastrou ainda. Use app.auth.signup no app para ter cadastro e login.</p>
          ) : (
            <ul className="stack">
              {members.map((member) => (
                <li key={member.id} className="card row member">
                  <div className="member__who">
                    <strong>{member.name || member.email}</strong>
                    <span className="muted small">{member.email} · desde {when(member.created_at)}</span>
                  </div>
                  <span className={`pill${member.role === 'admin' ? ' pill--ok' : ''}`}>{member.role === 'admin' ? 'Administrador' : 'Membro'}</span>
                  {canAdmin(workspace.role) ? (
                    <>
                      <button type="button" className="button button--small" onClick={() => void setRole(member, member.role === 'admin' ? 'member' : 'admin')}>
                        {member.role === 'admin' ? 'Tornar membro' : 'Tornar administrador'}
                      </button>
                      <button type="button" className="button button--small button--danger" onClick={() => void removeMember(member)}>Remover</button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
