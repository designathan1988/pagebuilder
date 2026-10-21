// The incident feed (the plan's T2): what the application must never hide.
//
//  - 'invariant': a command produced its patches and the whole-document validator still refused the result. That is a
//    bug — a rule the operation should have refused before producing anything — so the state is not published, the
//    incident is recorded here, and in development and tests the commit throws so the defect is loud. Predictable
//    invalid operations are refused by the operation itself, with a message; they never reach this feed.
//  - 'empty-change': a command answered with structural patches that left the document as it was (reportEmptyChange).
//  - 'self-check': a published document breaks a rule of the app the validator does not refuse a file over
//    (reportSelfChecks; core/document/self-checks.ts), in development and tests.
//  - 'error': an error the page threw (a render error, an unhandled rejection): recorded by the editor side, so the
//    person and the browser checks see it instead of a console nobody reads.
//
// A bounded ring (the newest LIMIT), process-wide on purpose: an incident is about the app, not about one document.
// It holds no document state and changes nothing; whoever draws it (the status bar's badge, the checks pane, the test
// port, the dev server's terminal) only reads.
import type { Invalid } from './document/validate.ts';
import type { DocumentJson } from './document/model.ts';
import { documentFindings } from './document/self-checks.ts';

export interface Incident {
  readonly kind: 'invariant' | 'empty-change' | 'self-check' | 'error';
  // one line naming what happened: the command and its source, or where the error came from
  readonly what: string;
  // what the validator or the thrower said, in full
  readonly detail: string;
}

const LIMIT = 50;
let feed: readonly Incident[] = [];
const listeners = new Set<() => void>();

function record(incident: Incident): void {
  feed = [...feed, incident].slice(-LIMIT);
  for (const listener of [...listeners]) listener();
}

// A document the validator refused after a command's patches: a bug, never a normal refusal.
export function reportInvariantBreach(source: string, problems: readonly Invalid[]): void {
  record({ kind: 'invariant', what: `commit "${source}" left a document the model refuses`, detail: problems.map((p) => `${p.path}: ${p.message}`).join('\n') });
}

// A command that answered with structural patches (an addition, a removal, a collection replaced) that left the
// document exactly as it was: it claims a change it did not make (a delete that deleted nothing, a move that moved
// nothing) — a bug the person cannot see, since the status says it happened. Setting a value to the one already held is
// not this:
// only structural patches count.
export function reportEmptyChange(command: string, said: string | null): void {
  record({ kind: 'empty-change', what: `command "${command}" claimed a structural change and the document is unchanged`, detail: said ?? '(no message)' });
}

// The document's self-checks after a publication (core/document/self-checks.ts), in development and tests: each
// finding new to this publication is recorded once, naming the change that made it; a finding the document already
// held is not recorded again at every later change.
let heldFindings: ReadonlySet<string> = new Set();
export function reportSelfChecks(source: string, document: DocumentJson): void {
  const now = new Set(documentFindings(document));
  const fresh = [...now].filter((finding) => !heldFindings.has(finding));
  heldFindings = now;
  if (fresh.length > 0) record({ kind: 'self-check', what: `"${source}" left a document that breaks a rule of the app`, detail: fresh.join('\n') });
}

// An error the page threw, recorded by the editor side.
export function reportError(what: string, detail: string): void {
  record({ kind: 'error', what, detail });
}

export function incidents(): readonly Incident[] {
  return feed;
}

export function clearIncidents(): void {
  feed = [];
  for (const listener of [...listeners]) listener();
}

export function onIncident(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
