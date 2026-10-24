import assert from 'node:assert/strict';
import { CONTRACT, ContractError, buildLibrary, createActor, dependenciesOf, framesOf, imageSheet, playableClips, readSheet, sheetNamed, shownFrame, wieldOf, type Atlas, type CharacterManifest } from '@diorama/runtime';
import { DIRS, characterSheets, clipSheet, fixtureSheets, type ClipSpec } from './helpers';

console.log('🧪 Checking how sheets are read and put together (roles, contract §6 fallbacks, controls, dependencies, real fixtures)...\n');

const specs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'walk', action: 'walk', clipKind: 'locomotion', frames: 8, groundSpeed: 40 },
  { key: 'run', action: 'run', clipKind: 'locomotion', frames: 8, groundSpeed: 80 },
  { key: 'slash', action: 'attack', clipKind: 'action', frames: 10, events: [{ frame: 3, name: 'hit' }, { frame: 5, name: 'cancel' }], travel: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
  { key: 'howl', action: 'skill', clipKind: 'action', frames: 10, events: [{ frame: 2, name: 'cast' }, { frame: 6, name: 'release' }] },
  { key: 'dodge', action: 'dodge', clipKind: 'action', frames: 6 },
  { key: 'hit', action: 'hit', clipKind: 'action', frames: 4 },
  { key: 'death', action: 'death', clipKind: 'action', frames: 6, hold: true },
];
const manifest: CharacterManifest = {
  name: 'mage', skeleton: 'humanoid', scale: 2, camera: { tilt: 30, heightBoost: 1.2 }, directions: DIRS, sockets: ['head', 'center', 'mouth'],
  clips: specs.map((s) => ({ key: s.key, kind: s.action, category: s.clipKind, tags: [], loop: s.clipKind !== 'action', hold: !!s.hold, seconds: 1, frames: s.frames, fps: 10, groundSpeed: s.groundSpeed ?? 0, events: s.events ?? [] })),
  warnings: ['arm length differs between skins'], effects: { howl: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }, { on: 'cast', effect: 'cast-circle' }] },
  controls: { idle: 'idle', move: ['walk', 'run'], actions: { skill: ['howl'], hit: ['hit'], attack: ['slash'], death: ['death'], dodge: ['dodge'] } },
};

// 1. Reading: what a sheet is comes from `meta.data.role` (and, for older atlases, a skeleton or a manifest), never its name.
const kinds = (atlas: Atlas) => readSheet('x/y', atlas).kind;
assert.equal(kinds(clipSheet(specs[0], manifest)), 'character');
assert.equal(kinds({ meta: { mode: 'strip', data: { role: 'vfx' } }, frames: {} }), 'effect');
assert.equal(kinds({ meta: { mode: 'strip', data: { role: 'ui', kind: 'panel' } }, frames: {} }), 'ui');
assert.equal(kinds({ meta: { mode: 'strip', data: { role: 'icon' } }, frames: {} }), 'icon');
assert.equal(kinds({ meta: { mode: 'grid', data: { role: 'character' } }, frames: {} }), 'grid', 'a grid sheet has no playback order');
assert.equal(kinds({ meta: { mode: 'strip', data: { skeleton: 'wolf' } }, frames: {} }), 'character', 'an older atlas with a skeleton is a character');
assert.equal(kinds({ meta: { mode: 'directions', data: { role: 'gear', character: 'guard', skeleton: 'humanoid' } }, frames: {} }), 'sprite', 'a gear item is never a character, whoever wears it');
assert.equal(kinds({ meta: { mode: 'strip', data: { role: 'prop' } }, frames: {} }), 'sprite');
assert.equal(readSheet({ path: 'a/b', url: '/a/b.png' }, { meta: {} }).atlas?.frames !== undefined, true, 'frames default to none');
assert.deepEqual(readSheet('a/b', { meta: { width: 64, height: 32 }, frames: {} }).size, { width: 64, height: 32 });
assert.equal(imageSheet('props/stone', { width: 64, height: 48 }).atlas, null, 'an image without an atlas');
for (const [json, why] of [[null, 'null'], [[1, 2], 'an array'], [{ frames: {} }, 'no meta'], [{ meta: [], frames: {} }, 'a meta that is not an object']] as const) {
  assert.throws(() => readSheet('characters/guard/idle', json), (e: unknown) => e instanceof ContractError && e.path === 'characters/guard/idle' && e.message.startsWith('characters/guard/idle: '), `refused: ${why}`);
}
// Cells listed some other way (another packer's array, null) are taken from the grid, with a warning: the sheet still plays.
for (const frames of [[], null, 3]) {
  const odd = readSheet('props/odd', { meta: { mode: 'strip', frameCount: 2, frameWidth: 4, frameHeight: 4 }, frames });
  assert.deepEqual(odd.atlas!.frames, {}, `no cells by name (${JSON.stringify(frames)})`);
  assert.match(odd.warnings[0], /props\/odd: `frames` is not an object of cells by name/);
  assert.deepEqual(buildLibrary([odd]).sprites[0].rects(0), [{ x: 0, y: 0, width: 4, height: 4 }, { x: 4, y: 0, width: 4, height: 4 }], 'cells on the grid');
}
assert.deepEqual(readSheet('props/plain', { meta: { mode: 'strip' } }).warnings, [], 'no `frames` at all is no warning');
// A newer contract is read, with a warning instead of a silent misreading.
assert.deepEqual(readSheet('a/b', { meta: { data: { contract: CONTRACT } }, frames: {} }).warnings, []);
assert.match(readSheet('a/b', { meta: { data: { contract: CONTRACT + 1 } }, frames: {} }).warnings[0], /a\/b: written for contract 2, read as contract 1/);

