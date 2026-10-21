// The editor store binding: creates the one store with the command table, the manifest's commands
// and rules, the ports and the editor state, and exposes it to React. Components read state through
// useEditorState and change it only through dispatch; no document, selection or editor state lives in useState.
import { createContext, useContext, useSyncExternalStore } from 'react';
import { message } from '../core/commands/registry.ts';
import { isEditing, takeOver } from './persistence/tab-guard.ts';
import { activeLayer, styleStateFollows } from './view/style-state.ts';
import { createEmptyDocument, type DocumentJson, type Selection } from '../core/document/model.ts';
import { rulesFromManifest, type ModelRules } from '../core/document/validate.ts';
import { rulesForDocument } from '../core/document/breakpoints.ts';
import { systemClock, type Clock } from '../core/ports/clock.ts';
import { randomIds, type IdGenerator } from '../core/ports/ids.ts';
import { createStore, type DispatchResult, type EditContext, type Gesture, type Store, type StoreState } from '../core/store/store.ts';
import type { CommandId, ConstantId } from '../generated/ids.ts';
import { translate } from '../i18n/index.ts';
import { manifest } from '../manifest/runtime.ts';
import { pageLayout } from './canvas/coordinates.ts';
import { browserClipboard } from './clipboard.ts';
import { browserCss } from './css-support.ts';
import { browserDownloads } from './download.ts';
import type { ClipboardWriter } from '../core/ports/clipboard.ts';
import type { CssSupport } from '../core/ports/css.ts';
import type { Downloads } from '../core/ports/download.ts';
import type { Layout } from '../core/ports/layout.ts';
import { endOffSelection, endOnUndoable } from './canvas/text-edit.ts';
import { endRenameOffSelection, endRenameOnUndoable } from './layers/rename.ts';
import { revealSelection } from './layers/tree.ts';
import { pageFollowsSelection } from './project/page-follows.ts';
import { targetFollowsClassRename, targetOffSelection } from './inspector/style-target.ts';
import { keyframeTarget } from './timeline/playhead.ts';
import { motionContext } from './motion/state.ts';
import { browserStorage, loadPreferences, persistPreferences, type PreferenceStorage } from './preferences/preferences.ts';
import { browserWorkspace, persistWorkspace, readWorkspace, type WorkspaceStorage } from './workspace/persist.ts';
import { initialEditorUi, type EditorUi } from './state.ts';
import { siteScripts } from './forms/script.ts';
import { deriveData } from '../core/data/derive.ts';
import { wiring } from './wiring.ts';
import { beforeCommand, heldTyping, keepsWaitWhile, keepTyping, keepWhatWaited, runOwn } from './input/pending.ts';
import { historyBreaches } from '../core/history/invariants.ts';
import { restoreEditContext } from './view/edit-context.ts';
import { reportError } from '../core/incidents.ts';
import { modeBreaches, modesOf, modesWith } from './input/modes.ts';
import { capturedFollowsSelection } from './capture/selection.ts';
import { releaseObjectUrls } from '../core/files/files.ts';

export type EditorStore = Store<EditorUi>;
export type EditorState = StoreState<EditorUi>;

export interface EditorStoreOptions {
  readonly storage?: PreferenceStorage;
  // where the panels and the layout are kept (src/editor/workspace/persist.ts); the browser's storage by default
  readonly workspace?: WorkspaceStorage;
  // the window is narrow at the start (workspace/narrow.ts): a first visit opens with the sidebar closed, which opens
  // over the canvas when asked; a workspace the person kept keeps its own
  readonly narrow?: boolean;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  // the work autosave restored (src/editor/persistence/autosave.ts), or none: the empty project; `recovered` when it
  // came back from the journal of a session that ended before IndexedDB held it (spec autosave-crash-recovery)
  readonly restored?: { readonly document: DocumentJson; readonly selection: Selection; readonly recovered?: boolean } | null;
  // the saved versions, when the saved work could not be read: the recovery dialog opens with them (spec
  // autosave-corruption-recovery), and project.restoreVersion reads their documents
  readonly recovery?: readonly { readonly revision: number; readonly time: number; readonly document: unknown }[] | null;
  // the ports to the page and the browser, the editor's own by default: a run outside a browser (the scenarios' fast
  // runner, tools/runner/headless.test.ts) hands its own — no layout, every CSS value taken, nothing downloaded
  readonly ports?: { readonly layout?: Layout; readonly css?: CssSupport; readonly downloads?: Downloads; readonly clipboard?: ClipboardWriter; readonly readOnly?: () => boolean };
  // deep-freeze every committed state: development's default, and tests
  readonly freeze?: boolean;
}

