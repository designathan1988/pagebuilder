// Where a link of the previewed page leads (previewGo): a page of the project, an item page written from a template,
// or nowhere new — the open page (scrolled to the fragment) or a page the project does not have.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DocumentJson } from '../../core/document/model.ts';
import { previewGo } from './preview.tsx';

const blog = (): DocumentJson => JSON.parse(fs.readFileSync('manifest/features/fixtures/content-blog.json', 'utf8')) as DocumentJson;

describe('a link of the previewed page', () => {
  it('goes to another page, and stays on the open page at its fragment', () => {
    const document = blog();
    const go = previewGo(document, 0, 'post.html');
    expect(go.goes && go.page.file).toBe('post.html');
    expect(previewGo(document, 0, 'index.html#contato')).toEqual({ goes: false, missing: false, fragment: 'contato' });
    expect(previewGo(document, 0, './index.html')).toEqual({ goes: false, missing: false, fragment: '' });
  });
  it('opens an item page as its template showing that item, and stays when the template already shows it', () => {
    const document = blog();
    const go = previewGo(document, 0, 'posts/uma-semana-em-lisboa.html');
    expect(go.goes ? [go.page.file, go.item] : null).toEqual(['post.html', 'p2']);
    expect(previewGo(document, 1, 'posts/bolo-de-cenoura.html#fim')).toEqual({ goes: false, missing: false, fragment: 'fim' });
  });
  it('stays, said missing, on a page the project does not have', () => {
    expect(previewGo(blog(), 0, 'nada.html')).toEqual({ goes: false, missing: true, fragment: '' });
    expect(previewGo(blog(), 0, 'posts/nada.html#x')).toEqual({ goes: false, missing: true, fragment: 'x' });
  });
});
