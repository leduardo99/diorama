import assert from 'node:assert/strict';
import {
  advance, createActor, cues, cuesOn, effectSheetOf, frameOfFx, hasCues, liftAt, play, rowOfHeading, stepFx, takeEvents,
  type Actor, type CharacterManifest, type ClipEvent, type EffectCue, type EffectSheet, type Fx, type FxEvent, type FxWorld,
} from '@diorama/runtime';
import { DIRS, characterOf, effectAtlas, near, type ClipSpec } from './helpers';

console.log('🧪 Checking effects (contract §5 rule 9: cues on events, stay / follow / fly, layers, what stops a projectile, effect events, aim)...\n');

const sheets = new Map<string, EffectSheet>();
const add = (id: string, effect: Record<string, unknown>, rows = 1) => {
  const sheet = effectSheetOf({ path: `vfx/${id}` }, effectAtlas(id, effect, rows))!;
  sheets.set(sheet.id, sheet);
  return sheet;
};
const bolt = add('soul-bolt', { kind: 'projectile', frames: 4, loop: true, height: 12, size: 10, directions: 8, travel: { speed: 100, range: 120 }, follows: 'impact' }, 8);
const impact = add('impact', { kind: 'impact', frames: 5, fps: 10, events: [{ frame: 1, name: 'hit' }] });
const circle = add('cast-circle', { kind: 'cast', frames: 6, loop: false, size: 30 });
add('aura', { kind: 'aura', frames: 4, loop: true, size: 16, events: [{ frame: 2, name: 'pulse' }] });
add('trail', { kind: 'trail', frames: 3, loop: true, height: 6, size: 8 });
const world: FxWorld = { effects: sheets };

// 1. A sheet says what the effect is; what it leaves out gets the kind's defaults.
assert.deepEqual([bolt.kind, bolt.loop, bolt.layer, bolt.rows, bolt.travel], ['projectile', true, 'air', 8, { speed: 100, range: 120 }]);
assert.equal(circle.layer, 'ground', 'a cast circle lies on the ground');
assert.equal(impact.rows, 1);
assert.deepEqual(impact.events, [{ frame: 1, name: 'hit' }]);
const bare = effectSheetOf({ path: 'vfx/spark' }, { meta: { mode: 'strip', frameCount: 3, frameWidth: 40, frameHeight: 40, data: { role: 'vfx', effect: { id: 'spark', kind: 'area', frames: 3 } as never } }, frames: {} })!;
assert.deepEqual([bare.layer, bare.fps, bare.loop, bare.height, bare.pivot], ['ground', 12, false, 0, { x: 20, y: 20 }], 'an area is on the ground; the rest by default; the pivot is the middle of a frame without one');
assert.equal(effectSheetOf({ path: 'vfx/nameless' }, { meta: { data: { role: 'vfx' } }, frames: {} })!.id, 'nameless', 'without an id, the file name');
assert.equal(effectSheetOf({ path: 'props/chest' }, { meta: { data: { role: 'prop' } }, frames: {} }), null, 'only effect sheets are effects');
assert.equal(bolt.rects(0).length, 4, 'the frames of a row');
assert.equal(bolt.rects(3).length, 4);
// The row that faces a heading: eight rows by their facings, one row for a round effect.
assert.equal(rowOfHeading(bolt, Math.PI / 2), 0);
assert.equal(rowOfHeading(bolt, 0), 6, 'right is E');
assert.equal(rowOfHeading(bolt, -Math.PI / 2), 4, 'up is N');
assert.equal(rowOfHeading(impact, 1.2), 0);
// The frame it shows: a loop wraps, a one-shot holds its last.
assert.equal(frameOfFx({ sheet: bolt, age: 0.5 }), Math.floor(0.5 * 12) % 4);
assert.equal(frameOfFx({ sheet: impact, age: 100 }), 4);
assert.equal(liftAt({ y: 300 }, { y: 290 }), 10);
assert.equal(liftAt({ y: 300 }, { y: 310 }), 0, 'never below the floor');

