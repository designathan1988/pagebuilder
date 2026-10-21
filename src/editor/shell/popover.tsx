// The popover (the audit's CSS-2 and S-002: seven popups each placed, closed and focused its own way): a layer that
// floats next to the control that opened it, drawn over the whole window from the document's body so no panel that
// clips its content cuts it. Its parts are the one answer for every such layer:
// - where it is drawn: float.ts floatBelow, under its anchor and always inside the window;
// - how it closes: outside-layer observes outside presses without consuming them; Escape is a dismissal;
// - where the focus goes: into the layer once it is placed (the element marked data-autofocus, else its first field or
//   button), and back to the control that opened it when a dismissal took the focus down with it.
// What the layer holds (a form, a list, a filter) and what it runs are its owner's.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { KeyContextId } from '../../generated/ids.ts';
import { useEditorState } from '../store.ts';
import { useOutsideLayer } from './outside-layer.ts';
import { floatBelow, type Placed } from './float.ts';

export interface PopoverState {
  readonly open: boolean;
  readonly setOpen: (next: boolean | ((was: boolean) => boolean)) => void;
}

// A layer's opening, owned by the component that draws its trigger: open until a dismissal newer than the opening
// (Escape or another layer's opening that dismisses) closes it; a dismissed layer gives the focus back to
// its trigger when the focus went down with it.
export function usePopover(trigger: RefObject<HTMLElement | null>): PopoverState {
  const dismissals = useEditorState((s) => s.ui.overlays.dismissals);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt !== null && openedAt === dismissals;
  const dismissed = openedAt !== null && !open;
  useEffect(() => {
    if (dismissed && (document.activeElement === null || document.activeElement === document.body)) trigger.current?.focus();
  }, [dismissed, trigger]);
  const setOpen = (next: boolean | ((was: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    setOpenedAt(value ? dismissals : null);
  };
  return { open, setOpen };
}

const FOCUSABLE = '[data-autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), [tabindex="0"]';

export interface PopoverProps {
  // the control the layer floats next to
  readonly anchor: RefObject<HTMLElement | null>;
  readonly className: string;
  readonly children: ReactNode;
  // what the layer is to assistive technology: a dialog (a form, a list with its filter) by default
  readonly role?: 'dialog' | 'listbox' | 'menu';
  readonly label: string;
  // the key context of the layer: its keys (Escape dismisses in both) — a form is a dialog, a list of items a menu
  readonly keyContext?: KeyContextId;
  // the pixels between the anchor and the layer
  readonly gap?: 'none' | 'small';
  // false when the owner puts the focus itself (a filter that takes it as the list opens)
  readonly takesFocus?: boolean;
  readonly as?: 'div' | 'form';
  readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly onDismiss: () => void;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export function Popover({ anchor, className, children, role = 'dialog', label, keyContext = 'dialog' as KeyContextId, gap = 'small', takesFocus = true, as = 'div', onSubmit, onClick, onDismiss }: PopoverProps) {
  const own = useRef<HTMLElement | null>(null);
  useOutsideLayer(own, true, onDismiss, anchor);
  const [at, setAt] = useState<Placed | null>(null);
  useLayoutEffect(() => {
    const from = anchor.current?.getBoundingClientRect();
    const panel = own.current;
    if (!from || !panel) return;
    const style = getComputedStyle(panel);
    const edge = parseFloat(style.getPropertyValue('--space-4')) || 0;
    const space = gap === 'small' ? parseFloat(style.getPropertyValue('--space-2')) || 0 : 0;
    const { width, height } = panel.getBoundingClientRect();
    setAt(floatBelow(from, { width, height }, { width: window.innerWidth, height: window.innerHeight }, edge, space));
  }, [anchor, gap]);
  // the focus goes into the layer once it is placed (hidden while it is measured, it could take none): to the control
  // the layer marks data-autofocus, else its first; the first alone put "+ Class" on the list of classes above its
  // field, and the name typed was lost (DEF-0616)
  const placed = at !== null;
  useLayoutEffect(() => {
    if (placed && takesFocus) (own.current?.querySelector<HTMLElement>('[data-autofocus]') ?? own.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  }, [placed, takesFocus]);
  const style: CSSProperties = at === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: at.left, top: at.top };
  // a layer opened from a modal dialog floats over it (the Breakpoints dialog's trash menu), else under every dialog
  const overDialog = anchor.current?.closest('[aria-modal="true"]') !== null && anchor.current !== null;
  const common = { className: `popover${overDialog ? ' popover--over-dialog' : ''} ${className}`, role, 'aria-label': label, 'data-key-context': keyContext, style, onClick };
  return createPortal(
    <div className="popover-layer">
      {as === 'form' ? (
        <form ref={own as RefObject<HTMLFormElement | null>} {...common} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div ref={own as RefObject<HTMLDivElement | null>} {...common}>
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
}
