import assert from 'node:assert/strict';
import { buildRows, entrySubtitle, findsCharacter, listEntries, matches, pushRecent, RECENT_LIMIT, sceneToPlay, type Entry } from '../../viewer/src/lib/playground/catalog';
import { createTranslator } from '../../viewer/src/i18n/core';
import { shownFrame, type Atlas, type CharacterManifest } from '@diorama/runtime';
import { advance, currentFrame, hudOf, isStep, newActor, reset, startClip, stepPlayer, type ClipEvent } from '../../viewer/src/lib/playground/actor';
import { socketPoint, spawnFromEvent, stepEffects, type Effect } from '../../viewer/src/lib/playground/effects';
import { buildLibrary } from '../../viewer/src/lib/playground/library';
import { DEFAULT_ZOOM, fitZoom, ZOOMS } from '../../viewer/src/lib/playground/view';
import type { AssetFileMeta } from '../../viewer/src/lib/types';
import { DIRS, clipSheet as sheet, type ClipSpec } from '../runtime/helpers';

console.log('🧪 Checking the playground (palette search, folders, recents; the runtime\'s actors in the view: moves and root motion in actor units at each clip\'s scale, exact view points, the view\'s sides, sockets, the generic rings; the HUD\'s strides, only when asked; the zoom that fits a scene)...\n');

const entry = (key: string, name: string, group: string, kind: Entry['kind'] = 'animated') =>
  ({ key, name, group, kind, subtitle: '', cover: {}, armed: {} }) as unknown as Entry;

const entries = [
  entry('c:guard', 'guard', 'characters', 'character'),
  entry('c:wolf', 'wolf', 'characters', 'character'),
  entry('s:tomb', 'tombstone', 'props', 'still'),
  entry('s:chest', 'reliquary', 'props', 'still'),
  entry('s:fire', 'torch10', 'fx'),
  entry('s:fire2', 'torch2', 'fx'),
];

// Every word must match "group/name", in any order, ignoring case.
assert.ok(matches(entries[0], 'GUA'));
assert.ok(matches(entries[0], 'characters guard'));
assert.ok(!matches(entries[0], 'guard props'));
assert.ok(matches(entries[0], ''));

const base = { query: '', filter: 'all' as const, collapsed: new Set<string>(), recent: [] as string[] };
// The block of recent entries has no name of its own: the list names it in the language of the screen.
const labels = (rows: ReturnType<typeof buildRows>) => rows.map((r) => (r.type === 'header' ? `# ${r.kind === 'recent' ? 'recent' : r.label} ${r.count}` : r.entry.name));

// One header per folder, folders and names sorted naturally (torch2 before torch10).
assert.deepEqual(labels(buildRows(entries, base)), ['# characters 2', 'guard', 'wolf', '# fx 2', 'torch2', 'torch10', '# props 2', 'reliquary', 'tombstone']);

// Kind filter.
assert.deepEqual(labels(buildRows(entries, { ...base, filter: 'character' })), ['# characters 2', 'guard', 'wolf']);
assert.deepEqual(labels(buildRows(entries, { ...base, filter: 'object' })).filter((l) => !l.startsWith('#')), ['torch2', 'torch10', 'reliquary', 'tombstone']);

// A collapsed folder keeps its header and count but hides its entries, until a search opens every folder.
const collapsed = new Set(['fx']);
assert.deepEqual(labels(buildRows(entries, { ...base, collapsed })), ['# characters 2', 'guard', 'wolf', '# fx 2', '# props 2', 'reliquary', 'tombstone']);
assert.deepEqual(labels(buildRows(entries, { ...base, collapsed, query: 'torch' })), ['# fx 2', 'torch2', 'torch10']);