// 2. A character cues effects on its clips' events (manifest `effects`).
const sockets = { S_6: [[0, 0, 1], [10, 20, 1], [30, 40, 1], [5, 5, 1]], S_3: [[0, 0, 1], [10, 20, 1], [30, 40, 1], [5, 5, 1]], S_0: [[0, 0, 1], [10, 20, 1], [30, 40, 1], [5, 5, 1]], E_6: [[0, 0, 1], [11, 21, 1], [31, 41, 1], [5, 5, 1]] } as Record<string, [number, number, number][]>;
const withSockets = { names: ['head', 'center', 'tip', 'hand'], frames: sockets };
const specs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 10 },
  { key: 'cast', action: 'skill', clipKind: 'action', frames: 10, events: [{ frame: 6, name: 'release' }, { frame: 6, name: 'spawn:tip' }], sockets: withSockets },
  { key: 'slash', action: 'attack', clipKind: 'action', frames: 10, events: [{ frame: 3, name: 'hit' }], sockets: withSockets },
  { key: 'charge', action: 'interact', clipKind: 'action', frames: 10, events: [{ frame: 3, name: 'hit' }], sockets: withSockets },
  { key: 'guard', action: 'interact', clipKind: 'action', frames: 10, sockets: withSockets },
];
const cueList: Record<string, EffectCue[]> = {
  cast: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }, { on: 'start', effect: 'cast-circle', at: 'feet' }, { on: 'end', effect: 'impact', at: 'center' }],
  slash: [{ on: 'hit', effect: 'impact', at: 'tip' }],
  charge: [{ on: 'start', effect: 'aura', motion: 'follow', at: 'hand' }, { on: 'hit', effect: 'ghost' }],
  guard: [{ on: 'start', effect: 'trail', motion: 'stay' }],
};
const manifest: CharacterManifest = {
  name: 'mage', scale: 2, camera: { tilt: 30, heightBoost: 1.2 }, directions: DIRS, sockets: ['head', 'center', 'tip', 'hand'], clips: [], effects: cueList,
  controls: { idle: 'idle', move: [], actions: { skill: ['cast'], attack: ['slash'], interact: ['charge', 'guard'] } },
};
const { character: mage } = characterOf('characters/mage', specs, manifest);
assert.deepEqual(Object.keys(mage.effects).sort(), ['cast', 'charge', 'guard', 'slash'], 'the cues come from the manifest, by clip key');
assert.equal(hasCues(mage), true);
assert.equal(hasCues({ ...mage, effects: {} }), false, 'a character without cues keeps the generic rings');
assert.equal(hasCues(null), false);
assert.deepEqual(cuesOn(mage, 'cast', 'release').map((c) => c.effect), ['soul-bolt']);
assert.deepEqual(cuesOn(mage, 'cast', 'start').map((c) => c.effect), ['cast-circle']);
assert.deepEqual(cuesOn(mage, 'slash', 'release'), [], 'a cue plays on its own clip and event only');
assert.deepEqual(cuesOn(null, 'cast', 'release'), []);

// 3. Playing the cues of an event: the actor starts a clip and its events reach `cues`.
let nextId = 0;
const actor = (): Actor => createActor(mage, { x: 100, y: 200 }, { id: ++nextId });
const clip = (key: string) => mage.clips.find((c) => c.key === key)!;
const playing = (who: Actor, out: Fx[]) => (events: ClipEvent[]) => {
  for (const event of events) out.push(...cues(event, sheets));
  return events;
};
const run = (who: Actor, seconds: number, out: Fx[], dt = 0.01) => {
  for (let t = 0; t < seconds; t += dt) playing(who, out)(advance(who, dt));
};

