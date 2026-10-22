// The App panel, a view of the sidebar (spec app-logic): the project's application layer — its variables (the state
// every expression reads as state.<name>), its scripts (modules whose exports every expression calls as fn.<name>),
// its code components (modules that draw anything into an element) and its libraries (any JavaScript module of the
// web, imported by its name). Every control is a door of the manifest's app-panel region; what the panel shows is the
// document, never a state of its own.
import { useState, type ReactNode } from 'react';
import type { AppLibrary, AppModule, AppTable, AppVariable } from '../../core/logic/model.ts';
import { READ_ACCESS, VARIABLE_TYPES, WRITE_ACCESS } from '../../core/logic/model.ts';
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { DoorField, DoorForm, doorOf, type Option } from '../data/controls.tsx';
import { DoorControl, Icon } from '../doors/door.tsx';
import { ViewTitle } from '../shell/view-title.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { panelName } from '../workspace/panel-catalogue.ts';
import { DoorCode } from './door-code.tsx';
import { ExampleButtons } from '../examples/examples.tsx';
import { projectScope } from './scope.ts';
import './panel.css';

const PANEL = 'app-panel';
const NEW_VARIABLE = doorOf(PANEL, 'new-variable');
const VARIABLE_NAME = doorOf(PANEL, 'variable-name');
const VARIABLE_TYPE = doorOf(PANEL, 'variable-type');
const VARIABLE_INITIAL = doorOf(PANEL, 'variable-initial');
const VARIABLE_PERSIST = doorOf(PANEL, 'variable-persist');
const VARIABLE_REMOVE = doorOf(PANEL, 'variable-remove');
const NEW_SCRIPT = doorOf(PANEL, 'new-script');
const NEW_COMPONENT = doorOf(PANEL, 'new-component');
const MODULE_NAME = doorOf(PANEL, 'module-name');
const MODULE_CODE = doorOf(PANEL, 'module-code');
const MODULE_REMOVE = doorOf(PANEL, 'module-remove');
const USE_COMPONENT = doorOf(PANEL, 'use-component');
const LIBRARY_ADD = doorOf(PANEL, 'library-add');
const LIBRARY_REMOVE = doorOf(PANEL, 'library-remove');
const OPEN_EXAMPLE = doorOf('app-panel-examples', 'app-open-example');
const NEW_TABLE = doorOf(PANEL, 'new-table');
const TABLE_NAME = doorOf(PANEL, 'table-name');
const TABLE_READ = doorOf(PANEL, 'table-read');
const TABLE_WRITE = doorOf(PANEL, 'table-write');
const TABLE_REMOVE = doorOf(PANEL, 'table-remove');

function Section({ title, children, actions }: { readonly title: string; readonly children: ReactNode; readonly actions?: ReactNode }): ReactNode {
  return (
    <div className="app-panel__section">
      <div className="section-title">
        <span className="section-title__text">{title}</span>
      </div>
      <div className="app-panel__content">
        {children}
        {actions === undefined ? null : <div className="app-panel__section-actions">{actions}</div>}
      </div>
    </div>
  );
}

// a variable's first value as its field shows it: a text as it is, any other as JSON
const initialText = (variable: AppVariable): string => (variable.type === 'text' ? String(variable.initial ?? '') : JSON.stringify(variable.initial));

