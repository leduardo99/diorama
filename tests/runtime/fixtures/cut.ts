/**
 * Cuts the runtime's fixtures again from the sample's export, after a change of the contract (or of the sample) that the
 * tests should see. Every JSON file under tests/runtime/fixtures/ is replaced by the sheet of the same path in
 * examples/soulkeeper/assets/ (export the sample first: `npm run export -- examples/soulkeeper`), less what the tests do not read,
 * so the files stay small:
 * - the cells' rects (`frames`), except on the sheets in `FRAMES`, whose cells the tests read;
 * - a clip's own checks (`meta.data.motion`, and `meta.data.grips` for a character holding items) and the space profile that
 *   scenery, scenes and effects repeat (`meta.data.space`).
 *
 * To add a fixture, copy the exported JSON to its path here and run this. The conformance traces may then need
 * `npx tsx tests/runtime/conformance.test.ts --update`.
 *
 *   npx tsx tests/runtime/fixtures/cut.ts            cut them again
 *   npx tsx tests/runtime/fixtures/cut.ts --check    list the ones that differ from the export, write nothing (exit 1 if any)
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const FIXTURES = resolve('tests/runtime/fixtures');
const EXPORT = resolve('examples/soulkeeper/assets');
/** The sheets whose cells the tests read (a clip's playback order, a nine-slice, a bar's layers, a cursor's hotspot). */
const FRAMES = new Set(['characters/guard/slash', 'ui/cursor', 'ui/health-bar', 'ui/portrait-frame']);

interface Sheet {
  meta: { data?: Record<string, unknown> };
  frames: unknown;
}

/** A sheet as the fixtures keep it: one line of JSON. */
function cut(path: string, sheet: Sheet): string {
  const data = sheet.meta.data;
  if (data) {
    delete data.motion;
    delete data.grips;
    delete data.space;
  }
  if (!FRAMES.has(path)) sheet.frames = {};
  return `${JSON.stringify(sheet)}\n`;
}

const walk = (dir: string): string[] => readdirSync(dir).sort().flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : name.endsWith('.json') ? [join(dir, name)] : []));

const check = process.argv.includes('--check');
const changed: string[] = [];
for (const file of walk(FIXTURES)) {
  const path = relative(FIXTURES, file).split(sep).join('/').replace(/\.json$/, '');
  const source = join(EXPORT, `${path}.json`);
  if (!statSync(source, { throwIfNoEntry: false })) throw new Error(`${path}: not in ${relative(resolve('.'), EXPORT)} (export the sample first)`);
  const text = cut(path, JSON.parse(readFileSync(source, 'utf8')) as Sheet);
  if (text === readFileSync(file, 'utf8')) continue;
  changed.push(path);
  if (!check) writeFileSync(file, text);
}
console.log(changed.length ? `${check ? 'Differ from the export' : 'Cut again'}: ${changed.join(', ')}` : 'The fixtures match the export.');
if (check && changed.length) process.exit(1);
