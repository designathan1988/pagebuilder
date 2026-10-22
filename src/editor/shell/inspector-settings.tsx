// The Settings tab of the inspector (split out of shell/inspector.tsx, which keeps the panel and the Style tab): the
// fields of the attributes that apply to the selected element's type (elements.json), in their order — the text first,
// then each attribute's own control (a kept text field, a boolean toggle, a label's target, an attribute whose feature
// arrives later), the parts of a table or a select, the person's own attributes, and the page's own settings.
import { useEffect, useId, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import type { AttributeId, CommandId, FeatureId, MessageId } from '../../generated/ids.ts';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import { locate, type DocNode } from '../../core/document/model.ts';
import { attributeApplies, formControls } from '../../core/elements/inputs.ts';
import { partTypesOf, selectionInTable } from '../../core/elements/parts.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { MODEL_RULES, useEditorState, useStore } from '../store.ts';
import { ATTRIBUTES, SETTINGS_SECTIONS, settingsSectionFor, tagTakes } from '../inspector/attributes.ts';
import { useSettingsRefusal } from '../inspector/attribute-feedback.ts';
import { Hints, useSingleNode } from '../inspector/selection.tsx';
import { useT } from '../text.ts';
import { ID_REF, KeptTextField, TextField, keepAfterGesture, keptTextOf } from './field.tsx';
import './settings.css';
import { FormsInspector } from '../forms/inspector.tsx';
import { PanelField } from './panel-field.tsx';
import { isMapFrame, mapPlaceOf } from '../../core/elements/map.ts';
import { variantBase, variantsOf } from '../../core/design/components.ts';
import { instanceRootOf } from '../../core/design/instances.ts';

const SETTINGS_FIELDS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'inspector-field' && d.door.attribute !== null && !d.door.control.startsWith('forms-'));
// the toggles of a table's parts (caption, head, foot; core/elements/parts.ts), drawn while the selection is in a table
const TABLE_PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'toggle');
// a table's rows and columns, added and removed (core/elements/table.ts): they stood only in the context menu and the
// command bar, and a person in the table's Settings found no way to add a row
const TABLE_EDIT_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'button' && d.command.id.startsWith('table.'));
// the parts editor (core/elements/parts.ts): the buttons that add a part of a type (their door fixes the type), and the
// buttons of each part that stand for it (their command takes the part as its target: move up, move down, remove)
const ADD_PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'button' && typeof d.door.args.type === 'string');
const PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'icon-button' && d.command.args.target?.type === 'node');
// a part's name opens it: selected, the part shows its own settings (an option's text and value, a source's file); the
// row named a part the person could not reach from it
const PART_OPEN = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'part-open');
// the person's own attributes (feature element-attributes-aria): the doors whose command takes an attribute's name
// (and its value): in the manifest's order, the name field that adds one and the value field of each, both fields of
// the command that sets a value; then the remove button
// (a door that fixes the name is a field of one attribute, the cart's WhatsApp number below, not the person's own)
const CUSTOM_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.command.args.name?.type === 'string' && !('name' in d.door.args));
const [CUSTOM_ADD, CUSTOM_VALUE] = CUSTOM_DOORS.filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'field' && 'value' in d.command.args);
const CUSTOM_REMOVE = CUSTOM_DOORS.find((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'icon-button' && !('value' in d.command.args));

// The command argument a boolean attribute's toggle fills: the argument of the attribute's own name that takes a
// boolean (element.setLink's newTab), or null when the command takes none.
function toggleArgOf(entry: DoorEntry, attribute: AttributeId): { readonly args: Readonly<Record<string, string>>; readonly filled: string } | null {
  const args = Object.entries(entry.command.args);
  const named = args.find(([, arg]) => arg.type === 'attribute')?.[0];
  if (named !== undefined) {
    const filled = args.find(([name]) => name !== named && name !== 'target')?.[0];
    return filled === undefined ? null : { args: { [named]: attribute }, filled };
  }
  const own = args.find(([name, arg]) => name === attribute && arg.type === 'boolean');
  return own === undefined ? null : { args: {}, filled: own[0] };
}

// A boolean attribute of the Settings tab (Open in a new tab, Required, Disabled…): a two-option segmented control,
// Off | On (journey02 GENERALISATION 1.3: the canonical has no checkbox), each option the door standing for its state
// of the node, the one the node stores pressed; a press on the other runs the door's command with it, one undo step.
// One Tab stop, the arrows between the two (a roving group).
const TOGGLE_STATES = [false, true] as const;
function ToggleField({ entry, node, attribute, label }: { readonly entry: DoorEntry; readonly node: DocNode; readonly attribute: AttributeId; readonly label: string }) {
  const store = useStore();
  const t = useT();
  const toggle = toggleArgOf(entry, attribute);
  const target = 'target' in entry.command.args ? node.id : undefined;
  const json = JSON.stringify({ ...(toggle?.args ?? {}), ...(target === undefined ? {} : { target }) });
  const args = useMemo(() => JSON.parse(json) as Readonly<Record<string, string>>, [json]);
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const on = node.attributes[attribute] === true;
  const filled = toggle?.filled ?? attribute;
  const off = door.available ? '' : ' is-unavailable';
  return (
    <div className={`field-row${off}`} title={door.title}>
      <span className="field-row__label">{label}</span>
      <span className="segmented segmented--values field-toggle" role="group" aria-label={label}>
        {TOGGLE_STATES.map((state) => (
          <button
            key={String(state)}
            type="button"
            className={`door door--segment${off}${on === state ? ' is-current' : ''}`}
            aria-pressed={on === state}
            aria-disabled={door.available ? undefined : true}
            data-door={entry.ref}
            data-args={JSON.stringify({ ...args, [filled]: state })}
            data-key-context="roving-group"
            tabIndex={on === state ? undefined : -1}
            onClick={() => {
              if (door.available && on !== state) (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id, { ...args, [filled]: state });
            }}
          >
            <span className="door__label">{t(state ? 'field.toggle.on' : 'field.toggle.off')}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

// The parts of the selected element (a select's options and groups, a picture's or a video's sources, a video's
// tracks): each part by name with its move up, move down and remove buttons, then the buttons that add each type of
// part the element takes. Drawn only for an element that takes parts.
function PartsEditor({ node }: { readonly node: DocNode }) {
  const store = useStore();
  const t = useT();
  const takes = partTypesOf(MODEL_RULES, node);
  // one button a type: the picture's and the media's Add a source both add a source, and a video showed both
  const adds = ADD_PART_DOORS.filter((d, i) => takes(String(d.door.args.type)) && ADD_PART_DOORS.findIndex((other) => other.command.id === d.command.id && other.door.args.type === d.door.args.type) === i);
  if (adds.length === 0) return null;
  const parts = node.children.filter((child) => MODEL_RULES.contentModel.names(node.tag ?? '', child.tag ?? ''));
  return (
    <div className="parts-editor">
      {parts.map((part) => (
        <div key={part.id} className="field-row">
          {PART_OPEN === undefined ? (
            <span className="field-row__label">{part.name}</span>
          ) : (
            <button type="button" className="field-row__label parts-editor__open" title={t(PART_OPEN.door.labelKey as MessageId)} data-door={PART_OPEN.ref} data-args={JSON.stringify({ target: part.id })} onClick={() => (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(PART_OPEN.command.id, { target: part.id })}>
              {part.name}
            </button>
          )}
          {PART_DOORS.map((d) => (
            <DoorControl key={d.ref} entry={d} args={{ target: part.id }} />
          ))}
        </div>
      ))}
      <div className="field-row">
        {adds.map((d) => (
          <DoorControl key={d.ref} entry={d} />
        ))}
      </div>
    </div>
  );
}

// The person's own attributes of the selected element (aria-*, data-*, role…): each by name with its value field (kept
// on Enter or on leaving it, one undo step) and its remove button; then a name field and the add button. The button
// adds the typed name with an empty value or, with no name typed, puts the caret in the name field, where Enter adds
// it. The name field's form is the add door's control: it stands for the empty value it adds and keeps the name typed.
const ADDED = { value: '' } as const;
const ADDED_VALUE = JSON.stringify(ADDED);
function CustomAttributes({ node, add: addEntry }: { readonly node: DocNode; readonly add: DoorEntry }) {
  const store = useStore();
  const t = useT();
  const addDoor = useDoor(addEntry, {}, undefined, isFeatureBuilt(addEntry.door.feature as FeatureId));
  const refused = useSettingsRefusal(addEntry.command.id, undefined, node.id);
  const typedName = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typedName.current !== null) typedName.current.value = '';
  }, [node.id]);
  const dispatch = store.dispatch as (id: CommandId, args: unknown) => DispatchResult;
  const add = () => {
    const field = typedName.current;
    if (field === null) return;
    if (field.value.trim() === '') {
      field.focus();
      return;
    }
    if (dispatch(addEntry.command.id, { name: field.value, ...ADDED }).status === 'done') field.value = '';
  };
  // Enter in the name field submits its form, which adds the name
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add();
  };
  return (
    <div className="custom-attributes" aria-label={addDoor.label}>
      {Object.entries(node.customAttributes ?? {}).map(([name, value]) => (
        <CustomAttributeRow key={`${node.id}:${name}`} node={node} name={name} value={value} />
      ))}
      <form className={`field-row${addDoor.available ? '' : ' is-unavailable'}${refused.text !== null ? ' is-invalid' : ''}`} title={addDoor.title} onSubmit={submit} data-door={addEntry.ref} data-args={ADDED_VALUE}>
        <input ref={typedName} className="input" disabled={!addDoor.available} aria-label={t('inspector.customAttribute.name')} aria-invalid={refused.text !== null} placeholder={t('inspector.customAttribute.name')} spellCheck={false} data-local="custom-attribute-name" onInput={refused.dismiss} />
        <button type="button" className="door door--icon-button" disabled={!addDoor.available} aria-label={addDoor.label} onClick={add}>
          {addEntry.door.icon !== null ? <Icon name={addEntry.door.icon} size="md" /> : null}
        </button>
        {refused.text !== null ? <span className="field-row__refusal" role="alert">{refused.text}</span> : null}
      </form>
    </div>
  );
}

function CustomAttributeRow({ node, name, value }: { readonly node: DocNode; readonly name: string; readonly value: string }) {
  const store = useStore();
  const valueEntry = CUSTOM_VALUE as DoorEntry;
  const removeEntry = CUSTOM_REMOVE as DoorEntry;
  const args = useMemo(() => ({ name }), [name]);
  const door = useDoor(valueEntry, args, name, isFeatureBuilt(valueEntry.door.feature as FeatureId));
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = useRef(value);
  const said = useEditorState((s) => s.message);
  useEffect(() => {
    if (field.current === null) return;
    field.current.value = value;
    shown.current = value;
  }, [value, said]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    if (row === null || element === null) return;
    const keep = () => {
      if (element.value === shown.current) return;
      shown.current = element.value;
      const text = element.value;
      keepAfterGesture(store, () => {
        if (locate(store.getState().document, node.id) === null) return;
        (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(valueEntry.command.id, { name, value: text });
      });
    };
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
      keep();
    };
  }, [store, valueEntry, name, node.id]);
  return (
    <form ref={form} className={`field-row field-row--action${door.available ? '' : ' is-unavailable'}`} data-door={valueEntry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <span className="field-row__label">{name}</span>
      <input ref={field} className="input" disabled={!door.available} aria-label={name} spellCheck={false} />
      <DoorControl entry={removeEntry} args={args} />
    </form>
  );
}

// A label's `for` (element.setLabelTarget): a field offering the form controls of the page by name; keeping a name
// (Enter or leaving the field) points the label at that control, which is given an id when it has none. The field
// shows the name of the control the label points at.
function LabelTargetField({ entry, node, label }: { readonly entry: DoorEntry; readonly node: DocNode; readonly label: string }) {
  const store = useStore();
  const door = useDoor(entry, {}, label, isFeatureBuilt(entry.door.feature as FeatureId));
  // the form controls of the document, read once per document (a selector returning a new list would never settle)
  const document = useEditorState((s) => s.document);
  const controls = useMemo(() => formControls(document), [document]);
  // the reference is kept by the control's node id (A3.4): the field shows that control's name and its ID
  const held = node.attributes.labelFor;
  const current = typeof held === 'string' ? (controls.find((c) => c.id === held)?.name ?? '') : '';
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  const said = useEditorState((s) => s.message);
  const arg = Object.entries(entry.command.args).find(([, a]) => a.type === 'node')?.[0] ?? '';
  useEffect(() => {
    if (field.current !== null) field.current.value = current;
  }, [current, said]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    if (row === null || element === null) return;
    const keep = () => {
      const typed = element.value.trim();
      if (typed === current) return;
      // a control is found by its name or by its ID attribute, as the field shows both (the audit A3.4)
      const control = formControls(store.getState().document).find((c) => c.name === typed || (c.attributes.id !== undefined && String(c.attributes.id) === typed));
      if (control === undefined) {
        element.value = current;
        return;
      }
      keepAfterGesture(store, () => (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id, { [arg]: control.id }));
    };
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
    };
  }, [store, entry, arg, current]);
  return (
    <form ref={form} className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{label}</span>
      <input ref={field} className="input" disabled={!door.available} aria-label={label} spellCheck={false} list={listId} />
      <datalist id={listId}>
        {controls.map((c) => (
          <option key={c.id} value={c.name}>{c.attributes.id === undefined ? c.name : `${c.name} · ${String(c.attributes.id)}`}</option>
        ))}
      </datalist>
    </form>
  );
}

// An attribute field of the Settings tab whose command, or whose door's feature, arrives later (Open in a new tab
// shares element.setLink with the Link address and comes with elements-text): drawn disabled, "not available yet".
function AttributeField({ entry, label, toggle }: { readonly entry: DoorEntry; readonly label: string; readonly toggle: boolean }) {
  const t = useT();
  const door = useDoor(entry, {}, label, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{label}</span>
      {toggle ? (
        <span className="segmented segmented--values field-toggle" role="group" aria-label={label}>
          {TOGGLE_STATES.map((state) => (
            <button key={String(state)} type="button" className="door door--segment is-unavailable" aria-disabled>
              <span className="door__label">{t(state ? 'field.toggle.on' : 'field.toggle.off')}</span>
            </button>
          ))}
        </span>
      ) : (
        <input className="input" disabled={!door.available} aria-label={label} />
      )}
    </div>
  );
}

// The Settings tab: no selector bar, its region right under the header. With one element selected,
// the fields of the attributes that apply to its type (elements.json), in their order, the text first.
// the project's language fields (core/project/language.ts), drawn under the page root's own settings
const PROJECT_LANGUAGE = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'project-language');
const CODE_LANGUAGE = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'code-language');
// an instance's variant (spec component-variants), drawn with an element of an instance selected
const COMPONENT_VARIANT = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'component-variant');
// what an instance does with its component, beside its Variant (they were in the context menu alone): give the component
// this instance's changes, every other instance following, or leave the component
const COMPONENT_UPDATE = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'component-update');
const COMPONENT_DETACH = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'component-detach');
// the language tags the fields offer (a person may type any other)
const COMMON_LANGUAGES: readonly string[] = 'en pt-BR pt-PT es fr de it nl ja zh ko ar'.split(' ');
// the language the code is named in when the project names none (core/export/names.ts)
const DEFAULT_CODE_LANGUAGE = 'en';

