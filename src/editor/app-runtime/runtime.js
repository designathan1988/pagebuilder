// The application runtime of a published site (spec app-logic): js/app-layer/runtime.js, imported as '@app/runtime' by the
// site's js/app-layer/main.js (written by core/logic/compile.ts) and by the project's own scripts and code components.
//  - state: the project's variables, deeply reactive (a Proxy per object): reading one inside a binding subscribes the
//    binding, writing one redraws exactly the bindings that read it, once per microtask.
//  - app: the helpers every expression and script has (go, fetch, store, toast, download, copy, emit, sleep, uid…),
//    the database (app.db) and the site's members (app.auth).
//  - fn: the functions the project's scripts export, by name, and each script's module by the script's name.
// Each element with logic carries data-app="<id>"; start() reads the compiled definitions and wires them: text, html,
// show, repeat (each/as/key), two-way fields (model), attribute/class/style/property bindings, code components and
// event handlers (DOM events, window:/document: events, mount, frame, every:<ms>).

// the words the visitor reads, in each UI language of the editor: script.ts writes them here from the catalogues
// (app-runtime/words.ts), and the page's language picks one table, Portuguese for a pt page and English for any other
const WORDS_BY_LANGUAGE = /* site words */ {};
const WORDS = WORDS_BY_LANGUAGE[/^pt(-|$)/i.test(document.documentElement.lang) ? 'pt-BR' : 'en'];

const ITERATE = Symbol('iterate');
const RAW = Symbol('raw');
const proxies = new WeakMap();
const subscribers = new WeakMap();
let running = null;
const pending = new Set();
let flushing = false;

function track(target, key) {
  if (running === null || running.stopped) return;
  let keys = subscribers.get(target);
  if (keys === undefined) subscribers.set(target, (keys = new Map()));
  let effects = keys.get(key);
  if (effects === undefined) keys.set(key, (effects = new Set()));
  if (!effects.has(running)) {
    effects.add(running);
    running.deps.push(effects);
  }
}

function trigger(target, key) {
  const keys = subscribers.get(target);
  if (keys === undefined) return;
  for (const one of [keys.get(key), keys.get(ITERATE)]) if (one !== undefined) for (const effect of [...one]) schedule(effect);
}

function schedule(effect) {
  if (effect.stopped || effect === running) return;
  pending.add(effect);
  if (!flushing) {
    flushing = true;
    queueMicrotask(flush);
  }
}

function flush() {
  // an effect that writes what another reads schedules it again: bounded, so a loop of two effects never hangs the page
  for (let round = 0; pending.size > 0 && round < 100; round += 1) {
    const now = [...pending];
    pending.clear();
    for (const effect of now) effect.run();
  }
  pending.clear();
  flushing = false;
}

export function toRaw(value) {
  return value !== null && typeof value === 'object' && value[RAW] !== undefined ? value[RAW] : value;
}

const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

export function reactive(target) {
  if (target === null || typeof target !== 'object') return target;
  if (target[RAW] !== undefined) return target;
  // only plain objects and arrays are made reactive: a Date, a Map, a DOM node or a class instance stays as it is
  const proto = Object.getPrototypeOf(target);
  if (!Array.isArray(target) && proto !== Object.prototype && proto !== null) return target;
  const known = proxies.get(target);
  if (known !== undefined) return known;
  const proxy = new Proxy(target, {
    get(raw, key, receiver) {
      if (key === RAW) return raw;
      if (Array.isArray(raw) && typeof key === 'string' && MUTATORS.has(key)) {
        // a mutation of a list redraws every reader of the list once, after the whole mutation
        return function (...args) {
          const result = Array.prototype[key].apply(raw, args.map(toRaw));
          trigger(raw, ITERATE);
          trigger(raw, 'length');
          return result;
        };
      }
      const value = Reflect.get(raw, key, receiver);
      if (typeof key === 'symbol') return value;
      track(raw, Array.isArray(raw) && key === 'length' ? ITERATE : key);
      return reactive(value);
    },
    set(raw, key, value) {
      const had = Object.prototype.hasOwnProperty.call(raw, key);
      const old = raw[key];
      const result = Reflect.set(raw, key, toRaw(value));
      if (!had || old !== toRaw(value) || Array.isArray(raw)) {
        trigger(raw, key);
        if (!had || Array.isArray(raw)) trigger(raw, ITERATE);
      }
      return result;
    },
    deleteProperty(raw, key) {
      const result = Reflect.deleteProperty(raw, key);
      trigger(raw, key);
      trigger(raw, ITERATE);
      return result;
    },
    has(raw, key) {
      track(raw, key);
      return Reflect.has(raw, key);
    },
    ownKeys(raw) {
      track(raw, ITERATE);
      return Reflect.ownKeys(raw);
    },
  });
  proxies.set(target, proxy);
  return proxy;
}