// Recents come first, only when not searching, and skip entries a filter hides.
assert.deepEqual(labels(buildRows(entries, { ...base, recent: ['s:tomb', 'c:wolf', 'gone'] })).slice(0, 3), ['# recent 2', 'tombstone', 'wolf']);
assert.ok(!labels(buildRows(entries, { ...base, recent: ['s:tomb'], query: 'wolf' })).includes('# recent 1'));
assert.ok(!labels(buildRows(entries, { ...base, recent: ['s:tomb'], filter: 'character' })).some((l) => l.startsWith('# recent')));

// Recents: newest first, no repeats, bounded.
assert.deepEqual(pushRecent(['b', 'a', 'c'], 'a'), ['a', 'b', 'c']);
assert.equal(pushRecent(Array.from({ length: 20 }, (_, i) => `k${i}`), 'new').length, RECENT_LIMIT);

// The scene to play: the one a link names (Save scene's "Play it in the Playground") when the project has it, else the one chosen last time.
assert.equal(sceneToPlay(['crypt', 'yard'], 'yard', 'crypt'), 'yard', 'a link wins over the remembered scene');
assert.equal(sceneToPlay(['crypt', 'yard'], undefined, 'crypt'), 'crypt');
assert.equal(sceneToPlay(['crypt', 'yard'], 'gone', 'crypt'), 'crypt', 'a stale link falls back');
assert.equal(sceneToPlay(['crypt'], undefined, 'gone'), '', 'a remembered scene that is gone plays none');
assert.equal(sceneToPlay([], 'yard', 'yard'), '', 'a project without a scenery kit plays none');

// ---- The runtime's library and actors in the view (the rules themselves are tested in tests/runtime/) ----

function asset(folder: string, key: string): AssetFileMeta {
  return { project: 'p', root: 'projects', subpath: `${folder}/${key}.png`, filename: `${key}.png`, format: 'png', size: 1, mtime: 1, url: `/${folder}/${key}.png`, width: 800, height: 800, atlas: `${folder}/${key}.json`, sheet: null, sourceMtime: null, engine: 'volume', atlasInfo: null };
}

const specs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'walk', action: 'walk', clipKind: 'locomotion', frames: 8, groundSpeed: 40 },
  { key: 'run', action: 'run', clipKind: 'locomotion', frames: 8, groundSpeed: 80 },
  { key: 'slash', action: 'attack', clipKind: 'action', frames: 10, events: [{ frame: 3, name: 'hit' }, { frame: 5, name: 'cancel' }], travel: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
  { key: 'howl', action: 'skill', clipKind: 'action', frames: 10, events: [{ frame: 2, name: 'cast' }, { frame: 6, name: 'release' }, { frame: 6, name: 'spawn:mouth' }], sockets: { names: ['head', 'center', 'mouth'], frames: { S_6: [[0, 0, 1], [0, 0, 1], [10, 20, 1]] } } },
  { key: 'dodge', action: 'dodge', clipKind: 'action', frames: 6 },
  { key: 'hit', action: 'hit', clipKind: 'action', frames: 4 },
  { key: 'death', action: 'death', clipKind: 'action', frames: 6, hold: true },
];
const manifest: CharacterManifest = {
  name: 'mage', skeleton: 'humanoid', scale: 2, camera: { tilt: 30, heightBoost: 1.2 }, directions: DIRS, sockets: ['head', 'center', 'mouth'],
  clips: [], warnings: ['arm length differs between skins'],
  controls: { idle: 'idle', move: ['walk', 'run'], actions: { skill: ['howl'], hit: ['hit'], attack: ['slash'], death: ['death'], dodge: ['dodge'] } },
};