// The Project section (spec project-language): with the page root selected, the language the pages are written in and
// the one the exported code is named in, each a field kept on Enter
function ProjectSettings({ node }: { readonly node: DocNode }) {
  const t = useT();
  const isRoot = useEditorState((s) => locate(s.document, node.id)?.parent === null);
  const language = useEditorState((s) => (s.document as { readonly language?: string }).language ?? '');
  const code = useEditorState((s) => (s.document as { readonly codeLanguage?: string }).codeLanguage ?? DEFAULT_CODE_LANGUAGE);
  if (!isRoot || PROJECT_LANGUAGE === undefined || CODE_LANGUAGE === undefined) return null;
  return (
    <section className="settings-section" data-settings-section="project" aria-label={t('settings.project')}>
      <div className="settings-section__header">
        <h3 title={t('settings.projectAbout')}>{t('settings.project')}</h3>
      </div>
      <PanelField entry={PROJECT_LANGUAGE} value={language} label={t('command.project.setLanguage')} offered={COMMON_LANGUAGES} />
      <PanelField entry={CODE_LANGUAGE} value={code} label={t('command.project.setCodeLanguage')} offered={COMMON_LANGUAGES} />
    </section>
  );
}

// The component of the instance the selected element lies in, and its Variant: the variant its root lists, the
// variants the project's classes give the component offered (spec component-variants)
function ComponentSettings({ node }: { readonly node: DocNode }) {
  const t = useT();
  const root = useEditorState((s) => instanceRootOf(s.document, node.id as Parameters<typeof instanceRootOf>[1]));
  // (read from the document, not as a selector: a selector returning a new list each time redraws without end)
  const document = useEditorState((s) => s.document);
  const offered = root?.component === undefined ? [] : variantsOf(document, root.component);
  if (root === null || root.component === undefined || COMPONENT_VARIANT === undefined) return null;
  const prefix = `${variantBase(root.component)}--`;
  const current = root.classes.find((one) => one.startsWith(prefix))?.slice(prefix.length) ?? '';
  return (
    <section className="settings-section" data-settings-section="component" aria-label={t('settings.component', { name: root.component })}>
      <div className="settings-section__header">
        <h3>{t('settings.component', { name: root.component })}</h3>
      </div>
      <PanelField entry={COMPONENT_VARIANT} value={current} label={t('command.components.setVariant')} offered={offered} placeholder={t('settings.component.variantPlaceholder')} />
      {/* what a variant is: an empty field said nothing of it */}
      <p className="settings-section__note">{t('settings.component.variantHelp', { base: variantBase(root.component) })}</p>
      {COMPONENT_UPDATE === undefined && COMPONENT_DETACH === undefined ? null : (
        <div className="settings-section__actions">
          {COMPONENT_UPDATE === undefined ? null : <DoorControl entry={COMPONENT_UPDATE} />}
          {COMPONENT_DETACH === undefined ? null : <DoorControl entry={COMPONENT_DETACH} />}
        </div>
      )}
    </section>
  );
}

