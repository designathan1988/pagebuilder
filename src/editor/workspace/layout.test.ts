import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../app/commands.ts';
import { isBuilt, type RegisteredHandler } from '../../core/commands/registry.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { CommandId } from '../../generated/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import type { EditorUi } from '../state.ts';
import { createEditorStore } from '../store.ts';
import { INSPECTOR_TABS, inspectorTab } from './layout.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => undefined });
const store = () => createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
// whether a door with these arguments stands for the tab its group shows (the command's `current`)
function current(s: ReturnType<typeof store>, args: Readonly<Record<string, unknown>>): boolean {
  const handler = COMMANDS['workspace.setActiveTab'];
  if (!isBuilt(handler)) throw new Error('workspace.setActiveTab is not built');
  return (handler as RegisteredHandler<CommandId, EditorUi>).current?.(s.getState(), args) ?? false;
}

describe('the active tab of a tab group (workspace/layout.ts)', () => {
  it("shows the inspector's tabs in the header's order, Style first", () => {
    expect(INSPECTOR_TABS).toEqual(['style', 'settings', 'interactions', 'logic']);
    expect(inspectorTab(store().getState().ui)).toBe('style');
  });

  it('shows the inspector tab its door names, keeps it when the selection changes, and records nothing', () => {
    const s = store();
    const before = s.getState();
    s.dispatch('workspace.setActiveTab', { group: 'inspector', panel: 'settings' });
    expect(inspectorTab(s.getState().ui)).toBe('settings');
    expect(current(s, { group: 'inspector', panel: 'settings' })).toBe(true);
    expect(current(s, { group: 'inspector', panel: 'style' })).toBe(false);
    const root = s.getState().document.pages[0]?.tree.id ?? '';
    s.dispatch('selection.select', { target: root });
    expect(inspectorTab(s.getState().ui)).toBe('settings');
    s.dispatch('workspace.setActiveTab', { group: 'inspector', panel: 'style' });
    expect(inspectorTab(s.getState().ui)).toBe('style');
    expect(s.getState().ui.layout).toEqual({ dock: 'collapsed', activeDockTab: 'timeline' });
    expect(s.getState().document).toBe(before.document);
    expect(s.getState().history).toBe(before.history);
  });

  it('shows a dock tab, opening a collapsed dock, and stands for it while the dock shows it', () => {
    const s = store();
    expect(current(s, { group: 'workbench', panel: 'timeline' })).toBe(false);
    s.dispatch('workspace.setActiveTab', { group: 'workbench', panel: 'checks' });
    expect(s.getState().ui.layout).toEqual({ dock: 'open', activeDockTab: 'checks' });
    expect(current(s, { group: 'workbench', panel: 'checks' })).toBe(true);
    expect(current(s, { group: 'workbench', panel: 'timeline' })).toBe(false);
  });

  // a tab its group does not have, or a group that is none, is refused with words, never thrown (AUD-09)
  it('takes only a tab its group has', () => {
    const s = store();
    const said = (args: { group: string; panel: string }) => {
      const answer = s.dispatch('workspace.setActiveTab', args as never);
      return [answer.status, s.getState().message?.key, s.getState().message?.params.argument];
    };
    expect(said({ group: 'inspector', panel: 'nope' })).toEqual(['refused', 'status.args.invalid', 'panel']);
    expect(said({ group: 'workbench', panel: 'shortcuts' })).toEqual(['refused', 'status.args.invalid', 'panel']);
    expect(said({ group: 'nope', panel: 'style' })).toEqual(['refused', 'status.stale', undefined]);
    expect(inspectorTab(s.getState().ui)).toBe('style');
  });
});