function Variables({ variables }: { readonly variables: readonly AppVariable[] }): ReactNode {
  const t = useT();
  const types: Option[] = VARIABLE_TYPES.map((type) => ({ value: type, label: t(`app.type.${type}` as MessageId) }));
  if (variables.length === 0) return <p className="app-panel__note">{t('app.variables.empty')}</p>;
  return (
    <div className="app-variables" role="list">
      {variables.map((variable) => {
        const args = { previous: variable.name, name: variable.name };
        return (
          <div key={variable.name} className="app-variable" role="listitem">
            <div className="app-variable__row">
              <span className="app-variable__prefix" aria-hidden="true">{t('app.variable.prefix')}</span>
              <DoorField entry={VARIABLE_NAME} args={{ previous: variable.name }} name="name" value={variable.name} className="app-variable__name" />
              <DoorField entry={VARIABLE_TYPE} args={args} name="type" value={variable.type} options={types} className="app-variable__type" />
              <DoorControl entry={VARIABLE_PERSIST} args={{ ...args, persist: variable.persist !== true }} label={t('app.variable.persist')} />
              <DoorControl entry={VARIABLE_REMOVE} args={{ name: variable.name }} label={`${t('command.app.removeVariable')} ${variable.name}`} />
            </div>
            {/* the first value's field says what it is above it, as the Data panel's fields do: alone under the row it
                was an empty box with no words (its name only for a screen reader) */}
            <span className="data-part__caption" aria-hidden="true">
              {t('app.variable.initial')}
            </span>
            <DoorField entry={VARIABLE_INITIAL} args={args} name="initial" value={initialText(variable)} label={`${t('app.variable.initial')} (${variable.name})`} className="app-variable__initial" />
          </div>
        );
      })}
    </div>
  );
}

function Modules({ kind, modules, selected }: { readonly kind: 'script' | 'component'; readonly modules: readonly AppModule[]; readonly selected: boolean }): ReactNode {
  const t = useT();
  const document = useEditorState((state) => state.document);
  // the module whose code is open large, over the editor (the sidebar is narrow for a module): the panel's own view
  const [wide, setWide] = useState<string | null>(null);
  const scope = { ...projectScope(document), locals: [] };
  if (modules.length === 0) return <p className="app-panel__note">{t(kind === 'script' ? 'app.scripts.empty' : 'app.components.empty')}</p>;
  const open = modules.find((module) => module.name === wide);
  return (
    <div className="app-modules" role="list">
      {modules.map((module) => (
        <div key={module.name} className="app-module" role="listitem">
          <div className="app-module__row">
            <DoorField entry={MODULE_NAME} args={{ kind, previous: module.name }} name="name" value={module.name} className="app-module__name" />
            <button type="button" className="door door--icon-button" data-local="code-expand" aria-label={`${t('app.module.expand')} · ${module.name}`} title={t('app.module.expand')} onClick={() => setWide(module.name)}>
              <Icon name={manifest.layout.glyphs.expand} size="md" />
            </button>
            <DoorControl entry={MODULE_REMOVE} args={{ kind, name: module.name }} label={`${t('command.app.removeModule')} ${module.name}`} />
          </div>
          {kind === 'component' ? <DoorControl entry={USE_COMPONENT} args={{ value: module.name }} ready={selected} /> : null}
          {open === module ? null : <DoorCode entry={MODULE_CODE} args={{ kind, name: module.name }} name="code" value={module.code} kind="module" scope={scope} label={`${t('app.module.code')} · ${module.name}`} />}
        </div>
      ))}
      {open === undefined ? null : (
        <div className="app-code-window" role="dialog" aria-modal="false" aria-label={`${t('app.module.code')} · ${open.name}`}>
          <div className="app-code-window__head">
            <span className="app-code-window__title">{open.name}</span>
            <span className="app-code-window__hint">{t('app.module.saveHint')}</span>
            <button type="button" className="door door--icon-button" data-local="code-collapse" aria-label={t('app.module.collapse')} title={t('app.module.collapse')} onClick={() => setWide(null)}>
              <Icon name={manifest.layout.glyphs.collapse} size="md" />
            </button>
          </div>
          <DoorCode entry={MODULE_CODE} args={{ kind, name: open.name }} name="code" value={open.code} kind="module" scope={scope} label={`${t('app.module.code')} · ${open.name}`} />
        </div>
      )}
    </div>
  );
}