// The shop's cart (the Components' cart, data-wc="cart", read by src/editor/widgets/widgets.js): the WhatsApp number
// its orders go to, the custom attribute its door names, typed in its own labelled field (the audit's TPL-13; the
// Checks' "Cart with nowhere to send the order" points here). The command keeps the number's digits and refuses what
// is no phone number (core/elements/attributes.ts whatsappNumber).
const CART_WHATSAPP = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'cart-whatsapp');
const CART_KIND = { attribute: 'data-wc', value: 'cart' } as const;
function CartSettings({ node }: { readonly node: DocNode }) {
  const t = useT();
  if (CART_WHATSAPP === undefined || node.customAttributes?.[CART_KIND.attribute] !== CART_KIND.value) return null;
  const attribute = String(CART_WHATSAPP.door.args.name);
  return (
    <section className="settings-section" data-settings-section="cart" aria-label={t('settings.cart')}>
      <div className="settings-section__header">
        <h3 title={t('settings.cart.about')}>{t('settings.cart')}</h3>
      </div>
      <PanelField key={node.id} entry={CART_WHATSAPP} value={node.customAttributes[attribute] ?? ''} label={t(CART_WHATSAPP.door.labelKey as MessageId)} placeholder={t('inspector.cart.whatsapp.placeholder')} />
    </section>
  );
}