// A function that runs now and again whenever something it read changes; stop() ends it.
export function effect(fn, scope) {
  const one = {
    deps: [],
    stopped: false,
    run() {
      if (one.stopped) return;
      for (const set of one.deps) set.delete(one);
      one.deps = [];
      const previous = running;
      running = one;
      try {
        fn();
      } catch (error) {
        report(one.where ?? 'binding', error);
      } finally {
        running = previous;
      }
    },
    stop() {
      one.stopped = true;
      for (const set of one.deps) set.delete(one);
      one.deps = [];
    },
  };
  if (scope !== undefined) scope.effects.push(one);
  one.run();
  return one;
}

// Reads without subscribing the running effect.
export function untracked(fn) {
  const previous = running;
  running = null;
  try {
    return fn();
  } finally {
    running = previous;
  }
}

export const state = reactive({});
export const fn = {};

// ---------------------------------------------------------------- errors

function report(where, error) {
  console.error(`[app] ${where}:`, error);
  if (!document.documentElement.hasAttribute('data-app-debug')) return;
  let box = document.querySelector('[data-app-errors]');
  if (box === null) {
    box = document.createElement('div');
    box.setAttribute('data-app-errors', '');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-height:40vh;overflow:auto;background:#7f1d1d;color:#fff;font:13px/1.4 ui-monospace,monospace;padding:10px 12px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.35);white-space:pre-wrap';
    box.addEventListener('click', () => box.remove());
    box.title = WORDS.closeErrors;
    document.body.appendChild(box);
  }
  const line = document.createElement('div');
  line.textContent = `${where}: ${error && error.message ? error.message : String(error)}`;
  box.appendChild(line);
}

// ---------------------------------------------------------------- app helpers

const STORE_PREFIX = 'app:';
const MISSING = Symbol('missing');
// whether this browser keeps values (a sandboxed frame without its origin, a private mode, a full disk keep none)
let storable = true;

export const app = {
  state,
  fn,
  // the collections of the project, by name: a list of items, each its values and its id
  data: {},
  // go to a page of the site ("contato.html"), an address, or back (-1)
  go(where) {
    if (where === -1) history.back();
    else location.href = String(where);
  },
  // the response of an address: its JSON when it says so, else its text; refused with the status when not ok
  async fetch(url, options = {}) {
    const init = { ...options };
    if (init.body !== undefined && typeof init.body === 'object' && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
      init.body = JSON.stringify(toRaw(init.body));
      init.headers = { 'content-type': 'application/json', ...(init.headers || {}) };
    }
    const response = await fetch(url, init);
    const type = response.headers.get('content-type') || '';
    const body = type.includes('json') ? await response.json() : await response.text();
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status, body });
    return body;
  },
  // values kept in this browser
  store: {
    get(key, fallback = null) {
      try {
        const held = localStorage.getItem(STORE_PREFIX + key);
        return held === null ? fallback : JSON.parse(held);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      if (!storable) return;
      try {
        localStorage.setItem(STORE_PREFIX + key, JSON.stringify(toRaw(value)));
      } catch (error) {
        storable = false;
        console.warn('[app] this browser keeps no values:', error);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(STORE_PREFIX + key);
      } catch {
        /* storage unavailable */
      }
    },
  },
  toast(text, ms = 3000) {
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.textContent = String(text);
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;background:#111827;color:#fff;padding:10px 16px;border-radius:999px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), ms);
  },
  download(name, content, type = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : JSON.stringify(toRaw(content), null, 2)], { type });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async copy(text) {
    await navigator.clipboard.writeText(String(text));
  },
  // a file the visitor picks: its name, type and text (or data URL with { as: 'dataUrl' })
  pick(accept = '', { as = 'text' } = {}) {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, content: reader.result });
        if (as === 'dataUrl') reader.readAsDataURL(file);
        else reader.readAsText(file);
      });
      input.click();
    });
  },
  // a page-wide event the handlers "document:<name>" receive, with $event.detail
  emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  },
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 12);
  },
  el(selector) {
    return document.querySelector(selector);
  },
  all(selector) {
    return [...document.querySelectorAll(selector)];
  },
  // a copy of a value without its reactivity (to send, store or compare)
  plain(value) {
    return JSON.parse(JSON.stringify(toRaw(value)));
  },
  effect(fnToRun) {
    return effect(fnToRun);
  },
  reactive,
};

