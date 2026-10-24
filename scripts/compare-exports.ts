/**
 * Proves a change left a project's exports as they were: save them before the change, export again after it, compare.
 *
 *   npm run compare-exports -- --save [project]     copy <project>/assets/ to .diorama-baseline/<project>/
 *   npm run compare-exports -- [project]            compare <project>/assets/ with that copy
 *   npm run compare-exports -- --before <dir> --after <dir>
 *
 * The project defaults to the sample, examples/soulkeeper. Every PNG must be byte-identical (the exporter is
 * deterministic, so equal pixels give equal bytes) and every atlas JSON deep-equal; nothing may be missing or extra.
 * Exits with code 1 on any difference, listing them. `.diorama-baseline/` is git-ignored.
 */

import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, resolve, sep } from 'node:path';
import { findProject } from '../tools/project.js';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const save = args.includes('--save');
if (save) args.splice(args.indexOf('--save'), 1);
const beforeArg = flag('--before');
const afterArg = flag('--after');

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

let before: string;
let after: string;
if (beforeArg || afterArg) {
  if (!beforeArg || !afterArg) fail('--before and --after go together: npm run compare-exports -- --before <dir> --after <dir>');
  before = resolve(beforeArg);
  after = resolve(afterArg);
} else {
  const name = args[0] ?? 'examples/soulkeeper';
  const project = findProject(name);
  if (!project) fail(`No project "${name}". Name one in projects/ or examples/, e.g. examples/soulkeeper.`);
  after = join(project.dir, 'assets');
  before = resolve('.diorama-baseline', project.name);
  if (save) {
    if (!existsSync(after)) fail(`${project.rel}/assets/ does not exist yet: export it first (npm run export -- ${project.rel}).`);
    rmSync(before, { recursive: true, force: true });
    cpSync(after, before, { recursive: true });
    console.log(`Saved ${filesOf(before).length} files of ${project.rel}/assets/ to ${relative(resolve('.'), before)}/. Change the code, export again, then run npm run compare-exports -- ${project.rel}`);
    process.exit(0);
  }
}
if (!existsSync(before)) fail(`Nothing saved to compare with (${relative(resolve('.'), before)}). Run npm run compare-exports -- --save first, before the change.`);
if (!existsSync(after)) fail(`${relative(resolve('.'), after)} does not exist: export the project first.`);

const a = filesOf(before);
const b = filesOf(after);
const inAfter = new Set(b);
const inBefore = new Set(a);
const missing = a.filter(f => !inAfter.has(f));
const extra = b.filter(f => !inBefore.has(f));
const differ: string[] = [];
let same = 0;
for (const file of a.filter(f => inAfter.has(f))) {
  const x = readFileSync(join(before, file));
  const y = readFileSync(join(after, file));
  const equal = file.endsWith('.json') ? isDeepStrictEqual(JSON.parse(x.toString('utf8')), JSON.parse(y.toString('utf8'))) : x.equals(y);
  if (equal) same++;
  else differ.push(file);
}

const list = (title: string, files: string[]) => files.length && console.log(`${title}: ${files.length}\n${files.slice(0, 40).map(f => `  ${f}`).join('\n')}${files.length > 40 ? `\n  … and ${files.length - 40} more` : ''}`);
console.log(`${same} of ${a.length} files identical.`);
list('Different', differ);
list('Missing after the change', missing);
list('New after the change', extra);
if (differ.length || missing.length || extra.length) process.exit(1);
console.log('The exports are unchanged.');
