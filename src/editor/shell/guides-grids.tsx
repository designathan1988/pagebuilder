// The Guides & Grids dialog (guides-grids-dialog; spec workspace-settings-dialog), open
// while the editor state says so (ui.dialog, workspace/dialogs.ts): a modal over the editor whose controls are the
// doors the manifest places in its region, in their order, parted into sections where the region breaks (layout.json),
// each titled, its hint as the title's tooltip:
//  - a switch (drawn as a toggle) is its door's control;
//  - Add a guide (a door that takes an axis and a place) is one opener per axis, whose field takes the place typed and
//    adds the guide on Enter;
//  - the remove button (a door that takes a guide) is drawn once per guide of the page, after its axis and place;
//  - a grid's settings (a door that takes a setting) are one field per setting of its grid
//    (core/page/grid-settings.ts), showing the setting now; Enter keeps the number typed (grid.setSettings, which
//    refuses one out of its range).
// Escape (the dialog key context) and its close button (ui.dismiss) close it, and the focus goes back where it was:
// the control that opened it, or the button of the menu whose item did. Opening a field or the list is not a command.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { openedPage } from '../../core/project/pages.ts';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import { gridSetting } from '../../core/page/grid.ts';
import { settingsOf, type GridName } from '../../core/page/grid-settings.ts';
import { guidesOf } from '../../core/page/guides.ts';
import type { DispatchResult, EditContext } from '../../core/store/store.ts';
import type { CommandId, FeatureId, MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { breaksIn, doorSlots, drawnAsOf } from '../doors/placement.ts';
import { afterGesture } from '../input/pointer.ts';
import { heldDraft, typedNumber, type HeldDraft } from '../input/held-draft.ts';
import { INNER_LAYER, onInnerLayerDismiss } from '../input/inner-layer.ts';
import { activeBreakpoint } from '../view/breakpoints.ts';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';
import { DIALOG_KEYS, ModalDialog } from './dialog.tsx';

const REGION = 'guides-grids-dialog';
const DIALOG = 'guides-grids';
const DOORS = doorSlots(REGION);
// the sections' titles, in the order of the region's groups
const SECTIONS: readonly { readonly title: MessageId; readonly hint: MessageId }[] = [
  { title: 'guidesGrids.section.visibility', hint: 'guidesGrids.section.visibilityHint' },
  { title: 'guidesGrids.section.manual', hint: 'guidesGrids.section.manualHint' },
  { title: 'guidesGrids.section.smart', hint: 'guidesGrids.section.smartHint' },
  { title: 'guidesGrids.section.columns', hint: 'guidesGrids.section.columnsHint' },
  { title: 'guidesGrids.section.rows', hint: 'guidesGrids.section.rowsHint' },
  { title: 'guidesGrids.section.dots', hint: 'guidesGrids.section.dotsHint' },
];
// the opener's label for each axis a guide lies on
const ADD_LABEL: Readonly<Record<string, MessageId>> = { horizontal: 'guidesGrids.addHorizontal', vertical: 'guidesGrids.addVertical' };
const AXIS_LABEL: Readonly<Record<string, MessageId>> = { horizontal: 'guidesGrids.axis.horizontal', vertical: 'guidesGrids.axis.vertical' };

const ready = (entry: DoorEntry) => isFeatureBuilt(entry.door.feature as FeatureId);
const takes = (entry: DoorEntry, arg: string) => arg in entry.command.args;

// the region's doors in groups, parted before each break
function groups(): readonly (readonly DoorEntry[])[] {
  const breaks = breaksIn(REGION);
  const out: DoorEntry[][] = [[]];
  for (const entry of DOORS) {
    const order = typeof entry.door.placement === 'object' ? entry.door.placement.order : 0;
    if (breaks.includes(order) && (out[out.length - 1]?.length ?? 0) > 0) out.push([]);
    out[out.length - 1]?.push(entry);
  }
  return out;
}
const GROUPS = groups();

// a command run with the arguments of a field, once no gesture is open (in the context the typing began in, when the
// registry of typing keeps a field's value)
function useRun(): (entry: DoorEntry, args: Readonly<Record<string, unknown>>, context?: EditContext) => void {
  const store = useStore();
  return (entry, args, context) => afterGesture(store, () => (store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args }, context));
}