// 2. What a sheet needs next: a character's other clips and cued effects, an effect's follow-up, a piece's state and clip sheets.
const idleSheet = readSheet('characters/mage/idle', clipSheet(specs[0], manifest));
assert.deepEqual(dependenciesOf(idleSheet), ['characters/mage/walk', 'characters/mage/run', 'characters/mage/slash', 'characters/mage/howl', 'characters/mage/dodge', 'characters/mage/hit', 'characters/mage/death', 'vfx/soul-bolt', 'vfx/cast-circle']);
assert.deepEqual(dependenciesOf(readSheet('vfx/soul-bolt', { meta: { data: { role: 'vfx', effect: { followsSheet: 'vfx/soul-burst' } as never } }, frames: {} })), ['vfx/soul-burst']);
assert.deepEqual(dependenciesOf(readSheet('vfx/bolt', { meta: { data: { role: 'vfx', effect: { follows: 'burst' } as never } }, frames: {} })), ['vfx/burst'], 'without `followsSheet`, the follow-up\'s id');
const door = readSheet('scenery/crypt-door', { meta: { mode: 'directions', data: { role: 'door', stateSheets: { closed: 'crypt-door', open: 'crypt-door--open' }, clips: { opening: { frames: 8, sheet: 'crypt-door--opening' } } } }, frames: {} });
assert.deepEqual(dependenciesOf(door), ['scenery/crypt-door--open', 'scenery/crypt-door--opening'], 'sibling names, never the sheet itself');
const chest = readSheet('props/reliquary', { meta: { mode: 'directions', data: { role: 'prop', stateSheets: { shut: 'props/reliquary', open: 'reliquary--open' } } }, frames: {} });
assert.deepEqual(dependenciesOf(chest), ['props/reliquary--open'], 'a name with a `/` is a path from the assets root');
assert.equal(sheetNamed('a/b/c', 'd'), 'a/b/d');
assert.equal(sheetNamed('c', 'd'), 'd');
assert.deepEqual(dependenciesOf(imageSheet('props/stone', { width: 1, height: 1 })), []);

// 3. A character is the clips that share a manifest; its controls give the bindings.
const library = buildLibrary(characterSheets('characters/mage', specs, manifest));
assert.equal(library.characters.length, 1);
const mage = library.characters[0];
assert.equal(mage.name, 'mage');
assert.equal(mage.id, 'characters/mage|mage');
assert.equal(mage.folder, 'characters/mage');
assert.equal(mage.idle?.key, 'idle');
assert.deepEqual(mage.locomotion.map((c) => c.key), ['walk', 'run']);
// Numbered actions: attack first, then skill, then the rest, whatever order the manifest lists them in. Hit and death keep their own keys.
assert.deepEqual(mage.actions.map((c) => c.key), ['slash', 'howl', 'dodge']);
assert.equal(mage.hit?.key, 'hit');
assert.equal(mage.death?.key, 'death');
assert.deepEqual(mage.warnings, ['arm length differs between skins']);
assert.equal(mage.locomotion[1].groundSpeed, 80, 'groundSpeed stays in world units');
assert.equal(mage.locomotion[1].scale, 2, 'with the sheet\'s scale beside it');
assert.equal(mage.actions[0].cancelFrame, 5);
assert.deepEqual(mage.actions[0].travel?.slice(0, 3), [0, 2, 4], 'travel stays in world units');
assert.equal(mage.tilt, 30, 'the camera tilt comes from the manifest');
assert.equal(mage.scale, 2);
assert.equal(mage.manifest?.name, 'mage');
assert.equal(mage.actions[0].rects(0).length, 10, 'the frames of a row');
assert.deepEqual(mage.actions[0].rects(2)[3], { x: 300, y: 200, width: 100, height: 100 }, 'cells on the grid when the atlas lists none');