const assets = specs.map((c) => asset('characters/mage', c.key));
const withManifest = new Map(specs.map((c) => [`characters/mage/${c.key}.png`, sheet(c, manifest)]));
const library = buildLibrary(assets, withManifest);
assert.equal(library.characters.length, 1);
const mage = library.characters[0];
assert.equal(mage.name, 'mage');
assert.equal(mage.label, 'mage', 'a manifest without a label (exported before labels) is named by its id');
assert.equal(mage.idle?.key, 'idle');
assert.deepEqual(mage.locomotion.map((c) => c.key), ['walk', 'run']);
assert.deepEqual(mage.actions.map((c) => c.key), ['slash', 'howl', 'dodge'], 'bound by the runtime (its rules: tests/runtime/library.test.ts)');
assert.deepEqual([mage.locomotion[1].groundSpeed, mage.locomotion[1].scale], [80, 2], 'groundSpeed is in world units (logical px): the view multiplies it by scale');
assert.deepEqual(mage.actions[0].travel?.slice(0, 3), [0, 2, 4], 'travel is in world units too');
assert.deepEqual([mage.actions[0].asset.subpath, mage.actions[0].asset.url, mage.actions[0].asset.path], ['characters/mage/slash.png', '/characters/mage/slash.png', 'characters/mage/slash'], 'a clip keeps the asset it was read from, and the runtime\'s path');

// A character is named by its label, the name people read, with its folder (what a game loads it by) under it, in the
// palette as in the Control picker; it is found by its label, its folder and its id, and the HUD and the popover say the label.
const labelled = buildLibrary(assets, new Map(specs.map((c) => [`characters/mage/${c.key}.png`, sheet(c, { ...manifest, name: 'battle-mage', label: 'Battle Mage' })])));
const [battleMage] = labelled.characters;
const [mageEntry] = listEntries(labelled);
assert.deepEqual([mageEntry.name, mageEntry.detail], ['Battle Mage', { type: 'character', clips: 8, id: 'characters/mage' }]);
assert.equal(entrySubtitle(mageEntry.detail, createTranslator('en')), 'characters/mage · 8 animations');
assert.equal(entrySubtitle(mageEntry.detail, createTranslator('pt-BR')), 'characters/mage · 8 animações');
assert.ok(['battle', 'characters/mage', 'battle-mage', 'MAGE characters'].every((query) => matches(mageEntry, query)), 'found by label, folder and id');
assert.ok(!matches(mageEntry, 'wolf'));
// The Control picker's own search (Base UI would search the label alone) finds the same queries.
assert.ok(['battle', 'characters/mage', 'battle-mage', 'MAGE characters'].every((query) => findsCharacter(battleMage, query)), 'the picker finds by label, folder and id');
assert.ok(!findsCharacter(battleMage, 'wolf') && findsCharacter(battleMage, ''));
assert.equal(hudOf(newActor(1, battleMage.idle!, 0, 0, battleMage), false, false).character, 'Battle Mage');

// A gear item names its wearer as text (`character: 'guard'`): it is an object to place, not a character, and not a crash.
const gearAtlas = (() => { const a = sheet({ key: 'helm', action: 'idle', clipKind: 'idle', frames: 1 }); a.meta.data = { role: 'gear', part: 'helm', label: 'Elmo', group: 'head', character: 'guard' }; return a; })();
const withGear = buildLibrary([...assets, asset('gear', 'helm')], new Map([...withManifest, ['gear/helm.png', gearAtlas]]));
assert.deepEqual(withGear.characters.map((c) => c.name), ['mage'], 'the item does not join a character');
assert.deepEqual(withGear.sprites.map((s) => s.id), ['gear/helm.png'], 'it is a sprite');
assert.equal(listEntries(withGear).find((e) => e.key === 'sprite:gear/helm.png')?.name, 'Elmo', 'named by its label');
// While a character's atlases load, the first to arrive can be its hit clip alone, which the runtime binds as no action: it is
// listed and pictured by that clip, never a crash (the Playground used to fail on it about one cold load in three).
const partial = buildLibrary([asset('characters/mage', 'hit')], new Map([['characters/mage/hit.png', sheet(specs[6], manifest)]]));
assert.ok(partial.characters.length === 1 && partial.characters[0].idle === null && partial.characters[0].locomotion.length === 0 && partial.characters[0].actions.length === 0, 'a character of its hit clip alone has nothing to start from but that clip');
assert.equal(listEntries(partial)[0]?.cover.subpath, 'characters/mage/hit.png', 'it is listed, pictured by the clip it has');
const props = buildLibrary([asset('props', 'chest')], new Map([['props/chest.png', (() => { const a = sheet(specs[0]); a.meta.data = { role: 'prop' }; return a; })()]]));
assert.equal(props.characters.length, 0, 'a prop is not a character');
assert.equal(props.sprites.length, 1);
// An atlas that is not one (no `meta` object) is left out, like one that failed to load; cells listed in another packer's
// shape play on the grid. Neither takes the Playground down.
const odd = (frames: unknown, meta: unknown = { mode: 'strip', frameCount: 2, frameWidth: 4, frameHeight: 4 }) => ({ meta, frames }) as unknown as Atlas;
const oddLibrary = buildLibrary([asset('props', 'array'), asset('props', 'none'), asset('props', 'broken'), asset('props', 'chest')], new Map([
  ['props/array.png', odd([])],
  ['props/none.png', odd(null)],
  ['props/broken.png', odd({}, [])],
  ['props/chest.png', odd({})],
]));
assert.deepEqual(oddLibrary.sprites.map((s) => s.id), ['props/array.png', 'props/none.png', 'props/chest.png'], 'the broken atlas is left out, the rest stay');
assert.deepEqual(oddLibrary.sprites[0].clip.rects(0)[1], { x: 4, y: 0, width: 4, height: 4 }, 'cells on the grid');