// the model every document must satisfy, from the manifest
export const MODEL_RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);

// the editor state that opens the recovery dialog with the saved versions, when there are some to offer or none
function recoveryUi(ui: EditorUi, recovery: EditorStoreOptions['recovery']): EditorUi {
  if (recovery === null || recovery === undefined) return ui;
  return { ...ui, dialog: 'recovery', recovery: recovery.map((v) => ({ revision: v.revision, time: v.time })) };
}

// The model rules whose layer (rules.base) is the one the editor edits: the active breakpoint and style state (spec
// breakpoint-overrides, state-styles), for the readers of the editor (the fields, the handles), as the store hands
// them to handlers. One object per layer, so a reader that compares what it read sees no change.
// The project's own breakpoints (core/document/breakpoints.ts) are part of those rules: one object per table and layer.
const layeredByKey = new WeakMap<ModelRules, Map<string, ModelRules>>();
export function layeredRules(shown: { readonly document: DocumentJson; readonly ui: EditorUi }): ModelRules {
  const project = rulesForDocument(MODEL_RULES, shown.document);
  const layer = activeLayer(shown);
  if (layer.breakpoint === project.base.breakpoint && layer.state === project.base.state) return project;
  let byLayer = layeredByKey.get(project);
  if (byLayer === undefined) {
    byLayer = new Map();
    layeredByKey.set(project, byLayer);
  }
  const key = `${layer.breakpoint}|${layer.state}`;
  let rules = byLayer.get(key);
  if (rules === undefined) {
    rules = { ...project, base: layer };
    byLayer.set(key, rules);
  }
  return rules;
}

// The context an edit begins in (CLAUDE.md, rule G1): the layer the editor writes into (the breakpoint and the state),
// the class the Style tab targets and the keyframe the playhead sits on. A field takes it when typing begins and keeps
// its value there, whatever the editor shows by the time the value is kept.
export function editContextOf(state: EditorState): EditContext {
  return { layer: activeLayer(state), styleClass: state.ui.styleTarget ?? null, keyframe: keyframeTarget(state) };
}
// What a field shows its value for: the elements selected, and the context an edit begins in (also what a door whose
// read arrives later takes when its input comes, input/after-read.ts).
export const editedKey = (state: EditorState): string => JSON.stringify([state.selection, editContextOf(state)]);

export function createEditorStore(options: EditorStoreOptions = {}): EditorStore {
  const storage = options.storage ?? browserStorage;
  const ids = options.ids ?? randomIds;
  const preferences = loadPreferences(storage);
  const workspace = readWorkspace(options.workspace ?? browserWorkspace);
  const rules = MODEL_RULES;
  const rootLabel = manifest.elements.elements.find((e) => e.id === rules.root.type)?.labelKey ?? 'element.page.label';
  // the restored work, else the empty project, whose names are the words of the person who creates it
  const document =
    options.restored?.document ?? createEmptyDocument(ids, { language: preferences.locale, page: translate(preferences.locale, 'pages.defaultHome'), root: translate(preferences.locale, rootLabel as 'element.page.label') }, rules.root);
  const store = createStore<EditorUi>({
    table: wiring().commands,
    predicates: wiring().predicates,
    commands: new Map(manifest.commands.map((c) => [c.id as CommandId, c])),
    constants: new Map(manifest.interactions.constants.map((c) => [c.id as ConstantId, c.value])),
    rules,
    siteScripts,
    clock: options.clock ?? systemClock,
    ids,
    words: (ui, key, params) => translate(ui.preferences.locale, key, params),
    language: ui => ui.preferences.locale,
    layout: options.ports?.layout ?? pageLayout,
    downloads: options.ports?.downloads ?? browserDownloads,
    clipboard: options.ports?.clipboard ?? browserClipboard,
    css: options.ports?.css ?? browserCss,
    // the class the Style tab targets, whose styles the style writes go to (inspector/style-target.ts)
    styleClass: (ui) => ui.styleTarget ?? null,
    // the keyframe the playhead sits on, whose declarations a style write goes to (timeline/playhead.ts)
    keyframe: keyframeTarget,
    // the content bound to collections and the shared regions follow every change, in its transaction (spec
    // content-data)
    derive: (before, after, context) => deriveData(before, after, context),
    // the motion Timeline's playhead and recording, which the motion commands read (motion/state.ts)
    motion: motionContext,
    version: (revision) => options.recovery?.find((v) => String(v.revision) === revision)?.document,
    readOnly: options.ports?.readOnly ?? (() => !isEditing()),
    layer: activeLayer,
    editing: { takeOver },
    initial: { document, selection: options.restored?.selection ?? [], ui: recoveryUi(narrowStart(initialEditorUi(preferences, workspace), workspace === undefined && options.narrow === true), options.recovery ?? null), message: options.restored?.recovered === true ? message('status.save.recovered') : null },
    freeze: options.freeze ?? import.meta.env.DEV,
    // an undo and a redo give back the breakpoint, state, class and keyframe the change was made in (DCS-009)
    restoreContext: restoreEditContext,
    // the rules of the history at every publication, in development and tests (the build a person uses drops them)
    ...(import.meta.env.DEV ? { invariants: historyBreaches } : {}),
    // the page of a selected node opens (an undo on another page); Layers unfolds what hides a selected node; a text
    // edit and a rename end once their node is not the selection
    // alone, and when an undoable command runs
    followSelection: (state) => {
      // a captured element's selection goes with any other selection, or with the document that held it (DEF-0542)
      const captured = { ...state, ui: capturedFollowsSelection(state) };
      const opened = { ...captured, ui: pageFollowsSelection(captured) };
      const revealed = { ...opened, ui: targetOffSelection({ ...opened, ui: revealSelection(opened) }) };
      // the style state goes back to Base when the selection holds an element it does not stand on (AUD-03)
      return styleStateFollows({ ...revealed, ui: endRenameOffSelection({ ...revealed, ui: endOffSelection(revealed) }) });
    },
    followCommand: (state, command, args) => {
      const followed = { ...state, ui: targetFollowsClassRename(state, command, args) };
      return styleStateFollows({ ...followed, ui: endRenameOnUndoable({ ...followed, ui: endOnUndoable(followed, command) }, command) });
    },
  });
  persistPreferences(store, storage);
  persistWorkspace(store, options.workspace ?? browserWorkspace);
  releaseUnheldFiles(store);
  return gestureSafe(store);
}