// The countdown (the Components' countdown, data-wc="countdown", read by src/editor/widgets/widgets.js): the moment it
// counts down to, its data-wc-date, picked in the browser's date and time field. It was a raw attribute holding an
// ISO timestamp ("2026-11-21T21:46:25.6…Z") the person had to rewrite by hand. The field shows that moment in the
// person's own time and writes what they pick as the same absolute moment.
const COUNTDOWN_END = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'countdown-end');
const COUNTDOWN_KIND = { attribute: 'data-wc', value: 'countdown' } as const;
const pad = (n: number): string => String(n).padStart(2, '0');
// an ISO moment as the datetime-local field holds it, in local time ("2026-11-21T18:46"); '' for no valid moment
function localMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
// the field's local time as the absolute moment the countdown reads; what it cannot read is handed on as typed, for
// the command to keep or refuse
function isoMoment(local: string): string {
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? local : at.toISOString();
}
function CountdownSettings({ node }: { readonly node: DocNode }) {
  const t = useT();
  if (COUNTDOWN_END === undefined || node.customAttributes?.[COUNTDOWN_KIND.attribute] !== COUNTDOWN_KIND.value) return null;
  const attribute = String(COUNTDOWN_END.door.args.name);
  return (
    <section className="settings-section" data-settings-section="countdown" aria-label={t('settings.countdown')}>
      <div className="settings-section__header">
        <h3>{t('settings.countdown')}</h3>
      </div>
      <PanelField key={node.id} entry={COUNTDOWN_END} value={node.customAttributes[attribute] ?? ''} label={t(COUNTDOWN_END.door.labelKey as MessageId)} inputType="datetime-local" display={localMoment} accept={isoMoment} />
      <p className="settings-section__note">{t('inspector.countdown.help')}</p>
    </section>
  );
}

