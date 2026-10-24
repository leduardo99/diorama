import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Closure, atlasURL, cellsOf, closure, cutsOf, frameNameOf, imageURL, planTexture } from '@diorama/phaser/sheets';
import { buildLibrary, readSheet, type Atlas, type AtlasFrame } from '@diorama/runtime';

console.log('🧪 Checking the Phaser loader without Phaser (the dependency closure, frame names, origins, bands of whole cells)...\n');

/** The runtime's fixtures, cut from the sample's export: what a game fetches, as a fetch would hand it over. */
const FIXTURES = resolve('tests/runtime/fixtures');
const fetchFixture = async (path: string): Promise<unknown> => JSON.parse(await readFile(resolve(FIXTURES, `${path}.json`), 'utf8'));

// 1. The closure: a character's idle brings its other clips (the manifest's keys) and the effects its clips cue, breadth first.
const guard = await closure(['characters/guard/idle'], fetchFixture);
const guardClips = ['idle', 'walk', 'run', 'slash', 'hit', 'death', 'cleave', 'dash', 'backstep', 'jump'].map((clip) => `characters/guard/${clip}`);
assert.deepEqual([...guard.sheets.keys()], [...guardClips, 'vfx/slash-spark', 'vfx/soul-shockwave', 'vfx/dust-puff', 'vfx/death-souls'], 'every clip of the manifest, then every cued effect, each once');
assert.deepEqual([guard.pending.size, guard.failed.size], [0, 0], 'closed, nothing failed');
const guardLibrary = buildLibrary(guard.sheets.values());
assert.deepEqual([guardLibrary.characters.length, guardLibrary.characters[0].clips.length, [...guardLibrary.effects.keys()].sort()], [1, 10, ['death-souls', 'dust-puff', 'slash-spark', 'soul-shockwave']], 'one character with all its clips and effects');
// An effect's `follows` comes too: Malvek's soul bolt ends in the soul burst, which no clip cues.
const malvek = await closure(['characters/malvek/soulbolt'], fetchFixture);
assert.ok(malvek.sheets.has('vfx/soul-bolt') && malvek.sheets.has('vfx/soul-burst') && malvek.sheets.has('characters/malvek/idle'), `the projectile, the impact it follows and the other clips: ${[...malvek.sheets.keys()].join(', ')}`);
assert.ok([...malvek.sheets.keys()].indexOf('vfx/soul-burst') > [...malvek.sheets.keys()].indexOf('vfx/soul-bolt'), 'the follow-up after the sheet that names it');
// Two roots that share sheets fetch each sheet once.
const fetched: string[] = [];
const both = await closure(['characters/guard/slash', 'characters/guard/idle', 'vfx/slash-spark'], (path) => (fetched.push(path), fetchFixture(path)));
assert.equal(fetched.length, new Set(fetched).size, 'no sheet is fetched twice');
assert.equal(both.sheets.size, guard.sheets.size, 'the same closure from any of its sheets');
// What cannot be fetched or read fails alone: the rest still loads.
const missing = await closure(['characters/guard/idle'], (path) => (path === 'vfx/dust-puff' ? Promise.reject(new Error('404')) : path === 'vfx/death-souls' ? Promise.resolve('<!DOCTYPE html>') : fetchFixture(path)));
assert.deepEqual([...missing.failed.keys()], ['vfx/dust-puff', 'vfx/death-souls']);
assert.equal(missing.failed.get('vfx/dust-puff'), '404');
assert.match(missing.failed.get('vfx/death-souls')!, /^vfx\/death-souls: an atlas is a JSON object/, 'a file that is not an atlas names itself (ContractError)');
assert.equal(missing.sheets.size, guard.sheets.size - 2);
// The stepper a host drives one file at a time: `want` only what is new, `read` returns what to fetch next.
const steps = new Closure();
assert.deepEqual(steps.want(['characters/guard/idle', 'characters/guard/idle']), ['characters/guard/idle'], 'wanted once');
const next = steps.read('characters/guard/idle', await fetchFixture('characters/guard/idle'));
assert.deepEqual(next, [...guardClips.slice(1), 'vfx/slash-spark', 'vfx/soul-shockwave', 'vfx/dust-puff', 'vfx/death-souls']);
assert.deepEqual(steps.read('characters/guard/walk', await fetchFixture('characters/guard/walk')), [], 'a sibling clip needs nothing new');
assert.deepEqual(steps.want(['characters/guard/walk', 'vfx/slash-spark']), [], 'read and pending sheets are not wanted again');