// `start` cues a ground circle at the feet; `release` a projectile that flies, leaving from the `spawn:` socket of its frame.
const caster = actor();
const live: Fx[] = [];
assert.ok(play(caster, clip('cast')));
playing(caster, live)(takeEvents(caster));
assert.deepEqual(live.map((f) => [f.sheet.id, f.motion, f.pos.x, f.pos.y, f.lift]), [['cast-circle', 'stay', 100, 200, 0]], 'at feet: the pivot on the floor');
run(caster, 1.1, live);
const flying = live.find((f) => f.sheet.id === 'soul-bolt')!;
assert.ok(flying, 'release cues the projectile');
assert.equal(flying.motion, 'fly');
// The tip socket at frame 6 facing S: [30, 40] logical px × scale 2 from the cell's top-left, relative to the pivot (50, 90).
assert.ok(near(flying.pos.x, 100 + (60 - 50) / 2) && near(flying.pos.y, 200), `it starts over the socket named by \`spawn:tip\` (${flying.pos.x}, ${flying.pos.y})`);
assert.equal(flying.lift, (90 - 80) / 2, 'drawn above the floor by the height of the socket it left from, not by the effect\'s own height');
assert.notEqual(flying.lift, bolt.height);
assert.equal(flying.row, 0, 'facing S, it shows the S row');
assert.ok(near(flying.fly!.vx, 0) && near(flying.fly!.vy, bolt.travel!.speed), 'it flies at the sheet\'s speed on the floor (the screen shrinks its depth, not the runtime)');
assert.ok(live.some((f) => f.sheet.id === 'impact' && f.motion === 'stay'), '`end` of the action');
// The same cue facing east flies east: the action's facing is the one it started with.
const east = createActor(mage, { x: 100, y: 200 }, { id: 100, row: 6 });
const eastFx: Fx[] = [];
play(east, clip('cast'));
playing(east, eastFx)(takeEvents(east));
run(east, 0.7, eastFx);
const eastBolt = eastFx.find((f) => f.sheet.id === 'soul-bolt')!;
assert.equal(eastBolt.row, 6);
assert.ok(near(eastBolt.fly!.vx, bolt.travel!.speed) && near(eastBolt.fly!.vy, 0));
assert.ok(eastBolt.fly!.vy === 0 && flying.fly!.vx === 0, 'exactly along the axis it faces (sin 2π is not 0 as a float): it stays on its row\'s line');
// Aimed (C5): a game points a fly cue at a floor point; it heads there and shows the row nearest that heading.
const aimer = actor();
play(aimer, clip('cast'));
takeEvents(aimer);
let aimedRelease: ClipEvent | undefined;
for (let t = 0; t < 0.7 && !aimedRelease; t += 0.01) aimedRelease = advance(aimer, 0.01).find((e) => e.name === 'release');
const aimed = cues(aimedRelease!, sheets, { aim: { x: 105 - 50, y: 200 - 50 } })[0];
assert.equal(aimed.row, 3, 'up and to the left is NW');
assert.ok(near(aimed.fly!.vx, -bolt.travel!.speed / Math.SQRT2) && near(aimed.fly!.vy, -bolt.travel!.speed / Math.SQRT2), 'at the full speed, towards the point');

// `stay` at a socket, once, at the frame of the event: the weapon's tip.
const striker = actor();
const struck: Fx[] = [];
play(striker, clip('slash'));
playing(striker, struck)(takeEvents(striker));
run(striker, 0.5, struck);
assert.deepEqual(struck.map((f) => [f.sheet.id, f.motion, f.pos.x, f.pos.y, f.lift]), [['impact', 'stay', 105, 200, 5]], 'hit: at the tip, where the blow lands');
// A cue whose effect is not in the project plays nothing.
const charger = actor();
play(charger, clip('charge'));
const chargeEvents = [...takeEvents(charger)];
for (let t = 0; t < 0.5; t += 0.01) chargeEvents.push(...advance(charger, 0.01));
const hitCue = chargeEvents.find((e) => e.name === 'hit')!;
assert.deepEqual(cuesOn(mage, 'charge', 'hit').map((c) => c.effect), ['ghost']);
assert.deepEqual(cues(hitCue, sheets), [], '"ghost" has no sheet');