// Playing, through the view (the rules are the runtime's: tests/runtime/actor.test.ts): events are emitted as they fire,
// positions are actor units (exported px).
const events: string[] = [];
// `start` and `end` are the beginning and the end of an action, not events of its sheet: effects are cued on them (tested with the effects below).
const emit = (e: ClipEvent) => e.name !== 'start' && e.name !== 'end' && events.push(`${e.clip.key}:${e.frame}:${e.name}`);
const tick = (actor: ReturnType<typeof newActor>, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.01) advance(actor, 0.01, emit);
};
const spawn = () => newActor(1, mage.idle!, 100, 200, mage);
const slash = mage.actions[0];
const howl = mage.actions[1];

// Events, in frame order, once each, emitted by the view as the runtime returns them; `startClip` refuses what priority refuses.
let a = spawn();
assert.ok(startClip(a, slash, emit));
assert.equal(startClip(a, howl, emit), false, 'not before the slash\'s cancel event');
events.length = 0;
a = spawn();
startClip(a, slash, emit);
tick(a, 1.1);
assert.deepEqual(events, ['slash:3:hit', 'slash:5:cancel']);
events.length = 0;
a = spawn();
const effects: Effect[] = [];
const collect = (e: ClipEvent) => spawnFromEvent(e, effects);
startClip(a, howl, collect);
for (let t = 0; t < 1.1; t += 0.01) advance(a, 0.01, collect);
const projectile = effects.find((e) => e.type === 'projectile');
assert.ok(projectile && projectile.type === 'projectile');
// 8. socket = cell origin + [x, y] × scale: (100 - 50 + 10×2, 200 - 90 + 20×2)
assert.deepEqual([Math.round(projectile!.x), Math.round(projectile!.y)], [70, 150]);
assert.equal(projectile!.behind, false, 'd > 0 is drawn in front of the body');
assert.deepEqual(socketPoint(a, howl, 0, 6, 'mouth'), { x: 70, y: 150, depth: 1 });
// The shot ends where its range runs out (150 logical px = 300 exported px at scale 2, facing S) and a ring marks the spot.
const shot: Effect[] = [{ ...projectile! }];
let flying = shot;
for (let t = 0; t < 1.3; t += 0.01) flying = stepEffects(flying, 0.01);
assert.ok(flying.every((e) => e.type === 'ring') && flying.length === 1, 'the projectile is replaced by a ring when its range ends');
assert.ok(Math.abs(flying[0].y - (projectile!.y + 300)) < 8, 'it flew 300 px along its facing');
// Leaving the scene ends it early, with the ring inside the edge.
const edge = stepEffects([{ ...projectile! }], 0.5, { width: 500, height: 200 });
assert.equal(edge.length, 1);
assert.deepEqual([edge[0].type, edge[0].y], ['ring', 200]);
assert.equal(socketPoint(a, howl, 0, 6, 'tail'), null);
assert.ok(effects.some((e) => e.type === 'ring'), 'cast shows a ring');

