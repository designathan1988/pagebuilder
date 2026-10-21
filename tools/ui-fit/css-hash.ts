// The key of a measurement of the interface's labels (manifest/generated/ui-widths.json): the hash of every stylesheet
// of the application, sorted, without its comments (a comment draws nothing, so rewording one keeps the measurement).
// One rule for the measurer (tools/ui-fit/measure.spec.ts), the check (tools/ui-fit/check.ts, which reads the
// stylesheets with the passage of the mutant under run swapped) and npm run verify, which says when the measurement is
// from other stylesheets. Light on purpose: nothing of the manifest is loaded.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const UI_WIDTHS = 'manifest/generated/ui-widths.json';

export function cssHash(root = '', read: (file: string, text: string) => string = (_file, text) => text): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(`${root}${dir}`, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) files.push(full);
    }
  };
  walk('src');
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) hash.update(`${file}\n${read(file.split(path.sep).join('/'), fs.readFileSync(`${root}${file}`, 'utf8')).replace(/\/\*[\s\S]*?\*\//gu, '')}`);
  return hash.digest('hex');
}

// whether ui-widths.json was measured with the stylesheets on the disk now
export function measurementIsCurrent(root = ''): boolean {
  const measured = JSON.parse(fs.readFileSync(`${root}${UI_WIDTHS}`, 'utf8')) as { readonly $generated?: { readonly css?: string } };
  return measured.$generated?.css === cssHash(root);
}
