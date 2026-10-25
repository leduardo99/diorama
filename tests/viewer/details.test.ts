import assert from 'node:assert/strict';
import { DIRECTION_NAMES } from '@core/volume';
import { facingsOf } from '../../viewer/server/catalog';
import { createTranslator } from '../../viewer/src/i18n/core';
import { peersOf } from '../../viewer/src/lib/groups';
import type { AssetFileMeta } from '../../viewer/src/lib/types';
import { digitRow, FACING_NAMES, framesLabel, keyedAxis, rowWith, sheetRows, stepLabel, stepRow, type RowsMeta } from '../../viewer/src/lib/rows';

console.log('🧪 Checking the Details window (a sheet\'s rows by what they are: facings, variants, states, heights; what [ and ] step through)...\n');

const en = createTranslator('en').t;
const pt = createTranslator('pt-BR').t;
const EIGHT = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

// The shapes the sample exports (as `npm run example` writes them): a character's rows are its facings; an interface
// piece's are its states, a wall's its heights, and a scenery clip sheet says the facing and the variant of each row.
const SHEETS: Record<string, RowsMeta & { frameCount: number }> = {
  character: { frameCount: 16, directions: EIGHT, data: { role: 'character' } },
  button: { frameCount: 1, directions: ['S', 'W', 'N', 'E'], data: { role: 'ui', kind: 'button', states: ['normal', 'hover', 'pressed', 'disabled'] } },
  wall: { frameCount: 64, directions: ['D0', 'D1'], data: { role: 'wall', rows: 'heights', heights: [{ row: 0, name: 'wall', world: 100 }, { row: 1, name: 'fence', world: 44 }] } },
  candles: { frameCount: 6, directions: ['D0', 'D1', 'D2'], data: { role: 'prop', rows: [0, 1, 2].map((variant) => ({ row: variant, dir: 0, variant })) } },
  door: { frameCount: 8, directions: ['S', 'W', 'N', 'E'], data: { role: 'door', rows: [0, 1, 2, 3].map((dir) => ({ row: dir, dir, variant: 0 })) } },
  // A clip of a piece that turns and has looks (none in the sample yet): its rows are named S, SW... by the export, wrongly.
  mixed: { frameCount: 6, directions: EIGHT, data: { role: 'prop', rows: [0, 1].flatMap((variant) => [0, 1, 2, 3].map((dir) => ({ dir, variant }))).map((r, row) => ({ row, ...r })) } },
  urn: { frameCount: 10, data: { role: 'prop', rows: [{ row: 0, dir: 0, variant: 0 }] } },
  still: { frameCount: 1 },
  sixteen: { frameCount: 4, directions: Array.from({ length: 16 }, (_, i) => `D${i}`), data: { role: 'vfx' } },
};
const rows = Object.fromEntries(Object.entries(SHEETS).map(([name, meta]) => [name, sheetRows(meta)]));

// 1. What the rows are, and the names of the facings: the engine's (`DIRECTION_NAMES`), whatever the export called the rows.
assert.deepEqual(FACING_NAMES, DIRECTION_NAMES, 'the facings are named as the engine names them');
assert.deepEqual([rows.character.facings, rows.character.axis], [EIGHT, null], 'a character turns through its rows');
assert.deepEqual([rows.button.facings, rows.button.axis, rows.button.steps], [['S'], 'state', ['normal', 'hover', 'pressed', 'disabled']], 'an interface piece\'s rows are its states');
assert.deepEqual([rows.wall.facings, rows.wall.axis, rows.wall.steps], [['S'], 'height', ['wall', 'fence']], 'a wall\'s rows are its heights');
assert.deepEqual([rows.candles.facings, rows.candles.axis, rows.candles.steps], [['S'], 'variant', [0, 1, 2]], 'a clip of a piece that never turns: its rows are its variants');
assert.deepEqual([rows.door.facings, rows.door.axis], [['S', 'W', 'N', 'E'], null], 'a door\'s clip turns through its four facings');
assert.deepEqual([rows.mixed.facings, rows.mixed.axis, rows.mixed.steps], [['S', 'W', 'N', 'E'], 'variant', [0, 1]], 'four facings of two variants, not eight directions');
assert.deepEqual(rows.mixed.rows.slice(3, 6), [{ facing: 3, step: 0 }, { facing: 0, step: 1 }, { facing: 1, step: 1 }]);
assert.deepEqual([rows.urn.facings, rows.urn.axis, rows.urn.rows], [['S'], null, [{ facing: 0, step: 0 }]], 'one row');
assert.deepEqual([rows.still.facings, rows.still.rows.length], [[], 1], 'a still has one row and faces nowhere');
assert.equal(rows.sixteen.facings.length, 16);
// The asset cards count the facings by the same rule (the catalog's `facingsOf`).
for (const [name, meta] of Object.entries(SHEETS)) assert.equal(sheetRows(meta).facings.length, facingsOf(meta), `${name}: the Details window and the cards count the same facings`);
assert.deepEqual(sheetRows({ directions: 'S', data: { rows: 7 } }), { facings: [], axis: null, steps: [], rows: [{ facing: 0, step: 0 }] }, 'JSON of another shape is one row');