// ---------------------------------------------------------------- database and members
// app.db keeps rows in the project's tables and app.auth signs the site's members up and in. On a site published by
// the platform both talk to /_api/ on the site's own address (the sites' Worker hands them to the site-data function,
// which checks each table's rules); anywhere else (the preview, an exported site on another host, an app package)
// the rows and the members stay in this browser, under the same rules, so the app works the same way to try it out.

const API = '/_api/';
const SESSION_KEY = 'app:auth';
const LOCAL_ROWS = 'app:db:';
const LOCAL_MEMBERS = 'app:db-members';
const READS = ['public', 'members', 'owner', 'admin'];
let tables = [];
let backend = null;
const session = reactive({ user: null, ready: false });
// what this browser keeps when localStorage is closed to it (a sandboxed preview): the page's own memory
const memory = new Map();

function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    memory.set(key, value);
  }
}

function kept(key, fallback) {
  try {
    const held = localStorage.getItem(key);
    if (held !== null) return JSON.parse(held);
  } catch {
    /* storage unavailable */
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

function forget(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
  memory.delete(key);
}

// an error's message is the visitor's words for its code (WORDS['error.<code>']); a code without words (http_502)
// is its own message
const fail = (code, status) => Object.assign(new Error(Object.hasOwn(WORDS, `error.${code}`) ? WORDS[`error.${code}`] : code), { code, status });

async function cloud() {
  if (backend === null) {
    backend = (async () => {
      if (!/^https?:$/.test(location.protocol)) return false;
      try {
        const response = await fetch(API + 'ping', { headers: { accept: 'application/json' } });
        if (!response.ok) return false;
        const body = await response.json();
        return body !== null && body.service === 'webconstructor-data';
      } catch {
        return false;
      }
    })();
  }
  return backend;
}

async function remote(method, path, body, query) {
  const held = kept(SESSION_KEY, null);
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (held && held.token) headers.authorization = `Bearer ${held.token}`;
  const address = API + path + (query === undefined ? '' : `?q=${encodeURIComponent(JSON.stringify(query))}`);
  const response = await fetch(address, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) {
    // a session the server no longer knows ends here too
    if (response.status === 401 && held) signedOut();
    throw fail(answer.error || `http_${response.status}`, response.status);
  }
  return answer;
}

// ---- the browser's own database: the same rules as the platform's (saas/supabase/functions/_shared/site-data.ts)

function ruleOf(table) {
  const rule = tables.find((one) => one.name === table);
  if (rule === undefined) throw fail('unknown_table', 404);
  return rule;
}

function canRead(rule, user) {
  if (user && user.role === 'admin') return { allowed: true, ownOnly: false };
  if (rule.read === 'public') return { allowed: true, ownOnly: false };
  if (!READS.includes(rule.read) || rule.read === 'admin') return { allowed: false, ownOnly: false };
  return { allowed: user !== null, ownOnly: rule.read === 'owner' };
}

const canCreate = (rule, user) => (user && user.role === 'admin') || rule.write === 'public' || (rule.write === 'members' && user !== null);
const canChange = (rule, user, owner) => user !== null && (user.role === 'admin' || (rule.write !== 'admin' && owner === user.id));
const deny = (user) => fail(user === null ? 'login_required' : 'forbidden', user === null ? 401 : 403);
const clean = (data) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw fail('invalid_data', 400);
  const written = ['id', '_owner', '_created', '_updated'];
  return Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(toRaw(data)))).filter(([key]) => !written.includes(key)));
};

