import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// the feature table first: it installs itself in the core's registry, which modules of the editor read as they load
import './app/features.ts';
import './ui/tokens.css';
import './editor/shell/shell.css';
import './editor/shell/window.css';
import './editor/shell/primitives.css';
import './editor/shell/menus.css';
import './editor/shell/top-bar.css';
import './editor/shell/sidebar.css';
import './editor/shell/canvas.css';
import './editor/shell/inspector.css';
import './editor/shell/panels.css';
import './editor/shell/dock.css';
import './editor/shell/status-bar.css';
import './editor/shell/panel-editors.css';
import './editor/shell/canvas-editing.css';
import './editor/shell/window-overlays.css';
import sprite from './ui/icons.svg?raw';
import { App } from './editor/app.tsx';
import { windowIsNarrow } from './editor/workspace/narrow.ts';
import { currentWorkRevision, readSavedWork, readVersions, restoredWork, startAutosave, type SavedWork } from './editor/persistence/autosave.ts';
import { claimEditing, isEditing, lockProject } from './editor/persistence/tab-guard.ts';
import { cloudProjectId, openCloud, startCloudSave, type CloudProject } from './editor/cloud/cloud.ts';
import { startDrafts } from './editor/persistence/drafts.ts';
import { MODEL_RULES, createEditorStore } from './editor/store.ts';
import { installTestPort } from './editor/test-port.ts';
import { fetchTestBoot, noteStoredAtStart, runDrawnTestBoot, runTestBoot } from './editor/test-boot.ts';
import { installErrorFeed } from './editor/errors.ts';
import { reportError } from './core/incidents.ts';
import { installBrowserPorts } from './core/ports/browser.ts';
import { browserPorts } from './editor/browser-ports.ts';
import { installWiring } from './editor/wiring.ts';
import { EDITOR_WIRING } from './app/wiring.ts';
import { browserLocale } from './editor/preferences/preferences.ts';
import { translate } from './i18n/index.ts';

// the cloud project's document as the autosave's record, or null for a project created empty
function cloudWork(project: CloudProject): SavedWork | null {
  const document = project.document as { version?: unknown } | null;
  if (document === null || typeof document !== 'object') return null;
  return { revision: 0, format: typeof document.version === 'number' ? document.version : 0, document, selection: [] };
}

// the page in place of the editor when a cloud project cannot be opened, with the way back to the dashboard: the
// person reads why in their language; the technical detail goes to the thrown error (console and incident feed)
function stopWith(why: 'cloud.open.unavailable' | 'cloud.open.unreadable', detail: string): never {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'cloud-failure';
    const title = document.createElement('h1');
    // the editor's preferences are not read yet: the browser's language chooses the words
    const locale = browserLocale(navigator.languages);
    title.textContent = translate(locale, 'cloud.open.failed');
    const reason = document.createElement('p');
    reason.textContent = translate(locale, why);
    const back = document.createElement('a');
    back.href = '/painel/';
    back.textContent = translate(locale, 'cloud.open.back');
    box.append(title, reason, back);
    root.append(box);
  }
  throw new Error(`cloud: ${detail}`);
}

// in the test builds, what the page's storage held before the editor's first statement (src/editor/test-boot.ts)
if (__BUILDER_TEST_PORT__) noteStoredAtStart();

// the browser's readers behind the core's ports (src/core/ports/browser.ts), before anything reads markup or images
installBrowserPorts(browserPorts);
// the command table and the installed modules' editor side, handed to the editor (src/editor/wiring.ts)
installWiring(EDITOR_WIRING);

const container = document.getElementById('root');
if (!container) {
  throw new Error('The #root element is missing from index.html.');
}

// The icon sprite (src/ui/icons.svg, generated from the icons the manifest names), once in the page, so every
// <use href="#name"> finds its symbol.
const icons = document.createElement('div');
icons.hidden = true;
icons.innerHTML = sprite;
document.body.prepend(icons);

// the work kept from the last session (autosave-restore), restored before anything is drawn; then every change is
// written again
// the editing lock first: a tab that opens while another edits only reads (multi-tab-guard)
// a project kept in the cloud (opened from the dashboard with ?project=) is read from there and saved there instead
// (src/editor/cloud/cloud.ts); one that cannot be read stops here, so an empty project never overwrites it
const cloudId = cloudProjectId();
if (cloudId !== null) lockProject(cloudId);
let cloud: CloudProject | null = null;
try {
  cloud = await openCloud();
} catch (error) {
  stopWith('cloud.open.unavailable', error instanceof Error ? error.message : String(error));
}
await claimEditing();
const saved = cloud === null ? await readSavedWork() : cloudWork(cloud);
const restored = restoredWork(saved, MODEL_RULES);
if (cloud !== null && saved !== null && restored === null) stopWith('cloud.open.unreadable', 'the saved document could not be read');
// saved work the reader refused: the recovery dialog offers the versions IndexedDB keeps (autosave-corruption-recovery)
const recovery = cloud === null && saved !== null && restored === null ? await readVersions() : null;
const store = createEditorStore({ restored, recovery, narrow: windowIsNarrow() });
if (cloud === null) startAutosave(store, saved, restored !== null, isEditing);
else startCloudSave(store, isEditing);
startDrafts(store, currentWorkRevision, isEditing);
// what the end-to-end tests read, and the state a test hands the editor before it starts (src/editor/test-boot.ts): in
// the dev server and the e2e build only, never in the build a person uses (Vite replaces the flag statically, so that
// build drops both; vite.config.ts fails a build that still carries the port)
const boot = __BUILDER_TEST_PORT__ ? await fetchTestBoot() : null;
const booted = boot === null ? [] : runTestBoot(store, boot);
if (__BUILDER_TEST_PORT__) installTestPort(store, booted);

// what the page throws, into the incident feed: the status bar draws the count, the test port carries the list
// (src/editor/errors.ts, the plan's T2)
installErrorFeed();
createRoot(container, {
  // a render error is an incident too: React would otherwise unmount silently
  onUncaughtError: (error: unknown) => reportError('React could not render', error instanceof Error ? (error.stack ?? error.message) : String(error)),
}).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
// the test boot's commands that read what the editor draws, once it is drawn
if (__BUILDER_TEST_PORT__ && boot !== null) runDrawnTestBoot(store, boot, booted);