// Add a guide on an axis: its opener shows the place field. Enter adds the guide; the place typed is held in the one
// registry of typing (input/held-draft.ts, rule G2), so leaving the field, a press elsewhere or the dialog closing add
// it too, in the context of its first key (the input audit's INPUT-7: leaving the field threw "120" away). Escape in
// the field cancels it and closes the field alone, never the dialog (input/inner-layer.ts, INPUT-6); a field left
// with nothing typed closes without a word.
function AddGuide({ entry, axis }: { readonly entry: DoorEntry; readonly axis: string }) {
  const t = useT();
  const run = useRun();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const label = t(ADD_LABEL[axis] ?? (entry.door.labelKey as MessageId));
  const door = useDoor(entry, { axis }, label, ready(entry));
  const opener = useRef<HTMLButtonElement>(null);
  // the place field, which is its own region and the layer Escape closes
  const input = useRef<HTMLInputElement>(null);
  // the text typed now, for the keep the registry runs outside a render
  const typed = useRef<string | null>(null);
  // the text as the number the command takes, never judged here: the command refuses a place that is none (DEF-0515)
  const add = (text: string, context?: EditContext) => run(entry, { axis, at: typedNumber(text) }, context);
  const keepHeld = useRef<(context: EditContext) => void>(() => undefined);
  useEffect(() => {
    keepHeld.current = (context) => {
      const text = typed.current;
      typed.current = null;
      setOpen(false);
      if (text !== null && text.trim() !== '') add(text, context);
    };
  });
  const command = entry.command.id as CommandId;
  const held = useRef<HeldDraft | null>(null);
  useEffect(() => {
    const layer = input.current;
    if (!open || layer === null) return;
    const draft = heldDraft(store, input, input, command, keepHeld);
    held.current = draft;
    const stop = onInnerLayerDismiss(layer, () => {
      typed.current = null;
      draft.done();
      opener.current?.focus();
      setOpen(false);
    });
    return () => {
      stop();
      draft.left();
      held.current = null;
    };
  }, [open, store, command]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.current?.value ?? '';
    typed.current = null;
    held.current?.done();
    // the focus goes back to the opener, never to the page under the field that closes
    opener.current?.focus();
    setOpen(false);
    add(text);
  };
  return (
    <span className="guides-grids__add">
      <button
        ref={opener}
        type="button"
        className={`door door--button${door.available ? '' : ' is-unavailable'}`}
        data-door={entry.ref}
        data-args={JSON.stringify({ axis })}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => (door.available ? setOpen((was) => !was) : undefined)}
      >
        {entry.door.icon !== null ? <Icon name={entry.door.icon} size="sm" /> : null}
        <span className="door__label">{label}</span>
      </button>
      {open ? (
        <form className="guides-grids__place" onSubmit={submit}>
          <input
            ref={input}
            {...{ [INNER_LAYER]: '' }}
            className="input"
            name="at"
            autoFocus
            inputMode="decimal"
            spellCheck={false}
            aria-label={t('guidesGrids.place')}
            placeholder={t('guidesGrids.place')}
            data-local="guide-place"
            data-key-context={DIALOG_KEYS}
            onChange={(event) => {
              typed.current = event.currentTarget.value;
              held.current?.typed();
            }}
            onBlur={() => {
              held.current?.left();
              setOpen(false);
            }}
          />
        </form>
      ) : null}
    </span>
  );
}

