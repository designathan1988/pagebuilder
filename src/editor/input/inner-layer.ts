// A layer inside a modal dialog (the Breakpoints dialog's trash menu, the Guides & Grids place field): Escape closes it
// alone, never the dialog under it. The dialog's Escape is ui.dismiss, which closes the dialog and every layer opened
// before the dismissal at once (menus/overlays.ts), so Escape in the trash menu closed the whole Breakpoints dialog
// (the input audit's INPUT-6). The keymap, the one owner of Escape, asks the innermost layer that holds the focus to
// close first (an event on the layer); the layer closes as its owner says (a popover's dismissal, a field's cancel) and
// gives the focus back to the control that opened it. With no such layer, Escape is the dialog's.
export const INNER_LAYER = 'data-inner-layer';
const DISMISS = 'inner-layer-dismiss';

// Asks the innermost layer around the focus to close: true when there was one (the key is then that layer's).
export function dismissInnerLayer(target: EventTarget | null): boolean {
  const layer = target instanceof Element ? target.closest(`[${INNER_LAYER}]`) : null;
  if (layer === null) return false;
  layer.dispatchEvent(new Event(DISMISS));
  return true;
}

// A layer closes itself when asked; the returned function stops listening.
export function onInnerLayerDismiss(layer: HTMLElement, close: () => void): () => void {
  layer.addEventListener(DISMISS, close);
  return () => layer.removeEventListener(DISMISS, close);
}