// An area skill draws its own rings in the sheet: `release` adds no projectile on top of them.
const roarSpecs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'roar', action: 'skill', clipKind: 'action', frames: 10, tags: ['aoe'], events: [{ frame: 2, name: 'cast' }, { frame: 5, name: 'release' }, { frame: 5, name: 'spawn:mouth' }] },
];
const roarLibrary = buildLibrary(
  roarSpecs.map((c) => asset('characters/beast', c.key)),
  new Map(roarSpecs.map((c) => [`characters/beast/${c.key}.png`, sheet(c)])),
);
const roar = roarLibrary.characters[0].actions[0];
assert.deepEqual(roar.tags, ['aoe']);
const roarEffects: Effect[] = [];
const roarActor = newActor(2, roarLibrary.characters[0].idle!, 100, 200, roarLibrary.characters[0]);
startClip(roarActor, roar, (e) => spawnFromEvent(e, roarEffects));
for (let t = 0; t < 1.1; t += 0.01) advance(roarActor, 0.01, (e) => spawnFromEvent(e, roarEffects));
assert.equal(roarEffects.length, 0, 'an aoe skill adds no projectile and no ring: its sheet draws them');

// A blow lands just past the weapon's tip, so a long body (a wolf) does not get the ring in the middle of its back.
const swordSpecs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'stab', action: 'attack', clipKind: 'action', frames: 6, events: [{ frame: 2, name: 'hit' }], sockets: { names: ['hand', 'tip'], frames: { S_2: [[10, 20, 1], [30, 40, 1]] } } },
];
const swordLibrary = buildLibrary(
  swordSpecs.map((c) => asset('characters/knight', c.key)),
  new Map(swordSpecs.map((c) => [`characters/knight/${c.key}.png`, sheet(c)])),
);
const knight = swordLibrary.characters[0];
const swordEffects: Effect[] = [];
const swordActor = newActor(3, knight.idle!, 100, 200, knight);
startClip(swordActor, knight.actions[0], (e) => spawnFromEvent(e, swordEffects));
for (let t = 0; t < 1; t += 0.01) advance(swordActor, 0.01, (e) => spawnFromEvent(e, swordEffects));
const blow = swordEffects.find((e) => e.type === 'ring' && e.tone === 'hit');
assert.ok(blow, 'hit shows a ring');
// tip (30, 40) × scale 2 from the cell origin (100 - 50, 200 - 90), plus 12 px along the facing (S = down)
assert.deepEqual([Math.round(blow!.x), Math.round(blow!.y)], [100 - 50 + 60, 200 - 90 + 80 + 12]);

// The looping base clip fires its own events (`step:<leg>`) in order, lap after lap, so the HUD can show them.
const strideSpecs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'walk', action: 'walk', clipKind: 'locomotion', frames: 8, groundSpeed: 40, events: [{ frame: 0, name: 'step:legL' }, { frame: 4, name: 'step:legR' }] },
];
const strideLibrary = buildLibrary(
  strideSpecs.map((c) => asset('characters/ghoul', c.key)),
  new Map(strideSpecs.map((c) => [`characters/ghoul/${c.key}.png`, sheet(c)])),
);
const ghoul = strideLibrary.characters[0];
const steps: string[] = [];
const walker = newActor(4, ghoul.locomotion[0], 100, 200, ghoul);
for (let t = 0; t < 1.55; t += 0.01) advance(walker, 0.01, (e) => steps.push(`${e.name}@${e.frame}`));
assert.deepEqual(steps, ['step:legL@0', 'step:legR@4', 'step:legL@0', 'step:legR@4'], 'two laps of an 8-frame clip at 10 fps');
assert.equal(walker.lastEvent?.name, 'step:legR');

