// The project file: what File › Save project writes and File › Open reads: project.zip, or a bare
// project.json, the format of the scenario fixtures (manifest/features/fixtures/): the document JSON of model.ts,
// with its format version. A file that is not a document the model accepts, or whose version this app cannot read, is
// refused with the reason, and the current document stays as it was. `readProject` is the one reader of a project
// document: File › Open and the autosaved work restored at start (src/editor/persistence/autosave.ts) both load
// through it.
import { message, registerHandler, type Message } from '../commands/registry.ts';
import { isEmptyProject, type DocumentJson } from '../document/model.ts';
import { migrateDocument } from '../document/migrations.ts';
import { MAX_DOCUMENT_NESTING, MAX_TREE_DEPTH, nestsDeeperThan } from '../document/shape.ts';
import { validateDocument, type ModelRules } from '../document/validate.ts';
import { ARCHIVE_LIMITS, ArchiveError, archiveReason, isZip, unzip, zip, type ArchiveLimits } from './zip.ts';

// the reason a file is refused, always words of the catalogue: a text of its own (an error's, the validator's prose)
// would reach the person in English whatever the interface's language (DCS-003, DEF-0549)
const invalid = (reason: Message): { readonly refused: Message } => ({ refused: message('status.open.invalidArchive', { reason }) });

// A project document read from its parsed JSON: the document when the model accepts it at this app's format
// version, else the refusal naming why (a newer version, or what is wrong with it). A file of an older version is
// carried forward first (document/migrations.ts, the one owner of the format's versions).
export function readProject(parsed: unknown, rules: ModelRules): { readonly document: DocumentJson } | { readonly refused: Message } {
  // a document deeper than any page is refused before anything walks it by recursion (DEF-0543)
  if (nestsDeeperThan(parsed, MAX_DOCUMENT_NESTING)) return invalid(message('status.open.tooDeep', { depth: MAX_TREE_DEPTH }));
  const migrated = migrateDocument(parsed);
  if (!migrated.ok) {
    if (migrated.reason === 'newer') return { refused: message('status.open.newerVersion', { version: migrated.version ?? 0 }) };
    if (migrated.reason === 'no-step') return invalid(message('status.open.noMigration', { version: migrated.version }));
    return invalid(message('status.open.notADocument'));
  }
  const document = migrated.document as DocumentJson;
  if (!Array.isArray(document.pages)) return invalid(message('status.open.notADocument'));
  const first = validateDocument(document, [], rules)[0];
  // where the document is not valid: its path (a technical name, DCS-003), the validator's own words staying out
  if (first !== undefined) return invalid(message('status.open.invalidDocument', { path: first.path }));
  return { document };
}

// File › Save project (spec project-save-json): one archive, project.zip, holding project.json, the document alone
// as the editor holds it (its format version, its pages and the files the project stores, which the document carries
// itself with their bytes; pretty-printed). The save time is only the entries' modification time,
// from the clock port, so the same document saved twice gives the same project.json. Nothing in the document or the
// history changes.
const PROJECT_ARCHIVE = 'project.zip';
const PROJECT_DOCUMENT = 'project.json';
// The one bound of a project file (CORE-2): File › Open reads project.zip within these limits, and File › Save project
// writes nothing it would refuse. The archive stores project.json as it is (ratio 1), so the bound that binds is the
// size of project.json itself: a project above it is refused at the save, in words, instead of being written as a
// file the app that wrote it could never open again.
export const PROJECT_FILE_LIMITS: ArchiveLimits = ARCHIVE_LIMITS;
const PROJECT_FILE_BYTES = Math.min(PROJECT_FILE_LIMITS.entryBytes, PROJECT_FILE_LIMITS.totalBytes);
const MEGABYTE = 1024 * 1024;

// project.json's bytes, as File › Save project writes them
export const projectDocumentBytes = (document: DocumentJson): Uint8Array => new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);

// A project above the one bound: its size and the bound, in whole megabytes, for the words that refuse it; null for a
// project within it. File › Save project and the cloud save (src/editor/cloud/cloud.ts) both ask here.
export function projectOverLimit(bytes: number): { readonly megabytes: number; readonly limit: number } | null {
  return bytes > PROJECT_FILE_BYTES ? { megabytes: Math.ceil(bytes / MEGABYTE), limit: Math.floor(PROJECT_FILE_BYTES / MEGABYTE) } : null;
}

export const saveProject = registerHandler('project.save', ({ state, clock }) => {
  const document = projectDocumentBytes(state.document);
  const over = projectOverLimit(document.length);
  if (over !== null) return { kind: 'refused' as const, message: message('status.project.tooLarge', over) };
  const bytes = zip([{ path: PROJECT_DOCUMENT, bytes: document }], clock.now());
  return { kind: 'change' as const, message: message('status.project.saved', { file: PROJECT_ARCHIVE }), download: { name: PROJECT_ARCHIVE, type: 'application/zip', bytes } };
});

// The text of project.json in a chosen file (spec project-open-json, Problems in Pager 2): the archive's
// project.json, or the file's own text for a bare project.json. An archive that cannot be read, or holds no
// project.json, gives a text the project reader refuses, naming why (one of the archive reader's reasons).
export async function projectFileText(bytes: Uint8Array): Promise<string> {
  if (!isZip(bytes)) return new TextDecoder().decode(bytes);
  try {
    const document = (await unzip(bytes, PROJECT_FILE_LIMITS)).get(PROJECT_DOCUMENT);
    return document === undefined ? JSON.stringify({ archive: message('archive.noDocument', { file: PROJECT_DOCUMENT }) }) : new TextDecoder().decode(document);
  } catch (error) {
    return JSON.stringify({ archive: error instanceof ArchiveError ? error.reason : message('archive.broken') });
  }
}

// File › Open project (spec project-open-json): the chosen file's project.json is read and checked first, so a file
// the model refuses, or of a newer format, never asks anything; a valid project replaces a document that holds work
// only once the person confirms (outcome `confirm`, the manifest's confirmation), and the empty project at once. The
// selection and the history start empty (outcome `load`), and autosave writes the opened project.
export const openProject = registerHandler('project.open', ({ rules, state, confirmed }, args) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.file);
  } catch {
    // the parser's own words are the browser's, in its language: the reason is said in the interface's
    return { kind: 'refused' as const, message: invalid(message('status.open.notJson')).refused };
  }
  // an archive the reader refused (projectFileText): its reason, read back only when it is one of the reader's
  const unread = parsed !== null && typeof parsed === 'object' && 'archive' in parsed ? archiveReason((parsed as { archive: unknown }).archive) : null;
  if (unread !== null) return { kind: 'refused' as const, message: invalid(unread).refused };
  const read = readProject(parsed, rules);
  if ('refused' in read) return { kind: 'refused' as const, message: read.refused };
  if (confirmed !== true && !isEmptyProject(state.document)) return { kind: 'confirm' as const };
  return { kind: 'load' as const, document: read.document, message: message('status.open.opened') };
});