// Cells by name (`<DIR>_<n>`, or `frame_<n>` for one facing), wherever they are on the sheet: a packed sheet's trimmed
// frames carry where they were cut from their cell, and `framesOf` and `shownFrame` hand that on.
const packed = clipSheet({ key: 'pose', action: 'idle', clipKind: 'idle', frames: 2 }, manifest);
packed.meta.animations = { pose: [0, 1] };
packed.frames = {
  S_0: { x: 3, y: 5, width: 40, height: 60, ox: 30, oy: 20, cellW: 100, cellH: 100 },
  S_1: { x: 50, y: 5, width: 42, height: 61, ox: 29, oy: 19, cellW: 100, cellH: 100 },
  W_0: { x: 3, y: 70, width: 38, height: 60 },
  W_1: { x: 50, y: 70, width: 39, height: 60 },
};
const pose = buildLibrary([readSheet('characters/mage/pose', packed)]).characters[0].clips[0];
assert.deepEqual(pose.rects(0), [packed.frames.S_0, packed.frames.S_1], 'the S row is the S cells, by name');
assert.deepEqual(pose.rects(2).map((r) => [r.x, r.y]), [[3, 70], [50, 70]], 'the W row is the W cells, not the grid');
assert.equal(pose.rects(4).length, 2, 'a row it does not list falls back to the grid');
assert.deepEqual(pose.rects(4)[1], { x: 100, y: 400, width: 100, height: 100 });
assert.deepEqual(framesOf(pose, 0)[1], { sheet: 'characters/mage/pose', x: 50, y: 5, w: 42, h: 61, ox: 29, oy: 19, cellW: 100, cellH: 100 }, 'a trimmed frame and its cell');
assert.deepEqual(framesOf(pose, 2)[0], { sheet: 'characters/mage/pose', x: 3, y: 70, w: 38, h: 60, ox: 0, oy: 0, cellW: 38, cellH: 60 }, 'an untrimmed one is its whole cell');
const posing = createActor(pose, { x: 0, y: 0 }, { id: 1 });
assert.deepEqual(shownFrame(posing).frame, framesOf(pose, 0)[0], 'the frame shown is the same frame');
posing.time = 0.15;
assert.deepEqual([shownFrame(posing).index, shownFrame(posing).frame.ox], [1, 29]);
const single = readSheet('props/torch', { meta: { mode: 'strip', frameCount: 2, frameWidth: 16, frameHeight: 32 }, frames: { frame_0: { x: 0, y: 0, width: 16, height: 32 }, frame_1: { x: 20, y: 0, width: 16, height: 30 } } });
assert.deepEqual(buildLibrary([single]).sprites[0].rects(0)[1], { x: 20, y: 0, width: 16, height: 30 }, 'one facing: `frame_<n>`');

// A clip the manifest marks unusable (made for what the character does not hold) is not played, even when its sheet exists.
const holding: CharacterManifest = { ...manifest, wield: { main: { part: 'staff', class: 'staff', hands: 2 } }, clips: manifest.clips.map((c) => (c.key === 'slash' ? { ...c, usable: false, wields: { main: ['blade'] } } : c)), controls: { ...manifest.controls, actions: { ...manifest.controls.actions, attack: [] } } };
const holder = buildLibrary(characterSheets('characters/mage', specs, holding)).characters[0];
assert.ok(!holder.clips.some((c) => c.key === 'slash'), 'not among its clips');
assert.deepEqual(holder.actions.map((c) => c.key), ['howl', 'dodge'], 'nor among its actions');
assert.equal(holder.clips.length, specs.length - 1, 'the rest are untouched');
assert.deepEqual(wieldOf(holder), { main: { part: 'staff', class: 'staff', hands: 2 } }, 'what it holds');
assert.deepEqual(wieldOf(mage), {});
const none: CharacterManifest = { ...manifest, clips: manifest.clips.map((c) => ({ ...c, usable: false })) };
assert.equal(playableClips(mage.clips, none).length, mage.clips.length, 'when none is usable, every clip is kept');