// 4. A one-shot ends after its last frame; a loop lasts as long as the action it was cued in.
let shots: Fx[] = [{ ...live.find((f) => f.sheet.id === 'cast-circle')!, age: 0 }];
for (let t = 0; t < 0.45; t += 0.05) shots = stepFx(shots, 0.05, world).fx;
assert.equal(shots.length, 1, 'six frames at 12 fps last half a second');
for (let t = 0; t < 0.2; t += 0.05) shots = stepFx(shots, 0.05, world).fx;
assert.equal(shots.length, 0);
// A looping aura follows the socket of the action, fires its events every lap, and ends with the action.
const channeler = actor();
play(channeler, clip('charge'));
const auras = takeEvents(channeler).flatMap((e) => cues(e, sheets));
const aura = auras.find((f) => f.sheet.id === 'aura')!;
assert.equal(aura.motion, 'follow');
assert.ok(aura.until, 'a loop knows the action it lives in');
channeler.pos = { x: channeler.pos.x + 20, y: channeler.pos.y };
let held = [aura];
const pulses: FxEvent[] = [];
const stepped = stepFx(held, 0.05, world);
held = stepped.fx;
assert.equal(held.length, 1, 'still in the action');
// The hand [5, 5]: (10 − 50) / 2 = −20 across, (10 − 90) / 2 = −40, so 40 above the feet.
assert.ok(near(held[0].pos.x, 120 - 20) && near(held[0].pos.y, 200) && held[0].lift === 40, 'it follows the hand socket as the actor moves');
for (let t = 0; t < 1.2; t += 0.05) {
  advance(channeler, 0.05);
  const step = stepFx(held, 0.05, world);
  held = step.fx;
  pulses.push(...step.events);
}
assert.equal(channeler.act, null, 'the action is over');
assert.equal(held.length, 0, 'and so is the aura');
assert.deepEqual(pulses.map((e) => e.name), ['pulse', 'pulse', 'pulse', 'end'], 'a loop fires its events every lap (4 frames at 12 fps: three laps in the one-second action), then ends');
// `stay` loop cued in an action ends with it too.
const guardian = actor();
play(guardian, clip('guard'));
let kept = takeEvents(guardian).flatMap((e) => cues(e, sheets)).filter((f) => f.sheet.id === 'trail');
assert.equal(kept.length, 1);
kept = stepFx(kept, 0.1, world).fx;
assert.equal(kept.length, 1);
for (let t = 0; t < 1.2; t += 0.05) {
  advance(guardian, 0.05);
  kept = stepFx(kept, 0.05, world).fx;
}
assert.equal(kept.length, 0);
// A loop cued on a base clip's event (`step:<leg>`, no action) lasts while the actor stays in that clip: the clip of the
// event, even when the host cues it after the actor changed its base clip (a gait switch).
const pacer = createActor({ ...mage, effects: { ...mage.effects, idle: [{ on: 'step:legL', effect: 'aura' }] } }, { x: 0, y: 0 }, { id: 101 });
const stepEvent: ClipEvent = { actor: pacer, clip: pacer.clip, row: 0, frame: 0, name: 'step:legL', siblings: ['step:legL'], act: null, pos: { x: 0, y: 0 } };
pacer.clip = clip('guard');
const paced = cues(stepEvent, sheets);
assert.equal(paced[0].until?.clip.key, 'idle', 'the loop belongs to the clip that fired the event');
assert.equal(stepFx(paced, 0.01, world).fx.length, 0, 'and the actor has left it');

