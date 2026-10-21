// The code field of the application layer (spec app-logic): an expression, an event's statements or a whole module,
// written in CodeMirror 6 (codemirror.net) — the JavaScript grammar colours it, the parser marks the line that does
// not parse as it is typed, and completion offers what the project holds (state.<variable>, fn.<export>, the app
// helpers, the names of the repeated items) beside the language's own (local names, snippets). Like any field it
// holds its typing in the one registry of typing (input/held-draft.ts; rules G1 and G2) from its first key: a press
// elsewhere, a command from outside the field, a selection changed, the focus leaving it, Ctrl+Enter (Cmd+Enter) or the
// field going keep it, one command each time, with the keep given when the typing began, in the context of that first
// key. The keys typed in it are its own, as a textarea's are the browser's, so none of them runs an editor shortcut but
// Escape, which leaves the field.
import { useEffect, useRef, type ReactNode } from 'react';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript, javascriptLanguage, completionPath } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { linter, type Diagnostic } from '@codemirror/lint';
import { Annotation, Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder as placeholderText } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { CodeKind } from '../../core/logic/compile.ts';
import type { EditContext } from '../../core/store/store.ts';
import type { CommandId } from '../../generated/ids.ts';
import { checkAppSyntax } from '../app-runtime/script.ts';
import { heldDraft, type HeldDraft } from '../input/held-draft.ts';
import { afterGesture } from '../input/pointer.ts';
import { useStore } from '../store.ts';

// What the project offers an expression where it stands: the variables, the functions the scripts export, and the
// names the repeated ancestors give their item.
export interface CodeScope {
  readonly variables: readonly string[];
  readonly functions: readonly string[];
  readonly locals: readonly string[];
  // an event's code also has the event and the element
  readonly event?: boolean;
}

// The helpers of the runtime's `app` (app-runtime/runtime.js), each with what it does.
const APP_HELPERS: readonly Completion[] = [
  { label: 'go', type: 'function', detail: '(page | url | -1)' },
  { label: 'fetch', type: 'function', detail: '(url, options) → JSON | text' },
  { label: 'store', type: 'property', detail: '.get(key, fallback) .set(key, value) .remove(key)' },
  { label: 'toast', type: 'function', detail: '(text, ms)' },
  { label: 'download', type: 'function', detail: '(name, content, type)' },
  { label: 'copy', type: 'function', detail: '(text)' },
  { label: 'pick', type: 'function', detail: "(accept, { as: 'text' | 'dataUrl' })" },
  { label: 'emit', type: 'function', detail: '(name, detail)' },
  { label: 'sleep', type: 'function', detail: '(ms)' },
  { label: 'uid', type: 'function', detail: '()' },
  { label: 'el', type: 'function', detail: '(selector)' },
  { label: 'all', type: 'function', detail: '(selector)' },
  { label: 'plain', type: 'function', detail: '(value)' },
  { label: 'effect', type: 'function', detail: '(fn)' },
  { label: 'reactive', type: 'function', detail: '(value)' },
  { label: 'data', type: 'property', detail: 'collections' },
  { label: 'db', type: 'property', detail: '.list(table, { where, order, limit, mine }) .get .add .update .remove' },
  { label: 'auth', type: 'property', detail: '.user .signup({ email, password, name }) .login .logout()' },
];

// The completions of the project at the cursor: after state. its variables, after fn. its functions, after app. the
// helpers, and at a bare name the roots themselves.
function projectCompletions(scope: () => CodeScope) {
  return (context: CompletionContext): CompletionResult | null => {
    const at = completionPath(context);
    if (at === null) return null;
    const from = context.pos - at.name.length;
    const now = scope();
    const root = at.path.length === 1 ? at.path[0] : null;
    if (root === 'state') return { from, options: now.variables.map((label) => ({ label, type: 'variable' })), validFor: /^[\w$]*$/ };
    if (root === 'fn') return { from, options: now.functions.map((label) => ({ label, type: 'function' })), validFor: /^[\w$]*$/ };
    if (root === 'app') return { from, options: APP_HELPERS, validFor: /^[\w$]*$/ };
    if (at.path.length > 0) return null;
    const roots: Completion[] = [
      { label: 'state', type: 'namespace', detail: 'variables' },
      { label: 'fn', type: 'namespace', detail: 'scripts' },
      { label: 'app', type: 'namespace', detail: 'helpers' },
      ...now.locals.map((label) => ({ label, type: 'variable', detail: 'item' })),
      ...(now.event === true ? [{ label: '$event', type: 'variable' }, { label: '$el', type: 'variable' }] : []),
    ];
    return { from, options: roots, validFor: /^[\w$]*$/ };
  };
}

// The problems of the text: each place the grammar could not read, and, when it reads, the engine's own message (an
// expression that is a statement, an await outside an event).
function problems(kind: CodeKind) {
  return (view: EditorView): Diagnostic[] => {
    const code = view.state.doc.toString();
    if (code.trim() === '') return [];
    const found: Diagnostic[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (!node.type.isError || found.length > 0) return;
        const from = Math.min(node.from, code.length);
        found.push({ from, to: Math.min(Math.max(node.to, from + 1), code.length), severity: 'error', message: checkAppSyntax(kind, code) ?? 'Syntax error' });
      },
    });
    if (found.length > 0) return found;
    const why = checkAppSyntax(kind, code);
    return why === null ? [] : [{ from: 0, to: code.length, severity: 'error', message: why }];
  };
}

// The colours of the code, the editor's own syntax tokens (the code pane's).
const COLOURS = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: 'var(--color-syntax-tag)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--color-syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--color-syntax-attr)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--color-syntax-comment)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.function(tags.propertyName)], color: 'var(--color-syntax-property)' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: 'var(--color-syntax-selector)' },
]);