function GuideList({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const guides = useEditorState((s) => guidesOf(s.document, openedPage(s)));
  if (guides.length === 0) return <p className="guides-grids__none">{t('guidesGrids.none')}</p>;
  return (
    <ul className="guides-grids__guides">
      {guides.map((guide) => (
        <li key={guide.id} className="guides-grids__guide">
          <span>{t(AXIS_LABEL[guide.axis] ?? 'guidesGrids.place')}</span>
          <span className="guides-grids__at">{t('guidesGrids.at', { at: guide.at })}</span>
          <DoorControl entry={entry} args={{ guide: guide.id }} ready={ready(entry)} />
        </li>
      ))}
    </ul>
  );
}

function GridField({ entry, grid, setting, labelKey }: { readonly entry: DoorEntry; readonly grid: GridName; readonly setting: string; readonly labelKey: string }) {
  const t = useT();
  const run = useRun();
  const label = t(labelKey as MessageId);
  // the field shows the setting at the breakpoint in force (A1.6), which its write also lands at
  // the open page's own settings, the page grid.setSettings writes (the audit's PG2: the first page's were shown)
  const value = useEditorState((s) => gridSetting(s.document, grid, setting, activeBreakpoint(s).id, openedPage(s)));
  const door = useDoor(entry, { grid, setting }, label, ready(entry));
  // what is typed, until Enter keeps it or the field is left (a field's draft, not editor state)
  const [draft, setDraft] = useState<string | null>(null);
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // the text typed now, for the keep the registry runs outside a render (a press elsewhere, the focus leaving)
  const typed = useRef<string | null>(null);
  // the text as the number the command takes, never judged here: the command refuses a value out of its range or none
  // at all with its own words (rule G3, DEF-0515)
  const write = (text: string, context?: EditContext) => run(entry, { grid, setting, value: typedNumber(text) }, context);
  const keepHeld = useRef<(context: EditContext) => void>(() => undefined);
  useEffect(() => {
    keepHeld.current = (context) => {
      const text = typed.current;
      typed.current = null;
      setDraft(null);
      if (text !== null) write(text, context);
    };
  });
  // the typing is held in the one registry of typing (input/held-draft.ts, rule G2; DEF-0514): a press elsewhere, the
  // focus leaving or the dialog closing keep it
  const command = entry.command.id as CommandId;
  const held = useRef<HeldDraft | null>(null);
  useEffect(() => {
    const draft = heldDraft(store, input, form, command, keepHeld);
    held.current = draft;
    return () => {
      draft.left();
      held.current = null;
    };
  }, [store, command]);
  // Enter submits the field's form
  const keep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null) return;
    typed.current = null;
    setDraft(null);
    write(draft);
    held.current?.done();
  };
  return (
    <form ref={form} className="guides-grids__field" data-door={entry.ref} data-args={JSON.stringify({ grid, setting })} title={door.title} onSubmit={keep}>
      <label className="guides-grids__label" htmlFor={`guides-grids-${grid}-${setting}`}>
        {label}
      </label>
      <input
        ref={input}
        id={`guides-grids-${grid}-${setting}`}
        className="input"
        inputMode="decimal"
        spellCheck={false}
        disabled={!door.available}
        data-key-context={DIALOG_KEYS}
        value={draft ?? String(value)}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          typed.current = event.currentTarget.value;
          held.current?.typed();
        }}
        onBlur={() => {
          held.current?.left();
          setDraft(null);
        }}
      />
    </form>
  );
}

// the control a door of the region is drawn as
function control(entry: DoorEntry): ReactNode {
  const axis = entry.command.args.axis;
  if (drawnAsOf(entry) === 'button' && axis !== undefined && takes(entry, 'at')) return axis.values.map((value) => <AddGuide key={`${entry.ref}-${value}`} entry={entry} axis={value} />);
  if (takes(entry, 'guide')) return <GuideList key={entry.ref} entry={entry} />;
  const grid = entry.door.args.grid;
  if (drawnAsOf(entry) === 'field' && typeof grid === 'string' && takes(entry, 'setting'))
    return (
      <div key={entry.ref} className="guides-grids__fields">
        {settingsOf(grid).map(([setting, facts]) => (
          <GridField key={setting} entry={entry} grid={grid as GridName} setting={setting} labelKey={facts.labelKey} />
        ))}
      </div>
    );
  return <DoorControl key={entry.ref} entry={entry} ready={ready(entry)} className="guides-grids__switch" />;
}

export function GuidesGridsDialog() {
  const t = useT();
  const open = useEditorState((s) => s.ui.dialog === DIALOG);
  if (!open) return null;
  return (
    <ModalDialog region={REGION} titleKey="panel.guidesGrids" className="guides-grids">
      <div className="dialog__body">
        {GROUPS.map((group, i) => {
          const section = SECTIONS[i];
          return (
            <section key={group[0]?.ref ?? i} className="guides-grids__section">
              {section !== undefined ? (
                <h3 className="guides-grids__title" title={t(section.hint)}>
                  {t(section.title)}
                </h3>
              ) : null}
              <div className="guides-grids__controls">{group.map((entry) => control(entry))}</div>
            </section>
          );
        })}
      </div>
    </ModalDialog>
  );
}
