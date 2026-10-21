// Cloud mode: the editor opened from the dashboard (/painel/) with ?project=<id> loads that project from Supabase,
// saves every change back to it, keeps a version every few minutes and publishes the site the Export ZIP describes.
// Without the build's Supabase settings, or without ?project=, the editor stays the local one (IndexedDB autosave).
// The Supabase client is loaded only in cloud mode, so the local editor's bundle does not carry it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentJson } from '../../core/document/model.ts';
import type { MessageId } from '../../generated/ids.ts';
import { systemClock, type Clock } from '../../core/ports/clock.ts';
import { packageArchive } from '../../core/export/export.ts';
import { siteScripts } from '../forms/script.ts';
import { MODEL_RULES, type EditorStore } from '../store.ts';

export interface CloudConfig { readonly url: string; readonly key: string; readonly sitesDomain: string }

export function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return null;
  return { url, key, sitesDomain: (import.meta.env.VITE_SITES_DOMAIN as string | undefined) ?? '' };
}

export const cloudProjectId = (): string | null => new URLSearchParams(window.location.search).get('project');

export interface CloudProject {
  readonly id: string;
  readonly name: string;
  readonly workspaceId: string;
  readonly document: unknown;
  readonly updatedAt: string;
  readonly site: { readonly slug: string; readonly url: string } | null;
}

// the bar's state: what the save is doing, and the last publication
export type CloudSave = 'saved' | 'saving' | 'failed' | 'conflict';
export const CLOUD_SAVE_TEXT: Readonly<Record<CloudSave, MessageId>> = {
  saved: 'cloud.save.saved',
  saving: 'cloud.save.saving',
  failed: 'cloud.save.failed',
  conflict: 'cloud.save.conflict',
};
export interface CloudState {
  readonly project: CloudProject | null;
  readonly save: CloudSave;
  readonly publishing: boolean;
  readonly published: string | null;
  readonly error: string | null;
}

let state: CloudState = { project: null, save: 'saved', publishing: false, published: null, error: null };
const listeners = new Set<() => void>();
const set = (value: Partial<CloudState>) => {
  state = { ...state, ...value };
  for (const listener of listeners) listener();
};
export const cloudState = {
  get: (): CloudState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let client: SupabaseClient | null = null;
let config: CloudConfig | null = null;

export const dashboardUrl = (): string => new URL('/painel/', window.location.origin).href;

// The project named by ?project=, read with the person's session. No session: the dashboard's sign-in, which comes
// back here. Null: not cloud mode. A thrown error: the project could not be read (no access, deleted, offline).
export async function openCloud(): Promise<CloudProject | null> {
  const id = cloudProjectId();
  config = cloudConfig();
  if (id === null || config === null) return null;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(config.url, config.key);
  const { data: auth } = await client.auth.getSession();
  if (auth.session === null) {
    window.location.replace(`${dashboardUrl()}?next=${encodeURIComponent(window.location.href)}`);
    return new Promise(() => { });
  }
  const { data, error } = await client
    .from('projects')
    .select('id, name, workspace_id, document, updated_at, sites(slug)')
    .eq('id', id)
    .single();
  if (error !== null || data === null) throw new Error(error?.message ?? 'project not found');
  const sites = (data.sites ?? []) as readonly { slug: string }[];
  const slug = sites[0]?.slug;
  const project: CloudProject = {
    id: data.id as string,
    name: data.name as string,
    workspaceId: data.workspace_id as string,
    document: data.document,
    updatedAt: data.updated_at as string,
    site: slug ? { slug, url: siteUrl(slug) } : null,
  };
  set({ project, published: project.site?.url ?? null });
  document.title = `${project.name} · Editor`;
  return project;
}

const siteUrl = (slug: string) => `https://${slug}.${config?.sitesDomain ?? ''}`;

async function accessToken(): Promise<string | null> {
  if (client === null) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

const SAVE_WAIT = 1500;
const VERSION_EVERY = 10 * 60 * 1000;

// Writes the store's document to the project after each change, once the person pauses (SAVE_WAIT). Each write names
// the updated_at it last read: a project changed elsewhere since (another device) is not overwritten, the bar asks to
// reload instead. A version is kept every VERSION_EVERY while the project changes.
export function startCloudSave(store: EditorStore, canWrite: () => boolean = () => true, clock: Clock = systemClock): () => void {
  const project = state.project;
  if (client === null || project === null) return () => { };
  const db = client;
  let known = project.updatedAt;
  let last = store.getState().document;
  let timer = 0;
  let writing: Promise<void> | null = null;
  let dirty = false;
  let versioned = clock.now();
  const write = async (): Promise<void> => {
    if (state.save === 'conflict' || !canWrite()) return;
    const document = store.getState().document;
    dirty = false;
    set({ save: 'saving' });
    const { data, error } = await db
      .from('projects')
      .update({ document })
      .eq('id', project.id)
      .eq('updated_at', known)
      .select('updated_at');
    if (error !== null) {
      dirty = true;
      set({ save: 'failed', error: error.message });
      timer = window.setTimeout(flush, SAVE_WAIT * 4);
      return;
    }
    const row = data[0];
    if (row === undefined) {
      set({ save: 'conflict' });
      return;
    }
    known = row.updated_at as string;
    if (clock.now() - versioned >= VERSION_EVERY) {
      versioned = clock.now();
      await db.from('project_versions').insert({ project_id: project.id, workspace_id: project.workspaceId, document });
    }
    set({ save: dirty ? 'saving' : 'saved', error: null });
  };
  const flush = () => {
    window.clearTimeout(timer);
    timer = 0;
    if (writing !== null) {
      // a change during a write: written again when it ends
      dirty = true;
      return;
    }
    writing = write().finally(() => {
      writing = null;
      if (dirty && state.save !== 'conflict' && state.save !== 'failed') flush();
    });
  };
  const unsubscribe = store.subscribe(() => {
    const now = store.getState().document;
    if (now === last) return;
    last = now;
    dirty = true;
    if (state.save !== 'conflict') set({ save: 'saving' });
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_WAIT);
  });
  // leaving with a change not yet written asks first
  const guard = (event: BeforeUnloadEvent) => {
    if (dirty || writing !== null) event.preventDefault();
  };
  const hidden = () => {
    if (document.visibilityState === 'hidden' && dirty) flush();
  };
  window.addEventListener('beforeunload', guard);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
    window.removeEventListener('beforeunload', guard);
    document.removeEventListener('visibilitychange', hidden);
  };
}