// What keeps a field's text: the command, with the arguments the field stood for when its typing began, in the
// context of the typing's first key.
export type KeepCode = (text: string, context: EditContext) => void;

// A change the field makes to show the document's text (an undo, a rename, another field): not the person's typing,
// and not a step of the field's own undo history (Ctrl+Z inside the field never brings back a text the document held
// before: the logic audit's LOGIC-4).
const SHOWN = Annotation.define<boolean>();

// The typing the field holds and no command has kept yet: what the field showed when it began, the keep given then,
// and the text typed since.
interface CodeTyping {
  readonly from: string;
  readonly keep: KeepCode;
  text: string;
}

export function CodeEditor({ value, kind, scope, command, onKeep, label, placeholder, disabled = false }: {
  readonly value: string;
  readonly kind: CodeKind;
  readonly scope: CodeScope;
  // the command that keeps the text: the field's own (input/pending.ts), run in the typing's context
  readonly command: CommandId;
  // the text to keep: called when it differs from what the field showed when the typing began
  readonly onKeep: KeepCode;
  readonly label: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}): ReactNode {
  const store = useStore();
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // the latest props, for the editor's callbacks, which are made once
  const latest = useRef({ value, scope, onKeep, label, placeholder, disabled });
  useEffect(() => {
    latest.current = { value, scope, onKeep, label, placeholder, disabled };
  });
  // the typing held, and the keep the registry runs, in the context of the typing's first key (rule G1); the keep is
  // read when it runs, after the field may have gone
  const typing = useRef<CodeTyping | null>(null);
  const keepHeld = useRef<(context: EditContext) => void>((context) => {
    const held = typing.current;
    if (held === null) return;
    typing.current = null;
    if (held.text !== held.from) afterGesture(store, () => held.keep(held.text, context));
  });
  const registry = useRef<HeldDraft | null>(null);
  useEffect(() => {
    const draft = heldDraft(store, content, host, command, keepHeld);
    registry.current = draft;
    return () => {
      draft.left();
      registry.current = null;
    };
  }, [store, command]);
  // the label, the read-only state and the placeholder change in place (the language switched, the door became
  // unavailable): the view is never made again over a typing not kept
  const labelled = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const hinted = useRef(new Compartment());
  useEffect(() => {
    if (host.current === null) return undefined;
    const typed = (text: string) => {
      if (typing.current === null) typing.current = { from: latest.current.value, keep: latest.current.onKeep, text };
      else typing.current.text = text;
      registry.current?.typed();
    };
    const now = latest.current;
    const extensions: Extension[] = [
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      javascript(),
      javascriptLanguage.data.of({ autocomplete: projectCompletions(() => latest.current.scope) }),
      autocompletion({ activateOnTyping: true }),
      syntaxHighlighting(COLOURS),
      linter(problems(kind), { delay: 300 }),
      // Ctrl+Enter keeps the typing through the registry, as leaving the field does
      keymap.of([{ key: 'Mod-Enter', run: () => (registry.current?.left(), true) }, ...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      labelled.current.of(EditorView.contentAttributes.of({ 'aria-label': now.label })),
      // every change the person makes (a key, a paste, the field's own undo) is typing; the field's showing the
      // document's text is not
      EditorView.updateListener.of((update) => {
        if (update.transactions.some((one) => one.docChanged && one.annotation(SHOWN) !== true)) typed(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        blur: () => void registry.current?.left(),
        // the field's keys are its own (the header's note); Escape leaves it for the editor
        keydown: (event, target) => {
          if (event.key === 'Escape' && !target.dom.querySelector('.cm-tooltip-autocomplete')) {
            target.contentDOM.blur();
            return false;
          }
          event.stopPropagation();
          return false;
        },
      }),
      editable.current.of(editability(now.disabled)),
      hinted.current.of(now.placeholder === undefined ? [] : placeholderText(now.placeholder)),
    ];
    if (kind === 'module') extensions.push(lineNumbers());
    const made = new EditorView({ parent: host.current, state: EditorState.create({ doc: now.value, extensions }) });
    view.current = made;
    content.current = made.contentDOM;
    return () => {
      made.destroy();
      view.current = null;
    };
  }, [kind]);
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        labelled.current.reconfigure(EditorView.contentAttributes.of({ 'aria-label': label })),
        editable.current.reconfigure(editability(disabled)),
        hinted.current.reconfigure(placeholder === undefined ? [] : placeholderText(placeholder)),
      ],
    });
  }, [label, disabled, placeholder]);
  // the document changed under it (an undo, a rename, the keep of its own typing): it shows the document's text unless
  // the person's typing is held (a change from elsewhere keeps that typing first: input/pending.ts). Only the part that
  // differs is replaced, so the cursor stays where it was, and the change is no step of the field's own undo history.
  useEffect(() => {
    const made = view.current;
    if (made === null || typing.current !== null) return;
    const shown = made.state.doc.toString();
    if (shown === value) return;
    let start = 0;
    while (start < shown.length && start < value.length && shown[start] === value[start]) start += 1;
    let end = 0;
    while (end < shown.length - start && end < value.length - start && shown[shown.length - 1 - end] === value[value.length - 1 - end]) end += 1;
    made.dispatch({
      changes: { from: start, to: shown.length - end, insert: value.slice(start, value.length - end) },
      annotations: [SHOWN.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);
  // an expression shows one line, an event's code three, a module eight and its line numbers (panel.css)
  return <div ref={host} className={`code-editor code-editor--${kind}`} data-local="code-editor" />;
}

// Whether the person can type in the field: an unavailable door's field reads only.
const editability = (disabled: boolean | undefined): Extension => [EditorState.readOnly.of(disabled === true), EditorView.editable.of(disabled !== true)];