// 2. Where the files are: the JSON at its path, the picture `meta.image` names next to it (a JPEG export), else the PNG.
assert.equal(atlasURL('http://x/assets/', 'characters/guard/idle'), 'http://x/assets/characters/guard/idle.json');
assert.equal(imageURL('/a/', 'characters/guard/idle', { meta: { image: 'idle.png' }, frames: {} }), '/a/characters/guard/idle.png');
assert.equal(imageURL('/a/', 'scenes/yard', { meta: { image: 'yard.jpg' }, frames: {} }), '/a/scenes/yard.jpg');
assert.equal(imageURL('/a/', 'badge', { meta: {}, frames: {} }), '/a/badge.png');
assert.equal(imageURL('/a/', 'badge', null), '/a/badge.png');

// 3. Frame names: the atlas's own keys; for an atlas that lists none (the fixtures), the names the runtime keys its grid with.
const DIRS = ['S', 'W', 'N', 'E'];
const cell = (x: number, y: number, w = 30, h = 40): AtlasFrame => ({ x, y, width: w, height: h });
const named: Atlas = {
  meta: { mode: 'directions', frameCount: 5, directions: DIRS, directionFacings: [Math.PI / 2, Math.PI, 1.5 * Math.PI, 2 * Math.PI], frameWidth: 30, frameHeight: 40, width: 150, height: 160, pivot: { x: 15, y: 36 }, scale: 2, fps: 10, data: { role: 'character', skeleton: 'humanoid', clipKind: 'idle', loop: true } },
  frames: Object.fromEntries(DIRS.flatMap((d, row) => Array.from({ length: 5 }, (_, i) => [`${d}_${i}`, cell(i * 30, row * 40)]))),
};
const namedSheet = readSheet('characters/dummy/idle', named);
const namedPlan = planTexture(namedSheet, { width: 150, height: 160 });
assert.deepEqual(namedPlan.frames.map((f) => f.name), Object.keys(named.frames), 'one frame per atlas cell, by its name');
assert.deepEqual(namedPlan.bands, [{ x: 0, y: 0, width: 150, height: 160 }], 'a picture that fits is one band, the whole of it');
const dummy = buildLibrary([namedSheet]).characters[0];
assert.equal(frameNameOf(named, dummy.clips[0].rects(2)[3]), 'N_3', 'a cell the runtime hands back has its atlas name');
const gridIdle = (await fetchFixture('characters/guard/idle')) as Atlas;
assert.deepEqual(gridIdle.frames, {}, 'the fixture lists no cells');
const gridSheet = readSheet('characters/guard/idle', gridIdle);
const gridPlan = planTexture(gridSheet, { width: 3456, height: 2592 });
assert.equal(gridPlan.frames.length, 8 * 16);
assert.deepEqual(gridPlan.frames.slice(0, 2).map((f) => [f.name, f.x, f.y]), [['S_0', 0, 0], ['S_1', 216, 0]]);
assert.deepEqual(gridPlan.frames.at(-1)!.name, 'SE_15');
const gridGuard = buildLibrary([gridSheet]).characters[0];
for (const [row, index] of [[0, 0], [4, 9], [7, 15]]) {
  const rect = gridGuard.clips[0].rects(row)[index];
  const name = frameNameOf(gridIdle, rect);
  assert.equal(name, `${gridIdle.meta.directions![row]}_${index}`, 'a grid cell is named by its facing and index');
  const plan = gridPlan.frames.find((f) => f.name === name)!;
  assert.deepEqual([plan.x, plan.y, plan.width, plan.height], [rect.x, rect.y, rect.width, rect.height], 'and the loader put that name on that cell');
}
const strip: Atlas = { meta: { mode: 'strip', frameCount: 3, frameWidth: 8, frameHeight: 8 }, frames: {} };
assert.deepEqual(cellsOf(strip).map(([name, r]) => [name, r.x]), [['frame_0', 0], ['frame_1', 8], ['frame_2', 16]], 'a strip without directions: frame_<index>');