function Libraries({ libraries }: { readonly libraries: readonly AppLibrary[] }): ReactNode {
  const t = useT();
  return (
    <div className="app-libraries">
      {libraries.length === 0 ? <p className="app-panel__note">{t('app.libraries.empty')}</p> : null}
      {libraries.map((library) => (
        <div key={library.name} className="app-library">
          <code className="app-library__name">{library.name}</code>
          <span className="app-library__url" title={library.url}>{library.url}</span>
          <DoorControl entry={LIBRARY_REMOVE} args={{ name: library.name }} label={`${t('command.app.removeLibrary')} ${library.name}`} />
        </div>
      ))}
      <DoorForm entry={LIBRARY_ADD} args={{}} className="app-library__add">
        <input className="input" name="name" aria-label={t('app.library.name')} placeholder={t('app.library.name')} autoComplete="off" spellCheck={false} />
        <input className="input" name="url" aria-label={t('app.library.url')} placeholder={t('app.library.url')} autoComplete="off" spellCheck={false} />
      </DoorForm>
    </div>
  );
}

// The database's tables: each a name and who reads it and who adds to it (core/logic/model.ts, app.db of the runtime).
function Tables({ tables }: { readonly tables: readonly AppTable[] }): ReactNode {
  const t = useT();
  const reads: Option[] = READ_ACCESS.map((one) => ({ value: one, label: t(`app.access.${one}` as MessageId) }));
  const writes: Option[] = WRITE_ACCESS.map((one) => ({ value: one, label: t(`app.access.${one}` as MessageId) }));
  return (
    <div className="app-tables">
      {tables.length === 0 ? <p className="app-panel__note">{t('app.tables.empty')}</p> : null}
      {tables.map((table) => (
        <div key={table.name} className="app-variable app-table">
          <div className="app-variable__row">
            <DoorField entry={TABLE_NAME} args={{ previous: table.name }} name="name" value={table.name} className="app-variable__name" />
            <DoorControl entry={TABLE_REMOVE} args={{ name: table.name }} label={`${t('command.app.removeTable')} ${table.name}`} />
          </div>
          <div className="logic-row">
            <span className="logic-row__label">{t('app.table.read')}</span>
            <DoorField entry={TABLE_READ} args={{ previous: table.name }} name="read" value={table.read} options={reads} label={`${t('app.table.read')} (${table.name})`} />
          </div>
          <div className="logic-row">
            <span className="logic-row__label">{t('app.table.write')}</span>
            <DoorField entry={TABLE_WRITE} args={{ previous: table.name }} name="write" value={table.write} options={writes} label={`${t('app.table.write')} (${table.name})`} />
          </div>
        </div>
      ))}
      <p className="app-panel__note">{t('app.tables.note')}</p>
    </div>
  );
}

export function AppPanel(): ReactNode {
  const t = useT();
  const app = useEditorState((state) => state.document.app);
  const selected = useEditorState((state) => state.selection.length === 1);
  return (
    <section className="view app-panel" aria-label={t(panelName('app'))}>
      <ViewTitle panel="app" title={t(panelName('app'))} />
      <div className="app-panel__body" data-region="app-panel">
        <p className="app-panel__note">{t('app.intro')}</p>
        <Section title={t('app.section.variables')} actions={<DoorControl entry={NEW_VARIABLE} />}>
          <Variables variables={app?.variables ?? []} />
        </Section>
        <Section title={t('app.section.scripts')} actions={<DoorControl entry={NEW_SCRIPT} />}>
          <Modules kind="script" modules={app?.scripts ?? []} selected={selected} />
        </Section>
        <Section title={t('app.section.components')} actions={<DoorControl entry={NEW_COMPONENT} />}>
          <Modules kind="component" modules={app?.components ?? []} selected={selected} />
        </Section>
        <Section title={t('app.section.database')} actions={<DoorControl entry={NEW_TABLE} />}>
          <Tables tables={app?.tables ?? []} />
        </Section>
        <Section title={t('app.section.libraries')}>
          <Libraries libraries={app?.libraries ?? []} />
        </Section>
      </div>
      <div className="app-panel__body" data-region="app-panel-examples">
        <Section title={t('app.section.examples')}>
          <p className="app-panel__note">{t('app.examples.note')}</p>
          <ExampleButtons entry={OPEN_EXAMPLE} className="app-panel__section-actions" />
        </Section>
      </div>
    </section>
  );
}