// 5. A projectile flies until its range runs out, then plays the effect it follows where it ended.
const fresh = (): Fx => ({ ...flying, pos: { x: 100, y: 100 }, age: 0, fly: { ...flying.fly!, flown: 0 }, fired: -1, done: false });
let flight = [fresh()];
let steps = 0;
const flightEvents: FxEvent[] = [];
while (flight.length === 1 && flight[0].sheet.id === 'soul-bolt' && steps < 400) {
  const step = stepFx(flight, 0.02, world);
  flight = step.fx;
  flightEvents.push(...step.events);
  steps++;
}
assert.equal(flight.length, 1);
assert.equal(flight[0].sheet.id, 'impact', 'the impact plays where it ended');
assert.ok(Math.abs(steps * 0.02 * bolt.travel!.speed - bolt.travel!.range!) < bolt.travel!.speed * 0.02 + 1e-9, `it flew its range (${steps} steps)`);
assert.ok(near(flight[0].pos.y, 100 + bolt.travel!.speed * steps * 0.02, 1e-6), 'at the end of its path');
assert.equal(flight[0].lift, flying.lift, 'at the projectile\'s height');
assert.equal(flight[0].motion, 'stay');
assert.equal(flight[0].from?.sheet.id, 'soul-bolt', 'it knows the projectile it follows');
assert.deepEqual(flightEvents.map((e) => e.name), ['end'], 'the impact has a `hit`: the projectile only ends');
// Effect events (C5): the impact's `hit` fires on its frame, once; then it ends.
const impactEvents: FxEvent[] = [];
for (let i = 0; i < 20 && flight.length; i++) {
  const step = stepFx(flight, 0.05, world);
  flight = step.fx;
  impactEvents.push(...step.events);
}
assert.deepEqual(impactEvents.map((e) => [e.name, e.frame]), [['hit', 1], ['end', 4]]);
assert.ok(near(impactEvents[0].pos.y, 100 + bolt.travel!.speed * steps * 0.02, 1e-6), 'where the projectile ended');
// A projectile with nothing to follow just ends, and its damage lands where it ended.
const lone = add('lone-bolt', { kind: 'projectile', frames: 2, loop: true, travel: { speed: 200, range: 40 } }, 8);
let after: Fx[] = [{ ...fresh(), sheet: lone, fly: { vx: 0, vy: 200, flown: 0, speed: 200, range: 40 } }];
const loneEvents: FxEvent[] = [];
for (let i = 0; i < 20 && after.length; i++) {
  const step = stepFx(after, 0.05, world);
  after = step.fx;
  loneEvents.push(...step.events);
}
assert.equal(after.length, 0);
assert.deepEqual(loneEvents.map((e) => e.name), ['hit', 'end'], 'no impact to play: `hit` where it ended');
assert.ok(near(loneEvents[0].pos.y, 140, 1e-6));
// It ends where the floor stops it, and the impact plays at the last free point, as high as the projectile flew.
let blocked = [fresh()];
const walls: [unknown, unknown, Fx][] = [];
const wall: FxWorld = { ...world, blocked: (from, to, fx) => (walls.push([from, to, fx]), to.y > 150 ? { x: 100, y: 150 } : null) };
for (let i = 0; i < 100 && blocked[0]?.sheet.id === 'soul-bolt'; i++) blocked = stepFx(blocked, 0.05, wall).fx;
assert.equal(blocked[0].sheet.id, 'impact', 'a wall ends the flight and plays the impact');
assert.deepEqual(blocked[0].pos, { x: 100, y: 150 });
assert.equal(blocked[0].lift, flying.lift);
assert.equal(walls[0][2].sheet.id, 'soul-bolt', 'the world is asked about the effect that flies');
assert.deepEqual(walls[0][0], { x: 100, y: 100 }, 'from its floor point');

// 6. A following effect whose socket is not in the frame shown stays where it is drawn, measured again from the feet: drawn
//    above them, it stands on the actor's very floor point (so it sorts at the actor's depth), below them on the floor.
const follower = actor();
const hung = (): Fx => ({ ...aura, pos: { x: follower.pos.x, y: follower.pos.y }, lift: 40, follow: { actor: follower, socket: 'nope' }, until: undefined, age: 0, fired: -1, done: false });
const ky = Math.sin((mage.tilt * Math.PI) / 180);
let kept2 = stepFx([hung()], 0.01, world).fx;
assert.ok(kept2[0].pos.y === follower.pos.y && near(kept2[0].lift, 40), 'the actor still: it stays, on the actor\'s floor point');
follower.pos = { x: follower.pos.x, y: follower.pos.y + 10 };
const drawn = kept2[0].pos.y * ky - kept2[0].lift;
kept2 = stepFx(kept2, 0.01, world).fx;
assert.equal(kept2[0].pos.y, follower.pos.y, 'the actor stepped down the screen: the effect hangs over its new floor point');
assert.ok(near(kept2[0].pos.y * ky - kept2[0].lift, drawn) && near(kept2[0].lift, 40 + 10 * ky), 'drawn where it was');
follower.pos = { x: follower.pos.x, y: follower.pos.y - 200 };
kept2 = stepFx(kept2, 0.01, world).fx;
assert.ok(kept2[0].lift === 0 && near(kept2[0].pos.y * ky, drawn), 'the feet went above it: it lies on the floor where it is drawn');

console.log('✅ effect checks passed');