// 4. Origins from the pivot: `meta.pivot` over the untrimmed cell, which a packed sheet's trimmed frames keep.
assert.deepEqual(namedPlan.frames[0].pivot, { x: 0.5, y: 36 / 40 });
assert.deepEqual(gridPlan.frames[0].pivot, { x: 108 / 216, y: 248 / 324 }, 'the guard: feet at (108, 248) of a 216 × 324 cell');
const packed: Atlas = {
  meta: { mode: 'directions', frameCount: 2, directions: ['S', 'W'], directionFacings: [Math.PI / 2, Math.PI], frameWidth: 30, frameHeight: 40, width: 40, height: 60, pivot: { x: 15, y: 36 }, data: { role: 'character', skeleton: 'humanoid' } },
  frames: {
    S_0: { x: 0, y: 0, width: 20, height: 30, ox: 4, oy: 6, cellW: 30, cellH: 40 },
    S_1: { x: 20, y: 0, width: 18, height: 30, ox: 6, oy: 2, cellW: 30, cellH: 40 },
    W_0: { x: 0, y: 30, width: 20, height: 30, ox: 3, oy: 8, cellW: 30, cellH: 40 },
    W_1: { x: 20, y: 30, width: 16, height: 28, ox: 7, oy: 9, cellW: 30, cellH: 40 },
  },
};
const packedPlan = planTexture(readSheet('characters/dummy/packed', packed), { width: 40, height: 60 });
assert.deepEqual(packedPlan.frames[1], { name: 'S_1', band: 0, x: 20, y: 0, width: 18, height: 30, trim: { cellW: 30, cellH: 40, ox: 6, oy: 2 }, pivot: { x: 0.5, y: 0.9 } }, 'a trimmed frame keeps its cell and its origin in that cell');
assert.equal(namedPlan.frames[0].trim, null, 'a raw sheet\'s frames are their whole cells');
// Without `meta.pivot`, the runtime's own defaults: an effect's origin is the middle of its frame, a character's feet the middle of its bottom.
const noPivot = (role: string, extra: object = {}) => planTexture(readSheet('x/y', { meta: { mode: 'strip', frameCount: 1, frameWidth: 30, frameHeight: 40, data: { role, ...extra } }, frames: {} }), { width: 30, height: 40 }).frames[0].pivot;
assert.deepEqual(noPivot('vfx'), { x: 0.5, y: 0.5 });
assert.deepEqual(noPivot('character', { skeleton: 'humanoid' }), { x: 0.5, y: 1 });
assert.deepEqual(noPivot('prop'), { x: 0.5, y: 1 }, 'a sprite stands like a character');
assert.equal(noPivot('ui'), null, 'an interface piece keeps Phaser\'s own origin');