// The HUD names strides only when asked: by default its event is the last one that is not a stride, so a hit stays while walking away.
assert.ok(isStep('step:legL') && isStep('step') && !isStep('hit') && !isStep('stepping'));
const hudSpecs: ClipSpec[] = [...strideSpecs, { key: 'stab', action: 'attack', clipKind: 'action', frames: 6, events: [{ frame: 2, name: 'hit' }] }];
const hudLibrary = buildLibrary(
  hudSpecs.map((c) => asset('characters/ghast', c.key)),
  new Map(hudSpecs.map((c) => [`characters/ghast/${c.key}.png`, sheet(c)])),
);
const ghast = hudLibrary.characters[0];
const room = { width: 5000, height: 5000 };
// From idle, so no stride comes before the hit.
const fighter = newActor(7, ghast.idle!, 400, 400, ghast);
assert.equal(hudOf(fighter, false, false).event, null);
assert.ok(startClip(fighter, ghast.actions[0], () => {}));
for (let t = 0; t < 1; t += 0.01) stepPlayer(fighter, { dx: 0, dy: 0, run: false }, 0.01, room, () => {});
assert.equal(fighter.act, null, 'the stab is over');
assert.equal(hudOf(fighter, false, false).event, 'hit · stab f2', 'start and end are not events of the sheet');
for (let t = 0; t < 1; t += 0.01) stepPlayer(fighter, { dx: 1, dy: 0, run: false }, 0.01, room, () => {});
assert.equal(fighter.clip.key, 'walk');
assert.ok(hudOf(fighter, true, true).event?.startsWith('step:'), 'asked for, the strides show');
assert.equal(hudOf(fighter, true, false).event, 'hit · stab f2', 'by default the hit stays');
reset(fighter);
assert.equal(hudOf(fighter, false, false).event, null, 'R forgets it');
assert.equal(hudOf(fighter, false, true).event, null);
// Every event counts, not only the runtime's last: a frame that fires another event and then a stride keeps the other one.
const creakSpecs: ClipSpec[] = [strideSpecs[0], { ...strideSpecs[1], events: [{ frame: 4, name: 'creak' }, { frame: 4, name: 'step:legR' }] }];
const creakLibrary = buildLibrary(
  creakSpecs.map((c) => asset('characters/creaker', c.key)),
  new Map(creakSpecs.map((c) => [`characters/creaker/${c.key}.png`, sheet(c)])),
);
const creaker = newActor(8, creakLibrary.characters[0].locomotion[0], 400, 400, creakLibrary.characters[0]);
for (let t = 0; t < 0.6; t += 0.01) advance(creaker, 0.01);
assert.equal(creaker.lastEvent?.name, 'step:legR');
assert.equal(hudOf(creaker, true, false).event, 'creak · walk f4');

// The zoom that shows all of a scene, by the Details window's rule: the largest whole zoom, up to the largest offered, else a fraction.
assert.equal(DEFAULT_ZOOM, 2);
assert.equal(fitZoom({ width: 300, height: 200 }, { width: 1000, height: 700 }), 3, 'floor of min(952 / 300, 652 / 200)');
assert.equal(fitZoom({ width: 100, height: 100 }, { width: 2000, height: 2000 }), ZOOMS.at(-1), 'never past 4×');
assert.equal(fitZoom({ width: 1248, height: 984 }, { width: 1120, height: 720 }), (720 - 48) / 984, 'a sample scene in a laptop-sized box: a fraction, not floored');
assert.equal(fitZoom({ width: 10000, height: 10000 }, { width: 500, height: 500 }), 0.1, 'never under a tenth');
assert.equal(fitZoom({ width: 300, height: 200 }, { width: 0, height: 0 }), null, 'a hidden pane fits nothing');
assert.equal(fitZoom({ width: 300, height: 200 }, { width: 48, height: 700 }), null);

