// The tab guard (spec multi-tab-guard): one tab edits the project at a time. The first tab to open
// holds the editing lock (the browser's Web Locks, one lock for the project) for its life and edits; a tab that opens
// while another holds it is read-only (it writes nothing, the store refuses its document commands). Take over editing
// steals the lock and starts this tab again on the latest saved project; the tab it was taken from, its lock gone,
// becomes read-only at once ("lost"). A browser without Web Locks edits in every tab, as before.
let LOCK = 'builder-project-editing';
// a project kept in the cloud (src/editor/cloud/cloud.ts) has a lock of its own: two of them edit side by side
export function lockProject(id: string): void {
  LOCK = `builder-project-editing:${id}`;
}

export type TabRole = 'editing' | 'readOnly' | 'lost';
let role: TabRole = 'editing';
const listeners = new Set<() => void>();
// this tab's role, for the store, autosave and the notice. Not editor state: no command changes it.
export const tabRole = {
  get: (): TabRole => role,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
function setRole(next: TabRole) {
  if (next === role) return;
  role = next;
  for (const listener of [...listeners]) listener();
}
export const isEditing = (): boolean => role === 'editing';

// How long a tab that finds the lock held keeps asking before it is read-only: a reloaded tab's previous page lets go
// of the lock a moment after the new one starts (the user's report: "this project is being edited in another tab" after
// reloading the one tab), so a lock held that briefly is no other tab.
const RETRY_EVERY_MS = 100;
const RETRIES = 20;

// Asks for the editing lock at start: held for the page's life when free (asked again for a moment while the page this
// one replaces lets it go), else this tab is read-only; the lock taken by another tab later makes it read-only then.
export function claimEditing(): Promise<void> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return Promise.resolve();
  let tries = 0;
  return new Promise((resolve) => {
    const ask = () => {
      navigator.locks
        .request(LOCK, { ifAvailable: true }, (lock) => {
          if (lock === null) {
            tries += 1;
            if (tries < RETRIES) {
              setTimeout(ask, RETRY_EVERY_MS);
              return undefined;
            }
            setRole('readOnly');
            resolve();
            return undefined;
          }
          setRole('editing');
          resolve();
          return new Promise<void>(() => undefined);
        })
        .catch(() => setRole('lost'));
    };
    ask();
  });
}

// Take over editing: the lock stolen from the tab that holds it, then this tab started again, on the saved project.
export function takeOver(): void {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return;
  void navigator.locks.request(LOCK, { steal: true }, () => {
    window.location.reload();
    return new Promise<void>(() => undefined);
  });
}
