// @vitest-environment jsdom
// A rich editable field of a site (contenteditable) shows its variable's markup made safe by DOMPurify
// (app-runtime/runtime.js safeHtml). jsdom, the DOM DOMPurify itself is tested on: happy-dom gives Node.prototype's
// nodeName getter no name, so DOMPurify, which reads names through that getter against clobbering, drops elements.
import { describe, expect, it } from 'vitest';
import { appRuntimeScript } from './script.ts';

interface Runtime {
  readonly state: Record<string, unknown>;
  start(config: object): Promise<void>;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// jsdom has no editing host (no contentEditable, no isContentEditable): read from the attribute as a browser does,
// so the runtime treats the field as the editable element it is in a page
if (!('isContentEditable' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'contentEditable', {
    get(this: HTMLElement) {
      const value = this.getAttribute('contenteditable');
      return value === null ? 'inherit' : value === '' ? 'true' : value;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
    get(this: HTMLElement) {
      return this.contentEditable === 'true' || this.contentEditable === 'plaintext-only';
    },
  });
}

// the field's markup once the runtime wrote `markup` into it
async function shown(markup: string): Promise<Element> {
  const runtime = (await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(`${appRuntimeScript()}\n// ${markup}`)}`)) as Runtime;
  document.body.innerHTML = '<div data-app="r" contenteditable="true"></div>';
  await runtime.start({
    variables: [{ name: 'note', type: 'text', initial: markup }],
    nodes: { r: { name: 'Rich', model: [(s: Record<string, unknown>) => s.note, (s: Record<string, unknown>, _l: unknown, v: unknown) => (s.note = v)] } },
  });
  await settle();
  const field = document.querySelector('[data-app="r"]');
  if (field === null) throw new Error('the field is gone');
  return field;
}

const RUNS = '[onerror], [onload], [onclick], script, style, iframe, object, embed, form, template, foreignObject';

describe('a rich editable field', () => {
  it('keeps the text markup and takes out what runs (LOGIC-5)', async () => {
    const field = await shown('<img src=x onerror=alert(1)><b>bold</b> <a href="https://example.com/">link</a>');
    expect(field.querySelector('b')?.textContent).toBe('bold');
    expect(field.querySelector('img')?.getAttribute('src')).toBe('x');
    expect(field.querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
    expect(field.querySelector(RUNS)).toBeNull();
  });

  it.each([
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
    '<template><img src=x onerror=alert(1)></template>',
  ])('runs nothing a re-parse would wake: %s', async (markup) => {
    expect((await shown(markup)).querySelector(RUNS)).toBeNull();
  });

  it('writes no address that runs code or opens a document', async () => {
    const field = await shown('<a href=" java\tscript:alert(1)">a</a><a href="vbscript:x">b</a><img src="data:text/html,<script>alert(1)</script>"><img src="data:image/png;base64,AAAA">');
    for (const link of field.querySelectorAll('a')) expect(link.hasAttribute('href')).toBe(false);
    const [opened, picture] = field.querySelectorAll('img');
    expect(opened?.hasAttribute('src')).toBe(false);
    expect(picture?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});
