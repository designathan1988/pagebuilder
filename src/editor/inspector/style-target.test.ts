import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { locate, type DocumentJson } from '../../core/document/model.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { anyCss } from '../../core/ports/css.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { styleClassOf } from './style-target.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
const editorStore = () => createEditorStore({ storage: memory(), clock: manualClock(0), ids: sequentialIds('t'), restored: { document: fixture as DocumentJson, selection: [] }, ports: { css: anyCss, readOnly: () => false } });

describe('the style target after a class is added (DCS-070)', () => {
  it('a class created by + Class becomes the target, and the next style write goes to it', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    expect(store.dispatch('classes.apply', { className: 'lead' }).status).toBe('done');
    expect(styleClassOf(store.getState())).toBe('lead');
    store.dispatch('style.set', { property: 'color', value: '#112233' });
    expect(store.getState().document.classes?.find((c) => c.name === 'lead')?.styles).toEqual({ desktop: { base: { color: '#112233' } } });
    expect(locate(store.getState().document, 'n-intro')?.node.styles.desktop?.base?.color).toBeUndefined();
  });

  it('a class the project already has leaves the target as it is', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('classes.apply', { className: 'card' });
    expect(styleClassOf(store.getState())).toBeNull();
    store.dispatch('selection.select', { target: 'n-title' });
    store.dispatch('classes.apply', { className: 'lead' });
    store.dispatch('selection.select', { target: 'n-intro' });
    store.dispatch('classes.apply', { className: 'lead' });
    expect(styleClassOf(store.getState())).toBeNull();
  });

  it('Save the styles as a class targets the new class', () => {
    const store = editorStore();
    store.dispatch('selection.select', { target: 'n-intro' });
    expect(store.dispatch('classes.create', { name: 'intro-text' }).status).toBe('done');
    expect(styleClassOf(store.getState())).toBe('intro-text');
  });
});
