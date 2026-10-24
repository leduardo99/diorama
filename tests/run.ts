/**
 * Diorama - runs the test suites.
 *
 *   npm test                  every suite: engine, docs, runtime, viewer, phaser, cli
 *   npm run test:engine       one suite (engine | docs | runtime | viewer | phaser | cli)
 *   npx tsx tests/run.ts engine docs
 *
 * A suite is a folder of tests/ and its tests are the `*.test.ts` files inside it (any depth), run one
 * after another, each in its own process from the repository root. A failing file does not stop the
 * run: every file runs, then the summary says which passed and which failed, and the exit code is 1 if
 * any failed. A file at the top of tests/ (outside a suite folder) is reported as an error, so a new
 * test cannot be forgotten by `npm test`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve('.');
const TESTS = resolve('tests');
/** Run order: the cheap, pure suites first, the ones that start Chromium (phaser) and write projects (cli) last. */
const SUITES = ['engine', 'docs', 'runtime', 'viewer', 'phaser', 'cli'] as const;

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const requested = process.argv.slice(2);
const unknown = requested.filter(name => !(SUITES as readonly string[]).includes(name));
if (unknown.length) {
  console.error(`Unknown suite ${unknown.join(', ')}. Suites: ${SUITES.join(', ')}.`);
  process.exit(2);
}
const suites = requested.length ? SUITES.filter(name => requested.includes(name)) : [...SUITES];

// Tests outside a suite folder would never run: fail loudly instead.
const stray = existsSync(TESTS)
  ? readdirSync(TESTS).filter(name => name.endsWith('.test.ts'))
  : [];
if (stray.length && !requested.length) {
  console.error(`Test files outside a suite folder (move them into tests/${SUITES.join('/, tests/')}/): ${stray.map(f => `tests/${f}`).join(', ')}`);
}

interface Outcome {
  file: string;
  ok: boolean;
  seconds: number;
}
const outcomes: Outcome[] = [];

for (const suite of suites) {
  const dir = join(TESTS, suite);
  const files = existsSync(dir) ? testFiles(dir) : [];
  if (!files.length) {
    console.log(`\n(no tests in tests/${suite}/)`);
    continue;
  }
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    console.log(`\n=== ${rel} ===`);
    const started = Date.now();
    // `--import tsx` loads TypeScript the way the `tsx` command does, without a second process.
    const result = spawnSync(process.execPath, ['--import', 'tsx', rel], { cwd: ROOT, stdio: 'inherit' });
    outcomes.push({ file: rel, ok: result.status === 0, seconds: (Date.now() - started) / 1000 });
  }
}

console.log('\n=== Summary ===');
for (const { file, ok, seconds } of outcomes) console.log(`${ok ? 'pass' : 'FAIL'}  ${file}  (${seconds.toFixed(1)} s)`);
const failed = outcomes.filter(o => !o.ok).length + (stray.length && !requested.length ? 1 : 0);
console.log(failed === 0 ? `\n${outcomes.length} test files passed.` : `\n${failed} problem(s): ${outcomes.filter(o => !o.ok).length} failed of ${outcomes.length} test files${stray.length && !requested.length ? `, ${stray.length} outside a suite folder` : ''}.`);
process.exit(failed === 0 ? 0 : 1);