function sortRows(rows, order) {
  const descending = order.startsWith('-');
  const field = descending ? order.slice(1) : order;
  const sign = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[field];
    const y = b[field];
    if (x === y) return 0;
    if (x === undefined || x === null) return 1;
    if (y === undefined || y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * sign;
  });
}

const local = {
  rows: (table) => kept(LOCAL_ROWS + table, []),
  save: (table, rows) => keep(LOCAL_ROWS + table, rows),
  list(table, query = {}) {
    const rule = ruleOf(table);
    const user = session.user;
    const access = canRead(rule, user);
    if (!access.allowed) throw deny(user);
    let rows = local.rows(table);
    if (access.ownOnly || query.mine) {
      if (user === null) throw deny(user);
      rows = rows.filter((row) => row._owner === user.id);
    }
    for (const [key, value] of Object.entries(query.where || {})) rows = rows.filter((row) => row[key] === value);
    rows = sortRows(rows, query.order || '-_created');
    const offset = query.offset || 0;
    return rows.slice(offset, offset + (query.limit || 100));
  },
  get(table, id) {
    const rule = ruleOf(table);
    const user = session.user;
    const access = canRead(rule, user);
    const row = local.rows(table).find((one) => one.id === id);
    if (!access.allowed || row === undefined || (access.ownOnly && row._owner !== (user && user.id))) throw fail('not_found', 404);
    return row;
  },
  add(table, data) {
    const rule = ruleOf(table);
    const user = session.user;
    if (!canCreate(rule, user)) throw deny(user);
    const now = new Date().toISOString();
    const row = { ...clean(data), id: crypto.randomUUID ? crypto.randomUUID() : app.uid(), _owner: user ? user.id : null, _created: now, _updated: now };
    local.save(table, [...local.rows(table), row]);
    return row;
  },
  update(table, id, data) {
    const rule = ruleOf(table);
    const user = session.user;
    const rows = local.rows(table);
    const row = rows.find((one) => one.id === id);
    if (row === undefined) throw fail('not_found', 404);
    if (!canChange(rule, user, row._owner)) throw deny(user);
    const next = { ...row, ...clean(data), id: row.id, _owner: row._owner, _created: row._created, _updated: new Date().toISOString() };
    local.save(table, rows.map((one) => (one === row ? next : one)));
    return next;
  },
  remove(table, id) {
    const rule = ruleOf(table);
    const user = session.user;
    const rows = local.rows(table);
    const row = rows.find((one) => one.id === id);
    if (row === undefined) throw fail('not_found', 404);
    if (!canChange(rule, user, row._owner)) throw deny(user);
    local.save(table, rows.filter((one) => one !== row));
  },
};

