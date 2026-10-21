// npm run verify: the one check a change needs, in seconds. Every step has a time budget; a step that runs past it is
// stopped and fails the run, so the check can never grow back into a long suite. The full browser suite and the mutant
// catalogue are not part of it.
//
// Steps, cheapest first:
//  1. manifest: the manifest and the message catalogues, en.json and pt-BR.json alike, are valid (manifest:check);
//  2. generated: the generated files are what the generators write now (npm run gen:check);
//  3. types: the three TypeScript projects, with the native compiler (TypeScript 7), at once;
//  4. lint: ESLint with its cache, on the changed files (every file when a lint input changed);
//  5. model: the model-based checks (tools/runner/model/): generated command sequences over the editor's own store,
//     checked after every step against the document's rules, undo/redo and the typing context, with few runs each;
//  6. unit: the unit tests, with the random-sequence probes at few runs;
//  7. smoke: the core journeys in a real browser on the dev server (tools/verify/smoke.spec.ts), when a change reaches
//     what the browser runs.
//
// Usage: npm run verify [-- --all] [-- --no-browser]
//   --all         lint every file and run the smoke, as if everything changed
//   --no-browser  skip the smoke
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

interface Step {
  readonly name: string;
  readonly budgetMs: number;
  readonly run: () => Promise<boolean>;
}

const args = process.argv.slice(2);
const everything = args.includes('--all');
const noBrowser = args.includes('--no-browser');
const node = process.execPath;
const vitest = 'node_modules/vitest/vitest.mjs';

// the files changed against the last commit, staged or not, and the new ones git does not ignore
function changedFiles(): string[] {
  const lines = (command: string[]) => spawnSync('git', command, { encoding: 'utf8' }).stdout.split('\n').map((one) => one.trim()).filter((one) => one !== '');
  const files = new Set([...lines(['diff', '--name-only', 'HEAD']), ...lines(['ls-files', '--others', '--exclude-standard'])]);
  return [...files].filter((file) => fs.existsSync(file));
}

const changed = changedFiles();
const lintInputs = ['eslint.config.js', 'package.json', 'package-lock.json'];
const lintable = (file: string) => /\.(ts|tsx|js|mjs|cjs|css)$/.test(file) && !file.startsWith('auditoria/');
const reachesBrowser = everything || changed.some((file) => file.startsWith('src/') || file.startsWith('manifest/') || file.startsWith('tools/verify/') || file === 'index.html');

// a child process stopped with everything it started (Windows has no process groups: taskkill takes the tree)
function stop(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(-pid, 'SIGKILL');
}

// runs a command within the step's budget; its output is shown only when it fails
function command(file: string, commandArgs: readonly string[], budgetMs: number, env: Record<string, string> = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(file, commandArgs, { env: { ...process.env, ...env }, shell: process.platform === 'win32' && file !== node, detached: process.platform !== 'win32' });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      stop(child.pid);
      console.log(output.trimEnd());
      console.log(`  stopped: over its budget of ${budgetMs / 1000} s`);
      resolve(false);
    }, budgetMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) console.log(output.trimEnd());
      resolve(code === 0);
    });
  });
}

const steps: Step[] = [
  { name: 'manifest', budgetMs: 10_000, run: () => command(node, ['tools/manifest/check.ts'], 10_000) },
  { name: 'generated', budgetMs: 15_000, run: () => command(node, ['tools/gen/check.ts'], 15_000) },
  {
    name: 'types',
    budgetMs: 15_000,
    run: async () => {
      const tsc = 'node_modules/typescript-native/bin/tsc';
      const results = await Promise.all(['app', 'node', 'core'].map((project) => command(node, [tsc, '-p', `tsconfig.${project}.json`, '--noEmit'], 15_000)));
      return results.every(Boolean);
    },
  },
  {
    name: 'lint',
    budgetMs: 30_000,
    run: () => {
      const whole = everything || changed.some((file) => lintInputs.includes(file) || file.startsWith('tools/lint/'));
      const files = changed.filter(lintable);
      if (!whole && files.length === 0) return Promise.resolve(true);
      return command(node, ['node_modules/eslint/bin/eslint.js', ...(whole ? ['.'] : files), '--max-warnings', '0', '--cache', '--cache-location', '.cache/eslint/', '--no-warn-ignored'], 30_000);
    },
  },
  {
    name: 'model',
    budgetMs: 30_000,
    // every model check but whether ui-widths.json was measured with today's stylesheets: measuring runs a browser in
    // three screen conditions, which belongs to the end of a stage (CLAUDE.md section 0), not to every change
    run: () => command(node, [vitest, 'run', '--config', 'tools/runner/model/vitest.config.ts', '--reporter', 'dot', '--no-isolate', '-t', '^(?!.*the measurement was taken with the current stylesheets)'], 30_000, { BUILDER_MODEL_RUNS: '25' }),
  },
  {
    name: 'unit',
    budgetMs: 40_000,
    // every unit test, files sharing their workers; the exhaustive command fuzz and the tests of manifest:check's own
    // fault plants are left to the end of a stage
    run: () => command(node, [vitest, 'run', '--reporter', 'dot', '--no-isolate', '--exclude', 'tools/runner/model/**', '--exclude', 'tools/runner/fuzz.test.ts', '--exclude', 'tools/manifest/check*.test.ts'], 40_000, { BUILDER_MODEL_RUNS: '25' }),
  },
  {
    name: 'smoke',
    budgetMs: 90_000,
    run: () => (noBrowser || !reachesBrowser ? Promise.resolve(true) : command(node, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tools/verify/smoke.config.ts'], 90_000)),
  },
];

// the static steps are light and run at once; the test steps each use the machine's cores and run one after another
const AT_ONCE = new Set(['manifest', 'generated', 'types', 'lint']);
const timed = async (step: Step): Promise<boolean> => {
  const at = Date.now();
  const ok = await step.run();
  console.log(`${ok ? '✓' : '✗'} ${step.name} (${((Date.now() - at) / 1000).toFixed(1)} s)`);
  return ok;
};

const started = Date.now();
let failed = !(await Promise.all(steps.filter((step) => AT_ONCE.has(step.name)).map(timed))).every(Boolean);
for (const step of steps.filter((one) => !AT_ONCE.has(one.name))) {
  if (failed && step.name === 'smoke') {
    console.log('- smoke: not run, an earlier step failed');
    continue;
  }
  if (!(await timed(step))) failed = true;
}
console.log(`${failed ? 'FAILED' : 'passed'} in ${((Date.now() - started) / 1000).toFixed(1)} s (${changed.length} changed files)`);
process.exit(failed ? 1 : 0);