// 2. The keys: ↑ ↓ and the digits turn the facings when there are several, else they step through the variants or heights.
assert.deepEqual(Object.values(rows).map(keyedAxis), ['facing', 'step', 'step', 'step', 'facing', 'facing', null, null, 'facing']);
assert.deepEqual([stepRow(rows.candles, 0, 1), stepRow(rows.candles, 2, 1), stepRow(rows.candles, 0, -1)], [1, 0, 2], 'the variants wrap round');
assert.deepEqual([stepRow(rows.wall, 0, 1), digitRow(rows.wall, 1, 1), digitRow(rows.wall, 0, 3)], [1, 0, null], 'two heights, and no third');
assert.deepEqual([stepRow(rows.character, 7, 1), digitRow(rows.character, 0, 8), digitRow(rows.character, 0, 9)], [0, 7, null]);
assert.equal(stepRow(rows.mixed, 5, 1), 6, 'turning variant 2 keeps variant 2 (W to N)');
assert.equal(stepRow(rows.mixed, 4, -1), 7, 'and wraps within it (S to E)');
assert.equal(digitRow(rows.mixed, 6, 1), 4, 'a digit picks the facing of the variant shown');
assert.deepEqual([rowWith(rows.mixed, 1, { step: 1 }), rowWith(rows.mixed, 6, { step: 0 })], [5, 2], 'another variant keeps the facing');
assert.equal(stepRow(rows.urn, 0, 1), 0, 'one row: the keys go nowhere');
// A row the window carries over from another clip of a character, past the last row of this sheet, still finds its way.
assert.equal(stepRow(rows.door, 7, 1), 0);

// 3. The words, in both languages: the control is named after the rows, and the Data panel counts directions only when the
//    rows are facings, as the cards do.
assert.deepEqual([0, 1, 2].map((step) => stepLabel(en, rows.candles, step)), ['Variation 1', 'Variation 2', 'Variation 3']);
assert.equal(stepLabel(pt, rows.candles, 1), 'Variação 2');
assert.deepEqual([stepLabel(en, rows.wall, 0), stepLabel(en, rows.wall, 1), stepLabel(pt, rows.wall, 0)], ['Wall', 'Low (fence)', 'Muro'], 'a height by the space profile\'s name');
assert.equal(stepLabel(en, sheetRows({ directions: ['D0', 'D1'], data: { rows: 'heights', heights: [{ world: 100 }, { world: 44 }] } }), 1), '44', 'a height without a name, in world units');
assert.deepEqual([stepLabel(en, rows.button, 1), stepLabel(pt, sheetRows({ directions: ['S', 'W'], data: { role: 'ui', states: ['closed', 'open'] } }), 1)], ['hover', 'Aberta'], 'a state: the usual ones in words, the project\'s own as written');
const frames = (t: typeof en, name: string) => framesLabel(t, rows[name], SHEETS[name].frameCount);
assert.deepEqual(['character', 'candles', 'wall', 'button', 'door', 'mixed', 'urn', 'still'].map((name) => frames(en, name)), [
  '16 × 8 directions', '6 × 3 variations', '64 × 2 heights', '1 × 4 states', '8 × 4 directions', '6 × 4 directions × 2 variations', '10', '1',
]);
assert.deepEqual(['character', 'candles', 'wall', 'button', 'mixed'].map((name) => frames(pt, name)), ['16 × 8 direções', '6 × 3 variações', '64 × 2 alturas', '1 × 4 estados', '6 × 4 direções × 2 variações']);

// 4. [ and ] (the header's arrows, the footer's hint): a character's other animations, round and round, when it has more
//    than one; otherwise the assets of the list the window was opened from, stopping at either end. `stepsClips` picks the
//    words ("animation" or "asset") of the footer and of the buttons.
const asset = (subpath: string) => ({ subpath }) as AssetFileMeta;
const [idle, walk, run] = ['characters/guard/idle.png', 'characters/guard/walk.png', 'characters/guard/run.png'].map(asset);
const [candles, crate, wall] = ['scenery/candles.png', 'props/crate.png', 'scenery/wall.png'].map(asset);
const list = [idle, candles, crate, wall];
const character = peersOf(walk, [idle, walk, run], list);
assert.deepEqual([character.stepsClips, character.position, character.at(1)?.subpath, character.at(2)?.subpath, character.at(-2)?.subpath], [true, 1, run.subpath, idle.subpath, run.subpath], 'a character\'s clips go round');
const lone = peersOf(crate, [crate], list);
assert.deepEqual([lone.stepsClips, lone.position, lone.at(-1)?.subpath, lone.at(1)?.subpath, lone.at(2)], [false, 2, candles.subpath, wall.subpath, undefined], 'any other asset steps through the list and stops at its end');
assert.equal(peersOf(idle, [idle], list).at(-1), undefined, 'and at its start');
assert.equal(peersOf(idle, [idle], list).stepsClips, false, 'a character with a single clip steps through the list');
assert.deepEqual([en('details.footer.animation'), en('details.footer.asset'), pt('details.shell.previousAnimation'), pt('details.shell.nextAsset')], ['animation', 'asset', 'Animação anterior ([)', 'Próximo asset (])']);

console.log('✅ Details window rows and peers passed');