// a password kept in this browser only as a salted hash (PBKDF2 where the browser offers it)
async function digest(password, salt) {
  if (globalThis.crypto && crypto.subtle) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
    return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (const c of salt + password) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;
const userOut = (one) => ({ id: one.id, email: one.email, name: one.name, role: one.role });

function signedIn(user, token) {
  keep(SESSION_KEY, { user, token: token || null });
  session.user = user;
  document.dispatchEvent(new CustomEvent('auth', { detail: { user } }));
  return user;
}

function signedOut() {
  forget(SESSION_KEY);
  session.user = null;
  document.dispatchEvent(new CustomEvent('auth', { detail: { user: null } }));
}

app.db = {
  // the rows of a table: { where: { field: value }, order: 'field' | '-field', limit, offset, mine }
  async list(table, query = {}) {
    if (await cloud()) return (await remote('GET', `db/${table}`, undefined, toRaw(query))).items;
    return local.list(table, query);
  },
  async get(table, id) {
    if (await cloud()) return (await remote('GET', `db/${table}/${id}`)).item;
    return local.get(table, id);
  },
  async add(table, data) {
    if (await cloud()) return (await remote('POST', `db/${table}`, { data: clean(data) })).item;
    return local.add(table, data);
  },
  async update(table, id, data) {
    if (await cloud()) return (await remote('PATCH', `db/${table}/${id}`, { data: clean(data) })).item;
    return local.update(table, id, data);
  },
  async remove(table, id) {
    if (await cloud()) await remote('DELETE', `db/${table}/${id}`);
    else local.remove(table, id);
    return true;
  },
  // where the rows live: 'cloud' on a published site, 'browser' anywhere else
  async where() {
    return (await cloud()) ? 'cloud' : 'browser';
  },
};

app.auth = {
  // the signed-in member ({ id, email, name, role }) or null; reading it in a binding redraws it at every sign in/out
  get user() {
    return session.user;
  },
  // true once the session was checked at the start (show a login form only then)
  get ready() {
    return session.ready;
  },
  async signup({ email, password, name = '' } = {}) {
    const address = String(email || '').trim().toLowerCase();
    if (await cloud()) {
      const answer = await remote('POST', 'auth/signup', { email: address, password, name });
      return signedIn(answer.user, answer.token);
    }
    if (!EMAIL.test(address)) throw fail('invalid_email', 400);
    if (String(password || '').length < 8) throw fail('weak_password', 400);
    const members = kept(LOCAL_MEMBERS, []);
    if (members.some((one) => one.email === address)) throw fail('email_taken', 409);
    const salt = app.uid();
    // in the browser the first member is the app's admin, so every rule can be tried out
    const member = { id: crypto.randomUUID ? crypto.randomUUID() : app.uid(), email: address, name: String(name).slice(0, 120), role: members.length === 0 ? 'admin' : 'member', salt, hash: await digest(String(password), salt) };
    keep(LOCAL_MEMBERS, [...members, member]);
    return signedIn(userOut(member));
  },
  async login({ email, password } = {}) {
    const address = String(email || '').trim().toLowerCase();
    if (await cloud()) {
      const answer = await remote('POST', 'auth/login', { email: address, password });
      return signedIn(answer.user, answer.token);
    }
    const member = kept(LOCAL_MEMBERS, []).find((one) => one.email === address);
    if (member === undefined || member.hash !== (await digest(String(password || ''), member.salt))) throw fail('invalid_credentials', 401);
    return signedIn(userOut(member));
  },
  logout() {
    signedOut();
  },
};

async function restoreSession() {
  const held = kept(SESSION_KEY, null);
  try {
    if (held && held.user) {
      if (await cloud()) {
        const answer = await remote('GET', 'auth/me');
        if (answer.user) signedIn(answer.user, held.token);
        else signedOut();
      } else if (kept(LOCAL_MEMBERS, []).some((one) => one.id === held.user.id)) session.user = held.user;
      else signedOut();
    }
  } catch (error) {
    report('app.auth', error);
  } finally {
    session.ready = true;
  }
}

// ---------------------------------------------------------------- wiring

let definitions = {};
let componentLoaders = {};

function newScope() {
  return { effects: [], cleanups: [], children: [] };
}

function dispose(scope) {
  for (const child of scope.children) dispose(child);
  for (const one of scope.effects) one.stop();
  for (const cleanup of scope.cleanups) {
    try {
      cleanup();
    } catch (error) {
      report('cleanup', error);
    }
  }
  scope.effects = [];
  scope.cleanups = [];
  scope.children = [];
}

const text = (value) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(toRaw(value)) : String(value));

function setAttribute(el, name, value) {
  if (name === 'value' && 'value' in el) el.value = text(value);
  else if (name === 'checked' && 'checked' in el) el.checked = Boolean(value);
  else if (value === false || value === null || value === undefined) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : text(value));
}

function readField(el) {
  if (el.isContentEditable) return el.innerHTML;
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'radio') return el.checked ? el.value : undefined;
  if (el.type === 'number' || el.type === 'range') return el.value === '' ? null : Number(el.value);
  if (el.tagName === 'SELECT' && el.multiple) return [...el.selectedOptions].map((option) => option.value);
  return el.value;
}

function writeField(el, value) {
  if (el.isContentEditable) {
    if (document.activeElement !== el && el.innerHTML !== text(value)) el.innerHTML = text(value);
  } else if (el.type === 'checkbox') el.checked = Boolean(value);
  else if (el.type === 'radio') el.checked = el.value === text(value);
  else if (el.tagName === 'SELECT' && el.multiple) for (const option of el.options) option.selected = Array.isArray(value) && value.map(String).includes(option.value);
  else if (el.value !== text(value)) el.value = text(value);
}

