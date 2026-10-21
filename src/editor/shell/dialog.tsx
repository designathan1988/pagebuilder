// A modal dialog of the editor (dialog; spec workspace-settings-dialog): open while the
// editor state names it (ui.dialog, workspace/dialogs.ts), drawn centred over a scrim, titled, with the close button of
// the dialog region in its header (ui.dismiss). It takes the focus when it opens, keeps Tab inside it, names the dialog
// key context (Escape closes it: ui.dismiss) and, when it closes, gives the focus back to what opened it: the control,
// or the button of the menu whose item did.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import type { FeatureId, MessageId, RegionId } from '../../generated/ids.ts';
import { DoorControl } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { useT } from '../text.ts';

const CLOSE = doorSlots('dialog')[0];
// the key context of a dialog, its fields' too: Escape closes the dialog wherever its focus is
export const DIALOG_KEYS = 'dialog';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalDialog({ region, titleKey, className, children }: { readonly region: RegionId; readonly titleKey: MessageId; readonly className: string; readonly children: ReactNode }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  // Where the focus goes back when the dialog closes. Read on the first render, while the page still shows what opened
  // it: by the time the dialog is on the page, a menu and its item are gone.
  const [returnTo] = useState<Element | null>(() => {
    const before = document.activeElement;
    return before?.closest('.menu-anchor')?.querySelector('.menu-button') ?? before;
  });
  useEffect(() => {
    // the field the dialog marks data-autofocus takes the focus, else the dialog itself: the panel alone left "Open a
    // web address" with its address field empty while the person typed (DEF-0617)
    (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current)?.focus();
    return () => {
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, [returnTo]);
  const title = `${region}-title`;
  return (
    <div className="dialog-shield">
      <FocusEdge layer={panel} sends="last" />
      <div className={`dialog ${className}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} data-region={region} data-key-context={DIALOG_KEYS}>
        <header className="dialog__header">
          <h2 className="dialog__title" id={title}>
            {t(titleKey)}
          </h2>
          {CLOSE !== undefined ? <DoorControl entry={CLOSE} ready={isFeatureBuilt(CLOSE.door.feature as FeatureId)} /> : null}
        </header>
        {children}
      </div>
      <FocusEdge layer={panel} sends="first" />
    </div>
  );
}

// An edge of a modal layer (a dialog, the command bar): the focus stays in the layer. Tab past its last control lands
// on the edge after it, which sends the focus to its first control, and Shift+Tab before its first on the edge before
// it, which sends it to its last. Every layer marked aria-modal draws one on each side (the input audit's INPUT-10: the
// command bar had none, and Tab past its pills reached the editor under it).
export function FocusEdge({ layer, sends }: { readonly layer: RefObject<HTMLElement | null>; readonly sends: 'first' | 'last' }) {
  const wrap = () => {
    const items = [...(layer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    (sends === 'first' ? items[0] : items[items.length - 1])?.focus();
  };
  return <span tabIndex={0} data-edge={sends} onFocus={wrap} />;
}