// Older atlases (no manifest, no action): classify from clipKind / groundSpeed / loop, never from names (contract §6).
const old = specs.slice(0, 4).map((c) => {
  const atlas = clipSheet(c);
  delete atlas.meta.data!.action;
  delete atlas.meta.data!.key;
  return readSheet(`characters/mage/${c.key}`, atlas);
});
const legacy = buildLibrary(old).characters[0];
assert.equal(legacy.idle?.key, 'idle');
assert.deepEqual(legacy.locomotion.map((c) => c.key), ['walk', 'run'], 'slowest first');
assert.deepEqual(legacy.actions.map((c) => c.key), ['slash']);
assert.equal(legacy.hit, null);
assert.equal(legacy.tilt, 48, 'without a manifest the tilt is 48');
assert.equal(legacy.id, 'characters/mage|humanoid');
// Without clipKind either: locomotion moves, idle loops, the rest acts.
const bare = specs.slice(0, 4).map((c) => {
  const atlas = clipSheet(c);
  for (const key of ['action', 'key', 'clipKind'] as const) delete atlas.meta.data![key];
  return readSheet(`characters/mage/${c.key}`, atlas);
});
assert.deepEqual(buildLibrary(bare).characters[0].clips.map((c) => [c.key, c.category, c.kind]), [['idle', 'idle', 'idle'], ['walk', 'locomotion', 'walk'], ['run', 'locomotion', 'walk'], ['slash', 'action', 'action']]);
// One folder, three bodies: split by skeleton and pivot.
const wolf = (key: string) => {
  const atlas = clipSheet({ key, action: 'idle', clipKind: 'idle', frames: 4, frameWidth: 160 });
  atlas.meta.data!.skeleton = 'quadruped';
  return readSheet(`legacy/mixed/wolf-${key}`, atlas);
};
const tall = (key: string) => {
  const atlas = clipSheet({ key, action: 'idle', clipKind: 'idle', frames: 4, frameWidth: 120 });
  return readSheet(`legacy/mixed/tall-${key}`, atlas);
};
const mixed = buildLibrary([...old.map((s) => readSheet(`legacy/mixed/${s.asset.path.split('/').pop()}`, s.atlas!)), wolf('idle'), tall('idle')]);
assert.deepEqual(mixed.characters.map((c) => [c.id, c.clips.length]), [['legacy/mixed|humanoid', 4], ['legacy/mixed|quadruped', 1], ['legacy/mixed|humanoid', 1]], 'two humanoids of one folder share an id, so characters are a list');