// a map's place (core/elements/map.ts): drawn for a frame that shows a map, the place it shows now in the field
const MAP_PLACE = doorSlots('inspector-settings').find((d) => d.door.kind === 'panel-control' && d.door.control === 'map-place');
function MapSettings({ node }: { readonly node: DocNode }) {
  const t = useT();
  if (MAP_PLACE === undefined || !isMapFrame(node)) return null;
  return (
    <section className="settings-section" data-settings-section="map" aria-label={t('settings.map')}>
      <div className="settings-section__header">
        <h3>{t('settings.map')}</h3>
      </div>
      <PanelField key={node.id} entry={MAP_PLACE} value={mapPlaceOf(node)} label={t(MAP_PLACE.door.labelKey as MessageId)} placeholder={t('inspector.map.placePlaceholder')} />
      <p className="settings-section__note">{t('inspector.map.placeHelp')}</p>
    </section>
  );
}

export function SettingsTab({ head = null }: { readonly head?: ReactNode } = {}) {
  const t = useT();
  const count = useEditorState((s) => s.selection.length);
  const node = useSingleNode();
  const inTable = useEditorState((s) => selectionInTable(s.document, s.selection));
  const fields = node === null ? [] : SETTINGS_FIELDS.filter((entry) => {
    const attribute = entry.door.kind === 'inspector-field' && entry.door.attribute !== null ? ATTRIBUTES.get(entry.door.attribute) : undefined;
    return attribute !== undefined && (attribute.elements === 'all' || attribute.elements.includes(node.type)) && attributeApplies(node, attribute.id);
  });
  // the tab's region holds its head (the selected element, inspector.tsx) and its fields, as the Interactions tab's
  // holds its head: the fields start right under the inspector's header, the head their first line
  return (
    <div className="inspector-tab inspector-tab--settings" data-region="inspector-settings">
      {head}
      <div className="inspector-scroll">
        {/* with no element to show, the words keep the Style tab's room from the panel's edges (DEF-0578: they touched
            them) */}
        <div className={`inspector-body${count === 0 || node === null ? ' inspector-body--empty' : ''}`}>
          {count === 0 ? (
            <>
              <p className="inspector-empty">{t('inspector.nothingSelected')}</p>
              <Hints />
            </>
          ) : node === null ? (
            <p className="inspector-empty">{t('canvas.selectedCount', { count })}</p>
          ) : SETTINGS_SECTIONS.map((section) => {
            if (section.elements !== 'all' && !section.elements.includes(node.type)) return null;
            // a field of an attribute the tag does not take is not drawn (A3.7: the fields follow the tag)
            const owned = fields.filter((entry) => entry.door.kind === 'inspector-field' && entry.door.attribute !== null && settingsSectionFor(entry.door.attribute, node.type) === section.id && tagTakes(entry.door.attribute, node, MODEL_RULES.contentModel, MODEL_RULES));
            if (owned.length === 0 && section.id !== 'attributes') return null;
            return (
              <section key={section.id} className="settings-section" data-settings-section={section.id} aria-label={t(section.labelKey as MessageId)}>
                {/* the section's title, and what it is for in its tooltip and its description (journey02 GENERALISATION 1.3:
                    the permanent line under every title cost a row per section) */}
                <div className="settings-section__header">
                  <h3 title={t(section.descriptionKey as MessageId)} aria-describedby={`settings-${section.id}-about`}>
                    {t(section.labelKey as MessageId)}
                  </h3>
                  <p id={`settings-${section.id}-about`} className="visually-hidden">
                    {t(section.descriptionKey as MessageId)}
                  </p>
                </div>
                {owned.map((entry) => {
                  const attribute = entry.door.kind === 'inspector-field' && entry.door.attribute !== null ? ATTRIBUTES.get(entry.door.attribute) : undefined;
                  if (attribute === undefined) return null;
                  const label = t(attribute.labelKey as MessageId);
                  if (attribute.valueType === ID_REF) return <LabelTargetField key={`${entry.ref}@${node.id}`} entry={entry} node={node} label={label} />;
                  if ('content' in entry.command.args) return <TextField key={`${entry.ref}@${node.id}`} entry={entry} node={node} label={label} />;
                  const kept = keptTextOf(entry, attribute.id as AttributeId, attribute.valueType, node);
                  if (kept !== null) return <KeptTextField key={`${entry.ref}@${node.id}`} entry={entry} node={node} kept={kept} label={label} attribute={attribute.id} />;
                  if (attribute.valueType === 'boolean' && toggleArgOf(entry, attribute.id as AttributeId) !== null)
                    return <ToggleField key={`${entry.ref}@${node.id}`} entry={entry} node={node} attribute={attribute.id as AttributeId} label={label} />;
                  return <AttributeField key={entry.ref} entry={entry} label={label} toggle={attribute.valueType === 'boolean'} />;
                })}
                {section.id === 'attributes' ? <PartsEditor node={node} /> : null}
                {section.id === 'attributes' && CUSTOM_ADD !== undefined && CUSTOM_VALUE !== undefined && CUSTOM_REMOVE !== undefined ? <CustomAttributes node={node} add={CUSTOM_ADD} /> : null}
                {section.id === 'attributes' && inTable ? (
                  <div className="field-row field-row--toggles">
                    {TABLE_PART_DOORS.map((entry) => <DoorControl key={entry.ref} entry={entry} />)}
                  </div>
                ) : null}
                {section.id === 'attributes' && inTable ? (
                  <div className="field-row field-row--actions">
                    {TABLE_EDIT_DOORS.map((entry) => <DoorControl key={entry.ref} entry={entry} />)}
                  </div>
                ) : null}
              </section>
            );
          })}
          {node !== null ? <MapSettings node={node} /> : null}
          {node !== null ? <CartSettings node={node} /> : null}
          {node !== null ? <CountdownSettings node={node} /> : null}
          {node !== null ? <FormsInspector node={node} /> : null}
          {node !== null ? <ComponentSettings node={node} /> : null}
          {node !== null ? <ProjectSettings node={node} /> : null}
        </div>
      </div>
    </div>
  );
}