// 5. Bands of whole cells: a picture larger than the renderer's textures is cut between cells, across and down.
assert.deepEqual(cutsOf(100, 40, [[0, 30], [30, 60], [60, 90], [90, 100]]), [0, 30, 60, 100], 'as few cuts as whole cells allow');
assert.deepEqual(cutsOf(100, 100, [[0, 30]]), [0, 100], 'a length that fits is not cut');
assert.throws(() => cutsOf(100, 20, [[0, 30], [30, 100]], 'props/wide'), /props\/wide cannot be cut into bands of whole cells of at most 20 px/, 'a cell larger than the limit cannot be split');
const banded = planTexture(namedSheet, { width: 150, height: 160 }, 64);
assert.deepEqual(banded.bands.map((b) => [b.x, b.y, b.width, b.height]), [
  [0, 0, 60, 40], [60, 0, 60, 40], [120, 0, 30, 40],
  [0, 40, 60, 40], [60, 40, 60, 40], [120, 40, 30, 40],
  [0, 80, 60, 40], [60, 80, 60, 40], [120, 80, 30, 40],
  [0, 120, 60, 40], [60, 120, 60, 40], [120, 120, 30, 40],
], 'two cells across and one down per band, in reading order');
for (const frame of banded.frames) {
  const band = banded.bands[frame.band];
  const source = named.frames[frame.name];
  assert.ok(band.width <= 64 && band.height <= 64, 'no band is larger than the limit');
  assert.deepEqual([band.x + frame.x, band.y + frame.y, frame.width, frame.height], [source.x, source.y, source.width, source.height], `${frame.name} keeps its pixels`);
  assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= band.width && frame.y + frame.height <= band.height, `${frame.name} lies inside its band`);
  assert.deepEqual(frame.pivot, { x: 0.5, y: 36 / 40 }, 'and keeps its origin');
}
// Packed cells are not on a grid: the cuts fall where no trimmed frame is crossed (20 across, 30 down, not 36 or 58).
const packedBanded = planTexture(readSheet('characters/dummy/packed', packed), { width: 40, height: 60 }, 32);
assert.deepEqual(packedBanded.bands.map((b) => [b.x, b.y, b.width, b.height]), [[0, 0, 20, 30], [20, 0, 20, 30], [0, 30, 20, 30], [20, 30, 20, 30]]);
assert.deepEqual(packedBanded.frames.map((f) => f.band), [0, 1, 2, 3]);
assert.deepEqual(packedBanded.frames[1].trim, packedPlan.frames[1].trim, 'a frame on a band keeps its trim');
assert.throws(() => planTexture(readSheet('characters/dummy/packed', packed), { width: 40, height: 60 }, 19), /characters\/dummy\/packed \(40 × 60 px\) cannot be cut/, 'nor can a picture whose cells are larger than the limit');
// Empty corners make no band.
const corner = planTexture(readSheet('props/corner', { meta: { mode: 'strip', frameCount: 1 }, frames: { frame_0: cell(0, 0, 30, 30) } }), { width: 60, height: 60 }, 30);
assert.deepEqual(corner.bands, [{ x: 0, y: 0, width: 30, height: 30 }], 'only bands that hold a cell');
for (const frame of packedBanded.frames) {
  const band = packedBanded.bands[frame.band];
  const source = packed.frames[frame.name];
  assert.deepEqual([band.x + frame.x, band.y + frame.y], [source.x, source.y], `${frame.name} keeps its place`);
  assert.ok(frame.x + frame.width <= band.width && frame.y + frame.height <= band.height && band.width <= 32 && band.height <= 32, `${frame.name} lies inside a band of at most 32 px`);
}
// A strip as wide as the sample's crypt-flags (90 floor tiles of 96 × 72, 8640 px), over WebGL's usual 8192. Synthetic: the
// sample's exports are not versioned, and its widest (crypt-wall, iron-fence, ruined-wall) are 9216 px.
const flags = readSheet('scenery/crypt-flags', { meta: { mode: 'strip', frameCount: 90, frameWidth: 96, frameHeight: 72, width: 8640, height: 72, data: { role: 'floor' } }, frames: Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`frame_${i}`, cell(i * 96, 0, 96, 72)])) });
const flagsPlan = planTexture(flags, { width: 8640, height: 72 }, 8192);
assert.deepEqual(flagsPlan.bands.map((b) => [b.x, b.width]), [[0, 8160], [8160, 480]], '85 tiles, then the last 5');
assert.deepEqual([flagsPlan.frames[84].band, flagsPlan.frames[85].band, flagsPlan.frames[85].x], [0, 1, 0], 'tile 85 starts the second band');

console.log('✔ Closure, frame names, origins and bands of whole cells checked.\n');
