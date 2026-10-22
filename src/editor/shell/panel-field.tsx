// A panel's text field (the timeline's settings and name fields, an interaction's card fields): the control of a
// panel-control door drawn as a field. The door's data (its label, the values it offers, the arguments it fixes) comes
// from the manifest; the text it holds is the one argument of its command that neither the door nor the drawing gives
// (textArgument: the command's manifest contract). The field is a form of one input, so Enter submits it and runs the
// door with what it holds; what the document holds is shown again as soon as the field is left. The values the door
// offers open in a list under the field, by its arrow, a click in it or Arrow down: every value while the field shows
// the document's, the ones matching what is typed while typing; a value picked is kept at once. (A datalist hid them:
// its arrow showed only in focus and it listed only what matched the value already there, so "Show" offered "Show".)
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { EditContext } from '../../core/store/store.ts';
import type { CommandId } from '../../generated/ids.ts';
import { heldDraft, type HeldDraft } from '../input/held-draft.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { useStore } from '../store.ts';
import { isDoorBuilt, useDoor } from '../doors/door.tsx';
import { EasingCurveButton } from './easing-curve.tsx';
import { followBelow, type Placed } from './float.ts';
import { Icon } from '../doors/door.tsx';
import { useT } from '../text.ts';

// The one argument a door's text goes in: the argument its command declares that neither the door fixes (its own
// `args`) nor the drawing gives. A command whose fields do not come to exactly one is a defect of the manifest.
function textArgument(entry: DoorEntry, given: Readonly<Record<string, unknown>>): string | null {
  const free = Object.keys(entry.command.args).filter((name) => !(name in entry.door.args) && !(name in given));
  return free.length === 1 ? (free[0] as string) : null;
}

// The values a door's field offers, from the manifest: the generated list of the property its adapter offers (a
// timeline setting: the keywords of animation-duration and its siblings); a list the door does not offer has none (the
// drawing site passes the enum its own command declares).
export function offeredValues(entry: DoorEntry): readonly string[] {
  const offered = entry.door.adapter?.offers;
  if (offered === null || offered === undefined) return [];
  const list = GENERATED_VALUES[offered.property as never] as { readonly keywords: readonly string[] } | undefined;
  return list?.keywords ?? [];
}