// 4. Effects, interface pieces and icons are kept apart; anything else that plays is a sprite.
const withOthers = buildLibrary([
  ...characterSheets('characters/mage', specs, manifest),
  readSheet('vfx/soul-bolt', { meta: { mode: 'directions', frameCount: 4, data: { role: 'vfx', effect: { id: 'soul-bolt', kind: 'projectile', frames: 4, loop: true } as never } }, frames: {} }),
  readSheet('icons/potion', { meta: { mode: 'strip', frameCount: 1, data: { role: 'icon', item: { id: 'potion', label: 'Potion', kind: 'consumable', rarity: 'common' } } }, frames: {} }),
  readSheet('ui/panel', { meta: { mode: 'strip', frameCount: 1, scale: 2, data: { role: 'ui', kind: 'panel', nineSlice: { left: 4, top: 4, right: 4, bottom: 4 }, states: ['normal', 'hover'] } }, frames: {} }),
  readSheet('gear/helm', { meta: { mode: 'directions', frameCount: 1, data: { role: 'gear', part: 'helm', character: 'guard' } }, frames: {} }),
  readSheet('props/chest', { meta: { mode: 'strip', frameCount: 4, frameWidth: 40, frameHeight: 30, fps: 6, data: { role: 'prop', loop: false } }, frames: {} }),
  readSheet('props/grid', { meta: { mode: 'grid', data: { role: 'prop' } }, frames: {} }),
  imageSheet('props/stone', { width: 64, height: 48 }),
]);
assert.deepEqual([...withOthers.effects.keys()], ['soul-bolt']);
assert.deepEqual([...withOthers.icons.keys()], ['potion'], 'icons by item');
assert.deepEqual([...withOthers.ui.keys()], ['ui/panel'], 'interface pieces by path');
const panel = withOthers.ui.get('ui/panel')!;
assert.deepEqual([panel.kind, panel.scale, panel.states, panel.nineSlice, panel.fillBox, panel.grows], ['panel', 2, ['normal', 'hover'], { left: 4, top: 4, right: 4, bottom: 4 }, null, 'right']);
assert.deepEqual(withOthers.characters.map((c) => c.name), ['mage'], 'the gear item does not join a character');
assert.deepEqual(withOthers.sprites.map((c) => c.asset.path), ['gear/helm', 'props/chest', 'props/stone'], 'grid sheets are not playable');
const chestClip = withOthers.sprites[1];
assert.deepEqual([chestClip.key, chestClip.kind, chestClip.category, chestClip.fps, chestClip.frameCount, chestClip.loop], ['chest', 'action', 'action', 6, 4, false]);
const stone = withOthers.sprites[2];
assert.deepEqual([stone.key, stone.frameCount, stone.rects(0), stone.atlas.meta.pivot], ['stone', 1, [{ x: 0, y: 0, width: 64, height: 48 }], undefined], 'an image: one frame, anchored at the bottom centre');

// 5. The sample's real sheets (cut from its export: tests/runtime/fixtures).
const real = buildLibrary(fixtureSheets('characters', 'vfx'));
const byName = (name: string) => real.characters.find((c) => c.name === name)!;
assert.deepEqual(real.characters.map((c) => c.name), ['ossuary-guard', 'malvek', 'ghoul-wolf']);
const guard = byName('ossuary-guard');
assert.deepEqual(guard.locomotion.map((c) => c.key), ['walk', 'run']);
// The slash fixture keeps the cells its export wrote: each row is its facing's cells, by name.
const slashSheet = guard.clips.find((c) => c.key === 'slash')!;
const slashCells = slashSheet.atlas.frames;
assert.ok(Object.keys(slashCells).length === 8 * slashSheet.frameCount, 'one cell per facing and frame');
for (const [row, dir] of (slashSheet.atlas.meta.directions ?? []).entries()) {
  assert.deepEqual(slashSheet.rects(row), slashSheet.atlas.meta.animations!.slash.map((i) => slashCells[`${dir}_${i}`]), `${dir}: its own cells`);
}
assert.deepEqual(framesOf(slashSheet, 6)[4], { sheet: 'characters/guard/slash', x: slashCells.E_4.x, y: slashCells.E_4.y, w: slashCells.E_4.width, h: slashCells.E_4.height, ox: 0, oy: 0, cellW: slashCells.E_4.width, cellH: slashCells.E_4.height });
assert.deepEqual(guard.actions.map((c) => c.key), ['slash', 'cleave', 'dash', 'backstep', 'jump']);
assert.deepEqual([guard.hit?.key, guard.death?.key, guard.idle?.key, guard.tilt, guard.scale], ['hit', 'death', 'idle', 48, 2]);
assert.deepEqual(byName('malvek').actions.map((c) => c.key), ['reap', 'soulbolt', 'backstep']);
assert.deepEqual(byName('ghoul-wolf').actions.map((c) => c.key), ['bite', 'howl']);
assert.ok(guard.clips.every((c) => c.atlas.meta.directions?.length === 8));
assert.equal(real.effects.get('soul-bolt')?.follows, 'soul-burst');
assert.deepEqual(dependenciesOf(fixtureSheets('characters/malvek/idle')[0]).filter((p) => p.startsWith('vfx/')), ['vfx/cast-circle', 'vfx/soul-bolt', 'vfx/slash-spark', 'vfx/death-souls'], 'Malvek\'s cued effects');
const sheetsOfMalvek = new Set(fixtureSheets('characters/malvek').map((s) => s.asset.path));
assert.ok(dependenciesOf(fixtureSheets('characters/malvek/idle')[0]).filter((p) => p.startsWith('characters/')).every((p) => sheetsOfMalvek.has(p)), 'every clip the manifest lists is a sheet of the export');

console.log('✅ library checks passed');
