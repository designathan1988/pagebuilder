// Every document a source file cites by name exists (the audit's AUD-30: 347 comments still cited the architecture,
// design and progress documents after 2b93e68 folded them away and deleted them, so a reader followed them to nothing;
// they are kept whole in docs/archive/, each saying where its content went). A cited name resolves from the
// repository's root, from docs/, or from the citing file's own folder; the working memory (.memory/, never versioned)
// is no document a source may send a reader to. A name right after a quote is code (a path joined from parts), not a
// citation.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'tools', 'tests'];
// the configuration files at the root, which cite documents too
const CONFIGS = fs.readdirSync('.').filter((name) => /\.config\.(js|ts|mjs)$/u.test(name));
const SOURCE = /\.(ts|tsx|css|mjs|cjs)$/u;
// a name ending in .md, with the folders written before it, not inside a longer word, path or quoted string
const CITED = /(?<![\w/.'"`-])((?:\.{1,2}\/)*[\w./-]*[\w-]\.md)(?![\w])/gu;

function sources(folder: string): string[] {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(at);
    return SOURCE.test(entry.name) ? [at] : [];
  });
}

const resolves = (file: string, name: string): boolean =>
  !name.startsWith('.memory/') && [name, path.join('docs', name), path.join('auditoria', name), path.join('manifest', 'generated', name), path.join(path.dirname(file), name)].some((candidate) => fs.existsSync(candidate));

describe('the documents the sources cite', () => {
  it('exist where a reader looks for them', () => {
    const missing: string[] = [];
    for (const file of [...ROOTS.flatMap(sources), ...CONFIGS]) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const match of line.matchAll(CITED)) {
          const name = match[1] ?? '';
          if (!resolves(file, name)) missing.push(`${file.replaceAll('\\', '/')}:${String(index + 1)} ${name}`);
        }
      });
    }
    expect(missing).toEqual([]);
  });
});
