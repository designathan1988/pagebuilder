// What a run of the tests stands on: the paths whose contents change what the unit tests, the fast scenario runner and
// the browser tests execute. One list, read by every tool that asks "is this the tree that ran?":
// - the fast runner's record is valid for these contents (balance.ts);
// - the impact selector compares the tree with the snapshot of the last recorded run (tools/impact/).
// The files are read from the disk, never from a version-control system: the project may sit in a folder with no
// repository at all, and what a test runs is what is on the disk. Every other root path changes nothing a test runs
// (the documentation, the local configuration of the editor and the agents); a root path that is in neither list fails
// tools/runner/run-inputs.test.ts, so a new configuration file is placed on purpose.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RUN_INPUTS: readonly string[] = [
  'src',
  'tests',
  'manifest',
  'tools',
  'companion',
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'vite.proofs.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.core.json',
  'tsconfig.node.json',
];

// the root paths no test executes: documentation, the editor's and the agents' local configuration, the lint's own
// configuration (lint runs as its own step), the SaaS backend (saas/: its own tests and type checks, saas/README.md),
// and what the tools write (OUTPUTS)
export const NOT_INPUTS: readonly string[] = ['.claude', '.vscode', 'docs', 'README.md', 'CLAUDE.md', 'AGENTS.md', '.mcp.json', '.gitignore', '.gitattributes', '.git', 'eslint.config.js', '.dependency-cruiser.cjs', 'auditoria', 'PROMPT.md', 'claude-tarefa.md', 'deepseek-tarefa.md', 'deepseek-tarefa-1-feita.md', 'deepseek.ps1', 'prompt-teste-uso-real.md', 'saas'];

// folders the tools and the package manager write, at any depth: never an input
export const OUTPUTS: ReadonlySet<string> = new Set(['node_modules', 'dist', '.cache', '.playwright-mcp', 'test-results', 'playwright-report', 'coverage']);

// the input files on disk, relative to the root, with forward slashes, sorted
export function inputFiles(root: string = process.cwd()): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const full = path.join(root, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      return;
    }
    if (stat.isFile()) {
      out.push(rel.split(path.sep).join('/'));
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      if (OUTPUTS.has(entry.name)) continue;
      walk(path.join(rel, entry.name));
    }
  };
  for (const input of RUN_INPUTS) walk(input);
  return out.sort();
}

// The hash of each input file's contents, by path: what the impact selector compares a later tree with.
export function inputHashes(root: string = process.cwd()): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const file of inputFiles(root)) hashes.set(file, createHash('sha1').update(fs.readFileSync(path.join(root, file))).digest('hex'));
  return hashes;
}

// The inputs' contents: every input file's path and bytes. Two trees with the same inputs give the same fingerprint.
export function inputsFingerprint(root: string = process.cwd()): string {
  const hash = createHash('sha256');
  for (const [file, digest] of inputHashes(root)) hash.update(`\0${file}\0${digest}`);
  return hash.digest('hex');
}

// The input paths whose contents differ between two sets of hashes: changed, added or removed, sorted.
export function changedBetween(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  const changed = new Set<string>();
  for (const [file, digest] of after) if (before.get(file) !== digest) changed.add(file);
  for (const file of before.keys()) if (!after.has(file)) changed.add(file);
  return [...changed].sort();
}