// The object URLs of the project's files (core/files/files.ts objectUrl) live while the document the editor shows holds
// their content: once its files change, a content none of them holds any more (a file deleted, its bytes replaced, the
// project replaced) is released, so the tab's memory does not keep every image the session ever showed (CORE-6).
function releaseUnheldFiles(store: Store<EditorUi>): void {
  let files = store.getState().document.files;
  store.subscribe(() => {
    const now = store.getState().document.files;
    if (now === files) return;
    files = now;
    releaseObjectUrls(now ?? []);
  });
}

// The store the editor hands its parts: the one way every command of the editor runs (a door, a key, a gesture, a
// timer), so what must hold around any command holds here (CLAUDE.md, rule G2; input/pending.ts): the typing a field
// holds and has not kept is kept before a command that changes the document or comes from outside the field, the
// field's own commands run in the context the typing began in (rule G1), and a command that leaves the typing held but
// moves what the field edits (another element, breakpoint, state, class or keyframe) keeps it at once, where it was
// typed, before the field shows the other value. Safe too for the moments a part cannot run as it asks (the audit's
// GB1 and AG1): a press while the assistant's turn holds a command group opens a gesture whose document changes are
// refused with the group's busy words (a selection or a view change still runs), never an uncaught error; and a
// dispatch that arrives while a pointer gesture is open (a file read that resolved, the wheel during a drag) runs
// through that gesture when it changes no document, else once the gesture has ended, in order, in the context it was
// asked in.
const UNDOABLE = new Map(manifest.commands.map((c) => [c.id as CommandId, c.history.undoable] as const));
function gestureSafe(store: EditorStore): EditorStore {
  // a keep of the person's typing waits while the assistant's command group holds the editor (DEF-0528)
  keepsWaitWhile(() => store.commandGroupOpen());
  let open: Gesture | null = null;
  const waiting: (() => void)[] = [];
  const settle = () => {
    open = null;
    for (const run of waiting.splice(0)) run();
  };
  // whether a command would open, now, a mode the open gesture refuses (the table of input/modes.ts), read before it
  // runs from the editor state it would leave (Store.uiAfter): such a command waits for the gesture's end, as a change
  // of the document does, so the layer never opens over the gesture (DEF-0555: it opened, and the table only said so)
  const opensRefused = (id: CommandId, args: unknown): boolean => {
    const ui = store.uiAfter(id, args as never);
    return ui !== null && modeBreaches(modesOf(safe), modesWith(safe, ui)).length > 0;
  };
  // a command run inside the open gesture, the gesture's own (its keys, its moves) or one from outside it: the modes
  // it opened are checked again against the table once it ran, a defect if one opened all the same
  const inGesture = (id: CommandId, run: () => DispatchResult): DispatchResult => {
    const before = modesOf(safe);
    const result = run();
    const breaches = modeBreaches(before, modesOf(safe));
    if (breaches.length > 0) refusedMode(id, breaches);
    return result;
  };
  // a command that waits for the open gesture's end, in the context it was asked in
  const afterGesture = (id: CommandId, args: unknown, asked: EditContext | undefined): DispatchResult => {
    waiting.push(() => void store.dispatch(id, args as never, asked));
    return { status: 'done', changed: false };
  };
  const safe: EditorStore = {
    ...store,
    sequence: () => {
      keepTyping();
      return store.sequence();
    },
    // The group's own commands pass the check every dispatch passes: one that moves what a field edits asks its typing
    // kept, which waits for the group's end (input/pending.ts); the end, however it comes (a commit, a cancel, a
    // command that failed and closed the group), runs what waited (DEF-0528).
    commandGroup: (busy) => {
      keepTyping();
      const group = store.commandGroup(busy);
      const ended = () => {
        if (!group.active()) keepWhatWaited();
      };
      return {
        active: () => group.active(),
        dispatch: (id, args) => {
          const edited = heldTyping() === null ? null : editedKey(store.getState());
          try {
            const result = group.dispatch(id, args);
            if (edited !== null && heldTyping() !== null && editedKey(store.getState()) !== edited) keepTyping();
            return result;
          } finally {
            ended();
          }
        },
        commit: () => {
          try {
            group.commit();
          } finally {
            ended();
          }
        },
        cancel: () => {
          group.cancel();
          ended();
        },
      };
    },
    answer: (confirmed) => {
      keepTyping();
      return store.answer(confirmed);
    },
    gesture: () => {
      keepTyping();
      if (store.commandGroupOpen()) return { dispatch: (id, args) => store.dispatch(id, args), commit: () => undefined, cancel: () => undefined };
      const gesture = store.gesture();
      open = gesture;
      return {
        // the gesture's own moves change the document at every pointer move and open no layer: only a command that
        // changes no document is read before it runs
        dispatch: (id, args) => (UNDOABLE.get(id) !== true && opensRefused(id, args) ? afterGesture(id, args, undefined) : inGesture(id, () => gesture.dispatch(id, args))),
        commit: () => {
          gesture.commit();
          settle();
        },
        cancel: () => {
          gesture.cancel();
          settle();
        },
      };
    },
    dispatch: (id, args, context) => {
      const changesDocument = UNDOABLE.get(id) === true;
      // the field's own command keeps or cancels its typing itself (input/pending.ts): what it moves (a new animation
      // puts a keyframe under the playhead) never keeps the typing again, which ran the command twice (DEF-0535)
      const own = heldTyping()?.owns(id, (args ?? {}) as Readonly<Record<string, unknown>>) === true;
      const at = context ?? beforeCommand(id, args, changesDocument);
      const edited = heldTyping() === null || own ? null : editedKey(store.getState());
      let result: DispatchResult;
      // the field's own command says the field's own word (input/pending.ts runOwn; DEF-0565)
      const running = (run: () => DispatchResult): DispatchResult => (own ? runOwn(run) : run());
      if (open === null) result = running(() => store.dispatch(id, args, at));
      else if (!changesDocument && !opensRefused(id, args)) {
        const gesture = open;
        result = running(() => inGesture(id, () => gesture.dispatch(id, args)));
      } else result = afterGesture(id, args, at ?? editContextOf(store.getState()));
      if (edited !== null && heldTyping() !== null && editedKey(store.getState()) !== edited) keepTyping();
      return result;
    },
  };
  return safe;
}

// A mode the table refuses opened: in development and tests an error, as the store's own rules are; in the build a
// person uses, an incident in the feed the status bar draws.
function refusedMode(id: CommandId, breaches: readonly string[]): void {
  const what = `${id} opened a mode the open gesture refuses: ${breaches.join('; ')}`;
  if (import.meta.env.DEV) throw new Error(what);
  reportError('a command opened a mode the open gesture refuses', what);
}

// a first visit in a narrow window opens with the sidebar closed (workspace/narrow.ts)
const narrowStart = (ui: EditorUi, narrow: boolean): EditorUi => (narrow ? { ...ui, panels: { ...ui.panels, sidebar: false } } : ui);

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('the editor store is missing: render inside <StoreContext.Provider>');
  return store;
}

// Reads a part of the state and re-renders when it changes (select returns the same reference while unchanged).
export function useEditorState<T>(select: (state: EditorState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
