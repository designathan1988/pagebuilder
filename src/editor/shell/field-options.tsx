// The values a text field offers, behind a button of their own beside it (a Settings field: a button's type, an
// input's type, a rel): pressed, they open in a list under the field, every one of them, and a value picked is kept
// through the field's own `choose`. A datalist hid them: its arrow showed only while the field had the focus, and it
// listed only the values matching what the field already held (panel-field.tsx says the same of the panel fields).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../doors/door.tsx';
import { useT } from '../text.ts';
import { followBelow, type Placed } from './float.ts';

export function FieldOptions({
  field,
  options,
  current,
  label,
  disabled,
  choose,
}: {
  readonly field: RefObject<HTMLElement | null>;
  readonly options: readonly string[];
  readonly current: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly choose: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [at, setAt] = useState<Placed | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    setActive(-1);
    setAt(null);
  };
  useLayoutEffect(() => {
    const anchor = field.current;
    const panel = list.current;
    if (!open || anchor === null || panel === null) return undefined;
    const edge = parseFloat(getComputedStyle(panel).getPropertyValue('--space-4')) || 0;
    return followBelow(anchor, panel, edge, 2, setAt);
  }, [open, field]);
  // open, the list closes on a press outside it and its button, and on Escape (the panel around it stays); the arrows
  // walk it and Enter keeps the value they stand on
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const at = event.target instanceof Node ? event.target : null;
      if (at !== null && (list.current?.contains(at) === true || button.current?.contains(at) === true)) return;
      close();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const last = options.length - 1;
        setActive((was) => (event.key === 'ArrowDown' ? (was >= last ? 0 : was + 1) : was <= 0 ? last : was - 1));
      } else if (event.key === 'Enter' && active >= 0 && active < options.length) {
        event.preventDefault();
        close();
        choose(options[active] as string);
      }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keys, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', keys, true);
    };
  });
  return (
    <>
      <button
        ref={button}
        type="button"
        className="settings-field__picker"
        aria-label={t('panelField.showOptions')}
        title={t('panelField.showOptions')}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="chevron-down" size="sm" />
      </button>
      {open
        ? createPortal(
            <div
              ref={list}
              className="menu panel-field__options"
              role="listbox"
              aria-label={label}
              style={at === null ? { position: 'fixed', visibility: 'hidden', left: 0, top: 0, minWidth: field.current?.offsetWidth } : { position: 'fixed', left: at.left, top: at.top, maxHeight: at.maxHeight, overflowY: 'auto', minWidth: field.current?.offsetWidth }}
            >
              {options.map((one, index) => (
                <div
                  key={one}
                  role="option"
                  aria-selected={one === current}
                  className={`panel-field__option${index === active ? ' is-active' : ''}${one === current ? ' is-current' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    close();
                    choose(one);
                  }}
                >
                  {one}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