// the publish function's rule (saas/supabase/functions/_shared/sites.ts): a DNS label, and none of the reserved names
const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'painel', 'publish', 'customers', 'fallback', 'mail', 'status']);
export const validSlug = (slug: string): boolean => SLUG.test(slug) && !RESERVED.has(slug);
export const slugFrom = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'meu-site';

// Publishes the site: the Export ZIP's files as an installable web app, sent to the publish function, which puts them
// online at https://<slug>.<sites domain>. Returns the address, or throws the function's error code.
export async function publishCloud(document: DocumentJson, slug: string): Promise<string> {
  const project = state.project;
  if (client === null || config === null || project === null) throw new Error('not_cloud');
  const token = await accessToken();
  if (token === null) throw new Error('signed_out');
  set({ publishing: true, error: null });
  try {
    // the published site is an installable web app (core/export/packages.ts): offline, and PWABuilder packs it
    const zip = packageArchive('pwa', document, MODEL_RULES, siteScripts);
    const address = new URL('/functions/v1/publish', config.url);
    address.searchParams.set('project', project.id);
    address.searchParams.set('slug', slug);
    // the database's tables and who reads and adds to each (app.db): the platform checks every visitor's call by them
    address.searchParams.set('rules', JSON.stringify(document.app?.tables ?? []));
    const response = await fetch(address, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: config.key, 'content-type': 'application/zip' },
      body: new Uint8Array(zip),
    });
    const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !body.url) throw new Error(body.error ?? `http_${response.status}`);
    set({ published: body.url, project: { ...project, site: { slug, url: body.url } } });
    return body.url;
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    set({ publishing: false });
  }
}

// The assistant in cloud mode: Claude answers through the ai-proxy function, which holds the API key and counts the
// workspace's credits; the person's session token stands where the API key would.
export function cloudAssistant(): { readonly endpoint: string; readonly host: string; readonly token: () => Promise<string | null> } | null {
  const project = state.project;
  if (config === null || project === null) return null;
  const endpoint = new URL('/functions/v1/ai-proxy', config.url);
  endpoint.searchParams.set('workspace', project.workspaceId);
  return { endpoint: endpoint.href, host: endpoint.hostname, token: accessToken };
}

// Opening a web address in cloud mode: the platform's capture service (saas/capture), with the person's session, in
// place of the Companion a person would have to run (VITE_CAPTURE_URL; without it, the Companion as before)
export function cloudCapture(): { readonly url: string; readonly headers: () => Promise<Readonly<Record<string, string>>>; readonly cloud: true } | null {
  const url = import.meta.env.VITE_CAPTURE_URL as string | undefined;
  if (!url || state.project === null) return null;
  return {
    url: url.replace(/\/$/, ''),
    headers: async () => {
      const token = await accessToken();
      return token === null ? {} : { authorization: `Bearer ${token}` };
    },
    cloud: true,
  };
}