export function PanelField({
  entry,
  args = {},
  value,
  offered,
  label,
  disabled = false,
  autoFocus = false,
  placeholder,
  display,
  accept,
  onDone,
  curve = false,
  inputType = 'text',
}: {
  readonly entry: DoorEntry;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly value: string;
  readonly offered?: readonly string[] | undefined;
  readonly label: string;
  readonly disabled?: boolean;
  // a field a control just opened takes the focus (New animation's name field)
  readonly autoFocus?: boolean;
  // what an empty value means, said inside the field (an interaction's scope: this element)
  readonly placeholder?: string;
  // a value shown in words (an interaction's trigger: "Click" for click), and the value a typed text stands for (the
  // value itself, or its words, in any case); the offered values are listed in their words
  readonly display?: (value: string) => string;
  readonly accept?: (typed: string) => string;
  readonly onDone?: () => void;
  // the field holds an easing: a button beside it draws the easing's curve and chooses another (easing-curve.tsx)
  readonly curve?: boolean;
  // the browser's own input for the value: a date and time is picked from its calendar (a countdown's end), not
  // typed in a format
  readonly inputType?: 'text' | 'datetime-local';
}) {
  const door = useDoor(entry, args, label);
  const store = useStore();
  const [draft, setDraft] = useState(value);
  const [edited, setEdited] = useState(false);
  // A name for something new (a new animation: the document holds no value for the field) refused by the command stays
  // in the field, marked, to be mended: there is no value of the document to show again, and the field went empty,
  // what was typed lost (DEF-0607; decisoes.md, DCS-032). A field with a value of the document shows it again after a
  // refusal (the audit's FD2).
  const [invalid, setInvalid] = useState(false);
  const refusedNow = useRef(false);
  const newName = value === '';
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  // the text typed now, for the keep the registry runs outside a render (a press elsewhere, the focus leaving)
  const typed = useRef(value);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const list = offered ?? [];
  const id = `panel-field-${entry.ref.replaceAll('#', '-')}-${String(args.animation ?? args.interaction ?? '')}`;
  const t = useT();
  // the list of the offered values: open or not, the option the arrows stand on, and where it floats
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [at, setAt] = useState<Placed | null>(null);
  const options = useRef<HTMLDivElement>(null);
  const words = (one: string): string => (display === undefined ? one : display(one));
  const query = edited ? draft.trim().toLowerCase() : '';
  const choices = query === '' ? list : list.filter((one) => words(one).toLowerCase().includes(query) || one.toLowerCase().includes(query));
  const showList = listOpen && choices.length > 0;
  useLayoutEffect(() => {
    const anchor = input.current;
    const panel = options.current;
    if (!showList || anchor === null || panel === null) return undefined;
    const edge = parseFloat(getComputedStyle(panel).getPropertyValue('--space-4')) || 0;
    return followBelow(anchor, panel, edge, 2, setAt);
  }, [showList]);
  const closeList = () => {
    setListOpen(false);
    setActive(-1);
    setAt(null);
  };
  const optionsId = `${id}-options`;
  // the door run with a text in its free argument (typed and kept, or a curve chosen beside the field), in the context
  // the typing began in when the registry keeps it
  // whether the command refused the text
  const runWith = (chosen: string, context?: EditContext): boolean => {
    const argument = textArgument(entry, args);
    if (argument === null || chosen === value) return false;
    const outcome = (store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args, [argument]: chosen }, context);
    if (outcome.status === 'done') onDone?.();
    return outcome.status === 'refused';
  };
  // the typing is held in the one registry of typing (input/held-draft.ts, rule G2): a press elsewhere, a command from
  // outside, the focus leaving or the field going keep it; what the document holds shows again once it is kept
  const keepHeld = useRef<(context: EditContext) => void>(() => undefined);
  useEffect(() => {
    keepHeld.current = (context) => {
      const refused = runWith(accept === undefined ? typed.current : accept(typed.current), context) && newName;
      refusedNow.current = refused;
      setInvalid(refused);
      if (!refused) setEdited(false);
    };
  });
  const command = entry.command.id as CommandId;
  const held = useRef<HeldDraft | null>(null);
  useEffect(() => {
    const draft = heldDraft(store, input, row, command, keepHeld);
    held.current = draft;
    return () => {
      draft.left();
      held.current = null;
    };
  }, [store, command]);
  const keep = (event: FormEvent) => {
    event.preventDefault();
    // Enter is done with the list, as a choice from it is
    closeList();
    // nothing typed since the field last showed the document's value: nothing to keep (the draft is that old value)
    if (!edited) return;
    const refused = runWith(accept === undefined ? draft : accept(draft)) && newName;
    setInvalid(refused);
    if (refused) {
      input.current?.select();
      return;
    }
    setEdited(false);
    held.current?.done();
  };
  const ready = door.built && !disabled;
  // a value picked from the list is kept at once, as Enter keeps a typed one
  const choose = (one: string) => {
    closeList();
    const refused = runWith(one) && newName;
    setInvalid(refused);
    if (refused) return;
    setEdited(false);
    held.current?.done();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (list.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!listOpen) {
        setListOpen(true);
        setActive(0);
        return;
      }
      const last = choices.length - 1;
      setActive((was) => (event.key === 'ArrowDown' ? (was >= last ? 0 : was + 1) : was <= 0 ? last : was - 1));
    } else if (event.key === 'Enter' && showList && active >= 0 && active < choices.length) {
      event.preventDefault();
      choose(choices[active] as string);
    } else if (event.key === 'Escape' && showList) {
      // the list closes alone: the panel or the dialog around it stays
      event.preventDefault();
      event.stopPropagation();
      closeList();
    }
  };
  return (
    <div ref={row} className={`field-row panel-field${display === undefined ? '' : ' panel-field--words'}${ready ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify({ ...entry.door.args, ...args })} title={door.title}>
      <label className="field-row__label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <form className="panel-field__form" onSubmit={keep}>
        <input
          id={`${id}-input`}
          ref={input}
          className="panel-field__text"
          type={inputType}
          // a value (a class, an address, a duration), never prose: the browser's spelling marks are noise on it, as on
          // the inspector's fields
          spellCheck={false}
          // an empty value is nothing chosen yet: shown empty, never put into words (the placeholder says what it
          // means)
          value={edited ? draft : display === undefined || value === '' ? value : display(value)}
          // the value whole in the field's tooltip, for a value the field cannot hold (it ends in an ellipsis)
          title={value === '' ? undefined : display === undefined ? value : display(value)}
          placeholder={placeholder}
          disabled={!ready}
          role={list.length > 0 ? 'combobox' : undefined}
          aria-expanded={list.length > 0 ? showList : undefined}
          aria-autocomplete={list.length > 0 ? 'list' : undefined}
          // the list is part of the field (aria-controls: the field's own layer, rule G2)
          aria-controls={showList ? optionsId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${optionsId}-${String(active)}` : undefined}
          aria-invalid={invalid ? true : undefined}
          onClick={() => {
            if (list.length > 0 && ready) setListOpen(true);
          }}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setListOpen(true);
            setActive(-1);
            setInvalid(false);
            setEdited(true);
            setDraft(event.target.value);
            typed.current = event.target.value;
            held.current?.typed();
          }}
          // left, the typing is kept (rule G2, DEF-0514), and the document's value shows again (the audit's FD2)
          onBlur={() => {
            closeList();
            refusedNow.current = false;
            held.current?.left();
            if (!refusedNow.current) setEdited(false);
          }}
        />
        {/* the curve that applies: the value, else what the empty field shows it takes (its placeholder) */}
        {list.length > 0 ? (
          // the arrow says the field offers values, and opens or closes them (the focus stays in the field)
          <button
            type="button"
            className="panel-field__open"
            tabIndex={-1}
            aria-label={t('panelField.showOptions')}
            title={t('panelField.showOptions')}
            disabled={!ready}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              if (showList) closeList();
              else setListOpen(true);
            }}
          >
            <Icon name="chevron-down" size="sm" />
          </button>
        ) : null}
        {curve ? <EasingCurveButton value={value === '' && placeholder !== undefined ? placeholder : value} label={label} disabled={!ready} run={runWith} /> : null}
        <button type="submit" className="visually-hidden" tabIndex={-1}>
          {label}
        </button>
      </form>
      {showList
        ? createPortal(
            <div
              ref={options}
              id={optionsId}
              className="menu panel-field__options"
              role="listbox"
              aria-label={label}
              style={at === null ? { position: 'fixed', visibility: 'hidden', left: 0, top: 0, minWidth: input.current?.offsetWidth } : { position: 'fixed', left: at.left, top: at.top, maxHeight: at.maxHeight, overflowY: 'auto', minWidth: input.current?.offsetWidth }}
            >
              {choices.map((one, index) => (
                <div
                  key={one}
                  id={`${optionsId}-${String(index)}`}
                  role="option"
                  aria-selected={one === value}
                  className={`panel-field__option${index === active ? ' is-active' : ''}${one === value ? ' is-current' : ''}`}
                  // pressed, the field keeps the focus: the press is part of the field, not a leaving of it
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(one)}
                >
                  {words(one)}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// A panel's small button (a play control, a keyframe's actions): the control of a panel-control door drawn as it says
// (an icon button or a text button), the arguments the drawing gives beside the door's own.
export function PanelButton({
  entry,
  args = {},
  icon,
  label,
  pressed = null,
  disabled = false,
  onDone,
  children,
}: {
  readonly entry: DoorEntry;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly icon?: React.ReactNode;
  readonly label?: string;
  readonly pressed?: boolean | null;
  readonly disabled?: boolean;
  readonly onDone?: () => void;
  readonly children?: React.ReactNode;
}) {
  const door = useDoor(entry, args, label);
  const store = useStore();
  const ready = door.available && !disabled;
  return (
    <button
      type="button"
      className={`door ${pressed === null ? 'door--button' : 'door--toggle'}${ready ? '' : ' is-unavailable'}${pressed === true ? ' is-current' : ''}`}
      data-door={entry.ref}
      data-args={JSON.stringify({ ...entry.door.args, ...args })}
      aria-disabled={ready ? undefined : true}
      aria-pressed={pressed === null ? undefined : pressed}
      title={door.title}
      disabled={!isDoorBuilt(entry)}
      onClick={() => {
        if (!ready) return;
        const outcome = (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args });
        if (outcome.status === 'done') onDone?.();
      }}
    >
      {icon ?? null}
      <span className="door__label">{children ?? door.face}</span>
    </button>
  );
}