// The scene keeps a sprite's own width inside its sides: a wide cell stops further from the edge than a narrow one.
const wideSpecs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4, frameWidth: 224 },
  { key: 'amble', action: 'walk', clipKind: 'locomotion', frames: 8, groundSpeed: 40, frameWidth: 224 },
];
const wideLibrary = buildLibrary(
  wideSpecs.map((c) => asset('characters/wolf', c.key)),
  new Map(wideSpecs.map((c) => [`characters/wolf/${c.key}.png`, sheet(c)])),
);
const narrow = newActor(5, ghoul.idle!, 150, 200, ghoul);
const wide = newActor(6, wideLibrary.characters[0].idle!, 150, 200, wideLibrary.characters[0]);
for (const actor of [narrow, wide]) {
  for (let t = 0; t < 3; t += 0.01) stepPlayer(actor, { dx: -1, dy: 0, run: false }, 0.01, { width: 5000, height: 5000 }, () => {});
}
assert.equal(narrow.x, 60, 'a 100 px cell keeps the minimum room');
assert.equal(wide.x, 112, 'a 224 px cell keeps half of itself inside the scene');

// 7. root motion: the sprite covers the clip's travel along the facing it started with (S = down), whatever the input does.
a = spawn();
a.row = 0;
startClip(a, slash, emit);
tick(a, 1.2);
assert.equal(Math.round(a.x), 100);
assert.equal(Math.round(a.y), 200 + 20, 'travel 20 logical units × scale 2, squashed by sin(30°) = 0.5 going down the screen');

// A point of the view set on an actor (a drag, the scene moving under it) moves its floor point there.
a = spawn();
a.x += 24;
a.y -= 10;
assert.deepEqual([a.x, a.y], [124, 190]);
assert.ok(Math.abs(a.pos.x - 62) < 1e-9 && Math.abs(a.pos.y - 190 / (2 * 0.5)) < 1e-9, 'on the floor: x over the scale, y over the scale and sin(tilt)');

// 2. moving: at groundSpeed × scale along the input, Shift takes the fastest gait.
a = spawn();
for (let t = 0; t < 1; t += 0.01) stepPlayer(a, { dx: 1, dy: 0, run: false }, 0.01, { width: 5000, height: 5000 }, emit);
assert.equal(a.clip.key, 'walk');
assert.ok(Math.abs(a.x - 100 - 80) < 1, 'walk covers 40 × 2 px in a second');
assert.equal(a.row, 6, 'facing east');
a = spawn();
for (let t = 0; t < 1; t += 0.01) stepPlayer(a, { dx: 0, dy: -1, run: true }, 0.01, { width: 5000, height: 5000 }, emit);
assert.equal(a.clip.key, 'run');
assert.ok(Math.abs(200 - a.y - 80) < 1, 'run covers 80 × 2 px in a second, squashed by sin(30°) = 0.5 going up the screen');
// The facing follows the input's angle, the screen velocity follows the camera: down-right is SE, and its vertical part is halved.
a = spawn();
for (let t = 0; t < 1; t += 0.01) stepPlayer(a, { dx: 1, dy: 1, run: false }, 0.01, { width: 5000, height: 5000 }, emit);
assert.equal(a.row, 7, 'facing south-east');
assert.ok(Math.abs(a.x - 100 - 80 / Math.SQRT2) < 1);
assert.ok(Math.abs(a.y - 200 - (80 / Math.SQRT2) * 0.5) < 1);

