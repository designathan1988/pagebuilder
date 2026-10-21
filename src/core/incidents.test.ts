// The incident feed (the plan's T2): bounded, readable, and it tells whoever listens. It is what the status bar's
// badge, the test port and the browser checks read — an error nobody watched for still shows up somewhere.
import { describe, expect, it } from 'vitest';
import { clearIncidents, incidents, onIncident, reportError, reportInvariantBreach, reportSelfChecks } from './incidents.ts';
import type { DocNode, DocumentJson } from './document/model.ts';

describe('the incident feed', () => {
  it('records what it is told, and tells its listeners', () => {
    clearIncidents();
    let told = 0;
    const off = onIncident(() => (told += 1));
    expect(incidents()).toEqual([]);
    reportInvariantBreach('element.insert', [{ path: '/pages/0/tree/children/0', message: 'id n1 is already used' }]);
    expect(incidents()).toEqual([{ kind: 'invariant', what: 'commit "element.insert" left a document the model refuses', detail: '/pages/0/tree/children/0: id n1 is already used' }]);
    reportError('the page threw', 'Error: boom');
    expect(incidents().length).toBe(2);
    expect(incidents()[1]?.kind).toBe('error');
    expect(told).toBe(2);
    off();
    reportError('after the listener left', 'still recorded');
    expect(told).toBe(2);
    expect(incidents().length).toBe(3);
  });

  it('keeps the newest fifty, and clears', () => {
    clearIncidents();
    for (let i = 0; i < 60; i += 1) reportError(`error ${i}`, 'detail');
    expect(incidents().length).toBe(50);
    expect(incidents()[0]?.what).toBe('error 10');
    clearIncidents();
    expect(incidents()).toEqual([]);
  });

  it('records a page whose two elements share an HTML id once, when a change makes it', () => {
    clearIncidents();
    const box = (id: string, htmlId: string): DocNode => ({ id, type: 'div', name: id, tag: 'div', attributes: { id: htmlId }, classes: [], styles: {}, text: null, children: [] });
    const project = (children: DocNode[]): DocumentJson => ({ version: 1, language: 'en', pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: { ...box('Page', ''), type: 'page', tag: 'body', attributes: {}, children } }] }) as unknown as DocumentJson;
    reportSelfChecks('element.insert', project([box('A', 'promo'), box('B', 'other')]));
    expect(incidents()).toEqual([]);
    reportSelfChecks('element.duplicate', project([box('A', 'promo'), box('B', 'promo')]));
    expect(incidents()).toEqual([{ kind: 'self-check', what: '"element.duplicate" left a document that breaks a rule of the app', detail: 'page index.html: A and B carry the same HTML id "promo"' }]);
    reportSelfChecks('text.set', project([box('A', 'promo'), box('B', 'promo')]));
    expect(incidents().length).toBe(1);
    reportSelfChecks('element.delete', project([box('A', 'promo')]));
  });
});
