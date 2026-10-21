import { describe, expect, it } from 'vitest';
import { bindingFor, bindingGroups, chordCap, chordHint, chordOf, heldKeyBinding, waitsForChoice } from './keymap.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { manifest } from '../../manifest/runtime.ts';

const key = (init: Partial<KeyboardEvent> & { key: string; code: string }): KeyboardEvent =>
  ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

describe('the keymap', () => {
  it('reads a key press as the chord the manifest writes', () => {
    expect(chordOf(key({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('Ctrl+Z');
    expect(chordOf(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    // on Windows Ctrl+Alt is AltGr: the physical key still names the letter
    expect(chordOf(key({ key: '∫', code: 'KeyB', ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+B');
    expect(chordOf(key({ key: '\\', code: 'Backslash', ctrlKey: true }))).toBe('Ctrl+\\');
    // "+" is typed with Shift: the character carries the Shift
    expect(chordOf(key({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }))).toBe('Ctrl++');
  });

  it('runs the shortcut doors of the manifest in the global context', () => {
    expect(bindingFor('global', 'Ctrl+Z')?.command.id).toBe('history.undo');
    expect(bindingFor('global', 'Ctrl+Shift+Z')?.command.id).toBe('history.redo');
    expect(bindingFor('global', 'Ctrl+Y')?.command.id).toBe('history.redo');
    expect(bindingFor('global', 'Ctrl+B')?.command.id).toBe('workspace.toggleLeftDock');
    expect(bindingFor('global', 'Ctrl+Alt+B')?.command.id).toBe('workspace.toggleInspector');
    expect(bindingFor('global', 'Ctrl+\\')?.command.id).toBe('workspace.collapseDocks');
  });

  it('lets a context inherit only what interactions.json says: a field keeps its own keys but the workspace ones, text editing its own', () => {
    expect(bindingFor('canvas', 'Ctrl+B')?.command.id).toBe('workspace.toggleLeftDock');
    // the workspace's keys act from a plain text field too (the user's decision of 2026-10-02); its other keys are its
    // own
    expect(bindingFor('field', 'Ctrl+B')?.command.id).toBe('workspace.toggleLeftDock');
    expect(bindingFor('field', 'Ctrl+Z')).toBeNull();
    // while editing text Ctrl+B is Bold, never the sidebar
    expect(bindingFor('text-editing', 'Ctrl+B')?.command.id).toBe('text.toggleBold');
    expect(bindingFor('text-editing', 'Ctrl+K')?.command.id).toBe('text.editLink');
    expect(bindingFor('text-editing', 'Ctrl+Shift+K')?.command.id).toBe('commandBar.open');
  });

  it('keeps a number field’s keys in the field, and runs its arrows with the keys their gesture gives a meaning', () => {
    expect(bindingFor('number-field', 'Enter')?.command.id).toBe('style.set');
    expect(bindingFor('number-field', 'Escape')?.command.id).toBe('field.cancel');
    // Delete, Backspace and Ctrl+Z are the input's own: no door of the canvas or of the history
    expect(bindingFor('number-field', 'Delete')).toBeNull();
    expect(bindingFor('number-field', 'Backspace')).toBeNull();
    expect(bindingFor('number-field', 'Ctrl+Z')).toBeNull();
    const shiftUp = heldKeyBinding('number-field', key({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: true }));
    expect([shiftUp?.entry.ref, shiftUp?.modifier]).toEqual(['field.step#key-arrow-up-in-number-field', 'Shift']);
    expect(heldKeyBinding('number-field', key({ key: 'ArrowDown', code: 'ArrowDown', altKey: true }))?.modifier).toBe('Alt');
    // Shift and Alt held together step plainly, as the wheel and the step buttons do (stepModifier, INPUT-8)
    const both = heldKeyBinding('number-field', key({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: true, altKey: true }));
    expect([both?.entry.ref, both?.modifier]).toEqual(['field.step#key-arrow-up-in-number-field', null]);
    // a key the gesture gives no meaning, alone or with one it does, or a door without a gesture: nothing
    expect(heldKeyBinding('number-field', key({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true }))).toBeNull();
    expect(heldKeyBinding('number-field', key({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(heldKeyBinding('number-field', key({ key: 'PageUp', code: 'PageUp', shiftKey: true }))).toBeNull();
  });

  it('makes every key of the canvas, and every key that changes the document, wait for the canvas to be chosen on a focus lost to the page (INPUT-4)', () => {
    const at = (context: string, chord: string) => {
      const entry = bindingFor(context as Parameters<typeof bindingFor>[0], chord);
      if (entry === null) throw new Error(`no binding for ${chord} in ${context}`);
      return entry;
    };
    expect(waitsForChoice(at('canvas', 'Backspace'), 'Backspace')).toBe(true);
    expect(waitsForChoice(at('canvas', 'Ctrl+A'), 'a')).toBe(true);
    expect(waitsForChoice(at('canvas', 'Enter'), 'Enter')).toBe(true);
    expect(waitsForChoice(at('canvas', 'Ctrl+D'), 'd')).toBe(true);
    expect(waitsForChoice(at('canvas', 'Ctrl+X'), 'x')).toBe(true);
    // Escape chooses the canvas again; the history, the command bar and the regions' keys never wait
    expect(waitsForChoice(at('canvas', 'Escape'), 'Escape')).toBe(false);
    expect(waitsForChoice(at('canvas', 'Ctrl+Z'), 'z')).toBe(false);
    expect(waitsForChoice(at('canvas', 'Ctrl+K'), 'k')).toBe(false);
    expect(waitsForChoice(at('canvas', 'F6'), 'F6')).toBe(false);
  });

  it('shows a command’s global shortcut as its hint', () => {
    expect(chordHint('history.undo')).toBe('Ctrl+Z');
    expect(chordHint('workspace.collapseDocks')).toBe('Ctrl+\\');
    expect(chordHint('preferences.setTheme')).toBeNull();
  });

  it('shows the shortcut of the context a control acts in, or of a context it inherits', () => {
    expect(chordHint('element.moveUp')).toBeNull();
    expect(chordHint('element.moveUp', 'canvas')).toBe('Alt+ArrowUp');
    expect(chordHint('element.delete', 'canvas')).toBe('Delete');
    expect(chordHint('history.undo', 'canvas')).toBe('Ctrl+Z');
  });
  it('shows an arrow key on its key cap as an arrow and Escape as Esc, every other key by its name', () => {
    expect(chordCap('Alt+ArrowUp')).toBe('Alt+↑');
    expect(chordCap('Alt+Shift+ArrowLeft')).toBe('Alt+Shift+←');
    expect(chordCap('ArrowDown')).toBe('↓');
    expect(chordCap('Ctrl+Shift+K')).toBe('Ctrl+Shift+K');
    expect(chordCap('Escape')).toBe('Esc');
  });
  it('lists every binding of the keymap by its context, and a binding added to the keymap appears without another edit', () => {
    const shortcuts = manifest.doors.filter((d) => d.door.kind === 'shortcut');
    const groups = bindingGroups();
    const listed = groups.flatMap((group) => group.bindings.map((binding) => binding.ref));
    // every binding of the manifest is listed once, and the groups come in the order interactions.json declares the
    // contexts
    expect([...listed].sort()).toEqual(shortcuts.map((entry) => entry.ref).sort());
    const ids = manifest.interactions.keyContexts.map((context) => context.id as string);
    const order = groups.map((group) => ids.indexOf(group.context));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // every row carries the chord the manifest writes and the command's label
    expect(groups.flatMap((group) => group.bindings).find((binding) => binding.chord === 'Ctrl+Z')?.labelKey).toBe('command.undo');
    // a binding the keymap gains is listed at once, under its own context (the panel reads this table, no other list)
    const first = shortcuts[0] as DoorEntry;
    const extra = { ...first, ref: 'history.redo#key-ctrl-y-in-global' } as unknown as DoorEntry;
    const withExtra = bindingGroups([...shortcuts, { ...extra, door: { ...first.door, chord: 'Ctrl+F13', context: 'global', labelKey: 'command.redo' } } as unknown as DoorEntry]);
    expect(withExtra.flatMap((group) => group.bindings).find((binding) => binding.chord === 'Ctrl+F13')?.labelKey).toBe('command.redo');
  });
});
