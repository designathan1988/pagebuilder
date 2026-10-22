// The editor's dialogs (spec workspace-settings-dialog): View › Guides & Grids opens
// the Guides & Grids dialog (the Snap settings dialog belongs to snap-toggle-settings). One dialog is open at a time,
// held by the editor state (ui.dialog); opening one changes nothing in the document and records nothing. Escape and
// the dialog's close button close it (ui.dismiss, src/editor/menus/overlays.ts).
// The batch rename's dialog opens only on a selection the batch can rename (spec batch-rename): with the page root or a
// locked element among the selected, the renamer's own refusal comes at once, so the context menu, which offers only
// what applies, does not offer it (it was offered on the page alone, and its dialog could only refuse).
import { message, registerHandler, type HandlerContext } from '../../core/commands/registry.ts';
import { renameBatch } from '../../core/export/authoring.ts';
import type { EditorUi } from '../state.ts';

const BATCH_RENAME = 'batch-rename';

export const openDialog = registerHandler<'workspace.openDialog', EditorUi>('workspace.openDialog', (context, { dialog }) => {
  const { state } = context;
  if (dialog === BATCH_RENAME) {
    if (state.selection.length === 0) return { kind: 'refused', message: message('refusal.nothingSelected') };
    // one element is renamed in place (Rename, F2): the context menu offered both side by side for a single card
    if (state.selection.length === 1) return { kind: 'refused', message: message('batchRename.needsSeveral') };
    // each selected element keeping its own name: refused exactly where a batch would be
    const outcome = renameBatch(context as unknown as HandlerContext<never>, state.selection, '{name}', 1);
    if (outcome.kind === 'refused') return outcome;
  }
  return { kind: 'change', ui: { ...state.ui, dialog } };
});
