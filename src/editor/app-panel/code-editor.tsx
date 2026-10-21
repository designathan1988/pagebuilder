// The code field of the application layer (spec app-logic): an expression, an event's statements or a whole module,
// written in CodeMirror 6 (codemirror.net) — the JavaScript grammar colours it, the parser marks the line that does
// not parse as it is typed, and completion offers what the project holds (state.<variable>, fn.<export>, the app
// helpers, the names of the repeated items) beside the language's own (local names, snippets). Like any field it
// keeps its text in the document when the focus leaves it or on Ctrl+Enter (Cmd+Enter), one command each time; the
// keys typed in it are its own, as a textarea's are the browser's, so none of them runs an editor shortcut but Escape,
// which leaves the field.
import { useEffect, useRef, type ReactNode } from 'react';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript, javascriptLanguage, completionPath } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { linter, type Diagnostic } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder as placeholderText } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { CodeKind } from '../../core/logic/compile.ts';
import { checkAppSyntax } from '../app-runtime/script.ts';

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

export function CodeEditor({ value, kind, scope, onKeep, label, placeholder, disabled = false }: {
  readonly value: string;
  readonly kind: CodeKind;
  readonly scope: CodeScope;
  // the text to keep: called when it differs from `value`
  readonly onKeep: (text: string) => void;
  readonly label: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // the latest props, for the editor's callbacks, which are made once
  const latest = useRef({ value, scope, onKeep });
  useEffect(() => {
    latest.current = { value, scope, onKeep };
  });
  useEffect(() => {
    if (host.current === null) return undefined;
    const keep = (target: EditorView) => {
      const text = target.state.doc.toString();
      if (text !== latest.current.value) latest.current.onKeep(text);
      return true;
    };
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
      keymap.of([{ key: 'Mod-Enter', run: keep }, ...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      EditorView.domEventHandlers({
        blur: (_event, target) => void keep(target),
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
      EditorState.readOnly.of(disabled),
      EditorView.editable.of(!disabled),
    ];
    if (kind === 'module') extensions.push(lineNumbers());
    if (placeholder !== undefined) extensions.push(placeholderText(placeholder));
    const made = new EditorView({ parent: host.current, state: EditorState.create({ doc: latest.current.value, extensions }) });
    view.current = made;
    return () => {
      made.destroy();
      view.current = null;
    };
  }, [kind, label, placeholder, disabled]);
  // the document changed under it (an undo, a rename, another field): it shows the document's text unless the
  // person is typing in it
  useEffect(() => {
    const made = view.current;
    if (made === null || made.hasFocus) return;
    const shown = made.state.doc.toString();
    if (shown !== value) made.dispatch({ changes: { from: 0, to: shown.length, insert: value } });
  }, [value]);
  // an expression shows one line, an event's code three, a module eight and its line numbers (panel.css)
  return <div ref={host} className={`code-editor code-editor--${kind}`} data-local="code-editor" />;
}

// The names a script's code exports (export function f, export const f, export { a, b as c }): what fn. offers.
export function exportedNames(code: string): readonly string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gu)) names.add(match[1] as string);
  for (const match of code.matchAll(/export\s*\{([^}]*)\}/gu)) {
    for (const part of (match[1] as string).split(',')) {
      const name = part.trim().split(/\s+as\s+/u).pop()?.trim();
      if (name !== undefined && /^[A-Za-z_$][\w$]*$/u.test(name) && name !== 'default') names.add(name);
    }
  }
  return [...names];
}