// Points the view puts somewhere read back exactly, though the floor keeps them in world units: through the sample's 48°
// camera, 192.5 px would come back as 192.49999999999997, and the canvas would round the sprite a pixel off.
const tilted = buildLibrary(assets, new Map(specs.map((c) => [`characters/mage/${c.key}.png`, sheet(c, { ...manifest, camera: { tilt: 48, heightBoost: 1.2 } })]))).characters[0];
const ky48 = Math.sin((48 * Math.PI) / 180);
assert.notEqual((192.5 / (2 * ky48)) * ky48 * 2, 192.5, 'the round trip this guards against');
const exact = newActor(7, tilted.idle!, 300.5, 192.5, tilted);
assert.deepEqual([exact.x, exact.y], [300.5, 192.5], 'a spawn at half pixels');
assert.ok(Math.abs(exact.pos.y - 192.5 / (2 * ky48)) < 1e-9, 'while its floor point is in world units');
exact.y = 377.5;
exact.x = 0.1 + 0.2;
assert.deepEqual([exact.x, exact.y], [0.1 + 0.2, 377.5], 'a drag to any point');
for (let t = 0; t < 1; t += 0.01) stepPlayer(exact, { dx: 1, dy: 0, run: false }, 0.01, { width: 5000, height: 5000 }, emit);
assert.equal(exact.y, 377.5, 'walking east keeps its row of pixels');
for (let t = 0; t < 2; t += 0.01) stepPlayer(exact, { dx: 0, dy: 1, run: true }, 0.01, { width: 5000, height: 400.5 }, emit);
assert.equal(exact.y, 400.5, 'the view\'s edge, exactly');
for (let t = 0; t < 2; t += 0.01) stepPlayer(exact, { dx: -1, dy: 0, run: true }, 0.01, { width: 5000, height: 400.5 }, emit);
assert.deepEqual([exact.x, exact.y], [60, 400.5], 'and its side (a 100 px cell keeps 60 px of room)');

// The view draws each sheet at its own export scale, so a clip moves its sprite by its own `meta.scale`: a walk exported at
// scale 1 for a character at scale 2 covers 40 px a second, not 80 (the runtime moves 40 world units either way).
const halfWalk = sheet(specs[1], manifest);
halfWalk.meta.scale = 1;
const halved = buildLibrary(assets, new Map([...withManifest, ['characters/mage/walk.png', halfWalk]])).characters[0];
const strider = newActor(8, halved.idle!, 100, 200, halved);
for (let t = 0; t < 1 - 1e-9; t += 0.01) stepPlayer(strider, { dx: 1, dy: 0, run: false }, 0.01, { width: 5000, height: 5000 }, emit);
assert.ok(Math.abs(strider.x - 100 - 40) < 1e-6, `40 px at its own scale (${strider.x})`);

// The view draws a frame's rectangle as it is, trimmed or not, at the feet less the pivot: without `meta.pivot` the feet
// are at the middle of that rectangle's bottom, as the playground always drew a packed sprite. The runtime's own
// `shownFrame` measures the untrimmed cell instead, for hosts that draw the trimmed part at its offset in it.
const packedAtlas = {
  meta: { mode: 'strip', frameCount: 1, frameWidth: 100, frameHeight: 100, scale: 2, data: { role: 'prop' } },
  frames: { frame_0: { x: 3, y: 5, width: 40, height: 60, ox: 30, oy: 20, cellW: 100, cellH: 100 } },
} as Atlas;
const packedSprite = newActor(9, buildLibrary([asset('props', 'packed')], new Map([['props/packed.png', packedAtlas]])).sprites[0].clip, 100, 200);
assert.deepEqual(currentFrame(packedSprite).pivot, { x: 20, y: 60 }, 'the middle of the drawn rectangle\'s bottom');
assert.deepEqual(currentFrame(packedSprite).rect, { x: 3, y: 5, width: 40, height: 60, ox: 30, oy: 20, cellW: 100, cellH: 100 });
assert.deepEqual(shownFrame(packedSprite).pivot, { x: 50, y: 100 }, 'the runtime\'s: the untrimmed cell\'s');
assert.deepEqual(currentFrame(a).pivot, a.clip.atlas.meta.pivot, 'a sheet\'s own pivot is the pivot either way');

console.log('✅ playground palette + view checks passed');