function runHandler(def, index, event, el, locals) {
  try {
    const result = def.on[index][1](event, el, state, app, fn, locals);
    if (result && typeof result.catch === 'function') result.catch((error) => report(`${def.name} ${def.on[index][0]}`, error));
  } catch (error) {
    report(`${def.name} ${def.on[index][0]}`, error);
  }
}

const mounts = [];

function wireHandlers(el, def, locals, scope) {
  def.on.forEach(([event], index) => {
    if (event === 'mount') mounts.push(() => runHandler(def, index, { type: 'mount' }, el, locals));
    else if (event === 'frame') {
      let last = performance.now();
      let id = 0;
      const tick = (time) => {
        runHandler(def, index, { type: 'frame', time, dt: Math.min(0.1, (time - last) / 1000) }, el, locals);
        last = time;
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      scope.cleanups.push(() => cancelAnimationFrame(id));
    } else if (event.startsWith('every:')) {
      const id = setInterval(() => runHandler(def, index, { type: event }, el, locals), Number(event.slice(6)));
      scope.cleanups.push(() => clearInterval(id));
    } else {
      const at = event.indexOf(':');
      const target = at < 0 ? el : event.slice(0, at) === 'window' ? window : document;
      const name = at < 0 ? event : event.slice(at + 1);
      const listener = (domEvent) => {
        if (name === 'submit') domEvent.preventDefault();
        runHandler(def, index, domEvent, el, locals);
      };
      target.addEventListener(name, listener);
      scope.cleanups.push(() => target.removeEventListener(name, listener));
    }
  });
}

async function mountComponent(el, def, locals, scope) {
  const name = def.component;
  const props = reactive({});
  for (const [key, read] of Object.entries(def.props || {})) effect(() => (props[key] = read(state, app, fn, locals)), scope);
  let instance = null;
  let alive = true;
  scope.cleanups.push(() => {
    alive = false;
    if (instance && typeof instance.destroy === 'function') instance.destroy();
  });
  try {
    const loader = componentLoaders[name];
    if (loader === undefined) throw new Error(`no code component named ${name}`);
    const module = await loader();
    if (!alive) return;
    const made = module.default ?? module;
    const mount = typeof made === 'function' ? made : made.mount;
    if (typeof mount !== 'function') throw new Error(`${name} exports no mount(el, props, ctx) function`);
    const ctx = {
      state,
      app,
      fn,
      props,
      el,
      emit(event, detail) {
        el.dispatchEvent(new CustomEvent(event, { detail }));
      },
      effect(run) {
        return effect(run, scope);
      },
      onCleanup(cleanup) {
        scope.cleanups.push(cleanup);
      },
    };
    instance = mount(el, props, ctx) || null;
    if (instance && typeof instance.update === 'function') {
      let first = true;
      effect(() => {
        for (const key of Object.keys(props)) void props[key];
        if (first) first = false;
        else untracked(() => instance.update(props));
      }, scope);
    }
  } catch (error) {
    report(`component ${name}`, error);
  }
}

function wireElement(el, def, locals, scope) {
  if (def.text) effect(() => (el.textContent = text(def.text(state, app, fn, locals))), scope);
  if (def.html) effect(() => (el.innerHTML = text(def.html(state, app, fn, locals))), scope);
  if (def.show) {
    effect(() => {
      if (def.show(state, app, fn, locals)) el.style.removeProperty('display');
      else el.style.setProperty('display', 'none', 'important');
    }, scope);
  }
  for (const [name, read] of def.attrs || []) effect(() => setAttribute(el, name, read(state, app, fn, locals)), scope);
  for (const [name, read] of def.classes || []) effect(() => el.classList.toggle(name, Boolean(read(state, app, fn, locals))), scope);
  for (const [name, read] of def.styles || []) {
    effect(() => {
      const value = read(state, app, fn, locals);
      if (value === null || value === undefined || value === false || value === '') el.style.removeProperty(name);
      else el.style.setProperty(name, typeof value === 'number' && !name.startsWith('--') && !/^(opacity|z-index|flex-grow|flex-shrink|order|font-weight|line-height|scale)$/.test(name) ? `${value}px` : String(value));
    }, scope);
  }
  if (def.model) {
    const [read, write] = def.model;
    effect(() => writeField(el, read(state, app, fn, locals)), scope);
    const event = el.isContentEditable || (el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'radio') ? 'input' : 'change';
    const listener = () => {
      const value = readField(el);
      if (value === undefined) return;
      try {
        write(state, locals, value);
      } catch (error) {
        report(`${def.name} model`, error);
      }
    };
    el.addEventListener(event, listener);
    scope.cleanups.push(() => el.removeEventListener(event, listener));
  }
  if (def.on) wireHandlers(el, def, locals, scope);
  if (def.component) void mountComponent(el, def, locals, scope);
}

function wireRepeat(el, def, locals, scope) {
  const anchor = document.createComment(` ${def.name} `);
  el.replaceWith(anchor);
  const template = el;
  let rows = [];
  effect(() => {
    let list = def.each(state, app, fn, locals);
    if (typeof list === 'number') list = Array.from({ length: Math.max(0, Math.floor(list)) }, (_, i) => i + 1);
    else if (list && !Array.isArray(list) && typeof list === 'object') list = Object.entries(list).map(([key, value]) => ({ key, value }));
    const items = Array.isArray(list) ? list : [];
    // the list's length and each place are read here, so adding, removing or replacing an item redraws the list
    for (let i = 0; i < items.length; i += 1) void items[i];
    untracked(() => {
      const byKey = new Map();
      if (def.key) for (const row of rows) byKey.set(row.key, row);
      const next = items.map((item, index) => {
        const own = reactive({ ...locals, [def.as]: item, index });
        let key = index;
        if (def.key) {
          try {
            key = def.key(state, app, fn, own);
          } catch (error) {
            report(`${def.name} key`, error);
          }
        }
        const kept = def.key ? byKey.get(key) : undefined;
        if (kept !== undefined) {
          byKey.delete(key);
          kept.locals[def.as] = item;
          kept.locals.index = index;
          return kept;
        }
        const clone = template.cloneNode(true);
        const child = newScope();
        scope.children.push(child);
        wireTree(clone, own, child, true);
        return { key, node: clone, scope: child, locals: own };
      });
      const keep = new Set(next);
      for (const row of rows) {
        if (keep.has(row)) continue;
        dispose(row.scope);
        row.node.remove();
      }
      let after = anchor;
      for (const row of next) {
        if (after.nextSibling !== row.node) after.after(row.node);
        after = row.node;
      }
      rows = next;
    });
  }, scope);
}

function wireTree(el, locals, scope, cloned = false) {
  const id = el.getAttribute && el.getAttribute('data-app');
  const def = id ? definitions[id] : undefined;
  if (def !== undefined) {
    if (def.each && !cloned) return wireRepeat(el, def, locals, scope);
    wireElement(el, def, locals, scope);
  }
  for (const child of [...el.children]) wireTree(child, locals, scope);
}

// Starts the application: the variables (with the ones kept in this browser), the scripts, the code components and
// every element's logic, then each element's mount handlers.
export async function start(config) {
  definitions = config.nodes || {};
  componentLoaders = config.components || {};
  app.data = config.data || {};
  tables = config.tables || [];
  const sessionChecked = restoreSession();
  for (const variable of config.variables || []) {
    const kept = variable.persist ? app.store.get(`state.${variable.name}`, MISSING) : MISSING;
    state[variable.name] = kept === MISSING ? structuredClone(variable.initial) : kept;
    if (variable.persist) effect(() => app.store.set(`state.${variable.name}`, JSON.parse(JSON.stringify(state[variable.name] ?? null))));
  }
  for (const [name, load] of Object.entries(config.scripts || {})) {
    try {
      const module = await load();
      fn[name] = module;
      for (const [key, value] of Object.entries(module)) if (key !== 'default') fn[key] = value;
    } catch (error) {
      report(`script ${name}`, error);
    }
  }
  await sessionChecked;
  const root = newScope();
  if (document.readyState === 'loading') await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  wireTree(document.documentElement, {}, root);
  for (const mount of mounts.splice(0)) mount();
  document.documentElement.setAttribute('data-app-ready', '');
  document.dispatchEvent(new CustomEvent('app:ready'));
}
