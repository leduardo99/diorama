import assert from 'node:assert/strict';
import {
  BODY_RADIUS, FREE_FLOOR, advance, canStart, createActor, face, frameSocket, play, projectionOf, reset, rowFor, shown, shownFrame, socketAt, stance, steer, takeEvents, toFloor, toScreen,
  type Actor, type CharacterManifest, type ClipEvent, type Floor,
} from '@diorama/runtime';
import { DIRS, characterOf, near, type ClipSpec } from './helpers';

console.log('🧪 Checking the clip player (contract §5: priority, cancel, hold, events, root motion, steering, stance, sockets) in floor units...\n');

const specs: ClipSpec[] = [
  { key: 'idle', action: 'idle', clipKind: 'idle', frames: 4 },
  { key: 'walk', action: 'walk', clipKind: 'locomotion', frames: 8, groundSpeed: 40, events: [{ frame: 0, name: 'step:legL' }, { frame: 4, name: 'step:legR' }] },
  { key: 'run', action: 'run', clipKind: 'locomotion', frames: 8, groundSpeed: 80 },
  { key: 'slash', action: 'attack', clipKind: 'action', frames: 10, events: [{ frame: 3, name: 'hit' }, { frame: 5, name: 'cancel' }], travel: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
  { key: 'howl', action: 'skill', clipKind: 'action', frames: 10, events: [{ frame: 2, name: 'cast' }, { frame: 6, name: 'release' }, { frame: 6, name: 'spawn:mouth' }], sockets: { names: ['head', 'center', 'mouth'], frames: { S_6: [[0, 0, 1], [0, 0, 1], [10, 20, 1]] } } },
  { key: 'dodge', action: 'dodge', clipKind: 'action', frames: 6 },
  { key: 'guard', action: 'action', clipKind: 'action', frames: 6, loop: true, events: [{ frame: 2, name: 'brace' }] },
  { key: 'hit', action: 'hit', clipKind: 'action', frames: 4 },
  { key: 'death', action: 'death', clipKind: 'action', frames: 6, hold: true },
];
const manifest: CharacterManifest = {
  name: 'mage', skeleton: 'humanoid', scale: 2, camera: { tilt: 30, heightBoost: 1.2 }, directions: DIRS, sockets: ['head', 'center', 'mouth'], clips: [],
  controls: { idle: 'idle', move: ['walk', 'run'], actions: { skill: ['howl'], hit: ['hit'], attack: ['slash'], death: ['death'], dodge: ['dodge'], action: ['guard'] } },
};
const { character: mage } = characterOf('characters/mage', specs, manifest);
const clip = (key: string) => mage.clips.find((c) => c.key === key)!;
const [slash, howl, dodge, guard] = ['slash', 'howl', 'dodge', 'guard'].map(clip);

const events: string[] = [];
const collect = (out: ClipEvent[]) => out.forEach((e) => events.push(`${e.clip.key}:${e.frame}:${e.name}`));
const tick = (actor: Actor, seconds: number, floor?: Floor) => {
  for (let t = 0; t < seconds; t += 0.01) collect(advance(actor, 0.01, floor));
};
const spawn = () => createActor(mage, { x: 50, y: 100 }, { id: 1 });

// 0. An actor stands on a floor point, in its idle; its id is the host's.
{
  const a = spawn();
  const b = createActor(mage, { x: 0, y: 0 }, { id: 42, heading: 0 });
  assert.equal(a.clip.key, 'idle');
  assert.deepEqual(a.pos, { x: 50, y: 100 });
  assert.equal(b.id, 42);
  assert.equal(b.row, 6, 'a heading of 0 faces east');
  assert.equal(createActor(mage, { x: 0, y: 0 }, { id: 42 }).id, 42, 'the runtime keeps no count: the same id again is the host\'s choice');
  assert.equal(a.radius, BODY_RADIUS);
  const sprite = createActor(slash, { x: 3, y: 4 }, { id: 2 });
  assert.equal(sprite.character, null, 'a single clip is a sprite');
  assert.equal(sprite.clip, slash);
  face(a, -Math.PI / 2);
  assert.equal(a.row, 4, 'face turns it to the row nearest a heading');
}

// Facing: the row nearest to the heading (world yaws, which are screen angles: x right, y down; S looks at the camera).
const atlasS = clip('idle').atlas;
assert.equal(rowFor(atlasS, Math.PI / 2), 0, 'down is S');
assert.equal(rowFor(atlasS, Math.PI), 2, 'left is W');
assert.equal(rowFor(atlasS, 0), 6, 'right is E');
assert.equal(rowFor(atlasS, -Math.PI / 2), 4, 'up is N');
assert.equal(rowFor(atlasS.meta.directionFacings!, 0), 6, 'the facings themselves do too');

// 3. priority + 4. interruption: an action is replaced from its cancel event on, hit and death interrupt anything.
let a = spawn();
assert.ok(play(a, slash));
assert.ok(!canStart(a, howl), 'an action cannot be replaced before its cancel event');
assert.equal(play(a, 'howl'), false, 'and play refuses it');
tick(a, 0.55); // frame 5 at 10 fps
assert.ok(canStart(a, howl), 'from the cancel event on it can');
assert.ok(canStart(a, mage.hit!), 'hit interrupts');
assert.ok(play(a, 'hit'), 'a clip can be played by its key');
assert.ok(!canStart(a, slash), 'an attack never interrupts a hit');
assert.ok(canStart(a, mage.death!), 'death interrupts a hit');
assert.ok(play(a, mage.death));
assert.ok(!canStart(a, mage.hit!), 'nothing follows death');
assert.equal(play(a, null), false);
assert.equal(play(a, 'nope'), false, 'a key the character does not have');

// 5. a hold clip freezes on its last frame until reset.
tick(a, 1);
assert.ok(a.held && a.act === null, 'death ends held');
assert.equal(shown(a).time, 6 / 10, 'it shows its last frame');
assert.equal(shownFrame(a).index, 5);
assert.ok(!canStart(a, slash));
reset(a);
assert.ok(a.held === null && canStart(a, slash), 'reset brings it back');
// Reset forgets the events `play` kept: the next step hands out nothing of an action that no longer is.
a = spawn();
play(a, slash);
reset(a);
assert.deepEqual(advance(a, 0.01).filter((e) => e.clip === slash), [], 'no `start` of a slash that was reset');
assert.equal(a.act, null);

// 5. a normal action returns to idle.
a = spawn();
play(a, dodge); // no cancel
tick(a, 1);
assert.equal(a.act, null);
assert.equal(a.clip.key, 'idle');

// 6. events, in frame order, once each; `start` and `end` are the beginning and the end of the action.
events.length = 0;
a = spawn();
play(a, slash);
assert.deepEqual(events, [], 'play keeps its events for the next step');
assert.deepEqual(a.pending.map((e) => e.name), ['start']);
tick(a, 1.1);
assert.deepEqual(events, ['slash:0:start', 'slash:3:hit', 'slash:5:cancel', 'slash:9:end']);
assert.equal(a.pending.length, 0);
// Events carry the action they are part of and where the actor stood when they fired.
a = spawn();
play(a, howl);
const started = takeEvents(a);
assert.equal(started[0].act, a.act, '`start` is an event of the action');
assert.deepEqual(takeEvents(a), [], 'handed out once');
const fired: ClipEvent[] = [];
for (let t = 0; t < 1.1; t += 0.01) fired.push(...advance(a, 0.01));
const release = fired.find((e) => e.name === 'release')!;
assert.deepEqual(release.siblings, ['release', 'spawn:mouth'], '`release` comes with the `spawn:<socket>` of its frame');
assert.deepEqual(release.pos, { x: 50, y: 100 });
assert.ok(release.act && release.act.clip === howl);
const end = fired.find((e) => e.name === 'end')!;
assert.equal(end.frame, 9);
assert.ok(end.act, '`end` keeps its action although the actor has none any more');
assert.equal(a.act, null);
assert.equal(a.lastEvent?.name, 'spawn:mouth', 'the last event fired (`end` is not one of the sheet)');

// The looping base clip fires its own events (`step:<leg>`) in order, lap after lap.
const steps: string[] = [];
const walker = createActor(mage, { x: 0, y: 0 }, { id: 3, clip: clip('walk') });
for (let t = 0; t < 1.55; t += 0.01) steps.push(...advance(walker, 0.01).map((e) => `${e.name}@${e.frame}${e.act ? '!' : ''}`));
assert.deepEqual(steps, ['step:legL@0', 'step:legR@4', 'step:legL@0', 'step:legR@4'], 'two laps of an 8-frame clip at 10 fps, no action');
assert.equal(walker.lastEvent?.name, 'step:legR');
// After a long pause it does not replay more than one lap.
const paused = createActor(mage, { x: 0, y: 0 }, { id: 4, clip: clip('walk') });
assert.equal(advance(paused, 0.01).length, 1);
assert.deepEqual(advance(paused, 10).map((e) => e.name), ['step:legL', 'step:legR'], 'one lap at most');

// 7. root motion: the actor covers the clip's travel (world units) along the facing it started with (S = down).
a = spawn();
play(a, slash);
tick(a, 1.2);
assert.ok(near(a.pos.x, 50) && near(a.pos.y, 100 + 20), `travel 20 world units south (${a.pos.x}, ${a.pos.y})`);
// Through a floor: the floor gets the move, the body's radius and the clip that moves it.
const moves: Array<[number, number, string]> = [];
const wall: Floor = { move: (from, delta, radius, by) => (moves.push([delta.y, radius, by.key]), { x: from.x, y: Math.min(from.y + delta.y, 110) }) };
a = spawn();
play(a, slash);
tick(a, 1.2, wall);
assert.equal(a.pos.y, 110, 'the floor stops it');
assert.ok(moves.every(([, radius, by]) => radius === BODY_RADIUS && by === 'slash'));

// 2. moving: at groundSpeed along the input, Shift takes the fastest gait.
const step = (actor: Actor, input: { dx: number; dy: number; run: boolean }, seconds: number, floor?: Floor) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) collect(steer(actor, input, 0.01, floor));
};
a = spawn();
step(a, { dx: 1, dy: 0, run: false }, 1);
assert.equal(a.clip.key, 'walk');
assert.ok(near(a.pos.x - 50, 40, 1e-6), `walk covers 40 world units in a second (${a.pos.x})`);
assert.equal(a.row, 6, 'facing east');
a = spawn();
step(a, { dx: 0, dy: -1, run: true }, 1);
assert.equal(a.clip.key, 'run');
assert.ok(near(100 - a.pos.y, 80, 1e-6), 'run covers 80 world units: the floor does not shrink with the camera');
// The facing follows the input's angle and the speed is the same in every direction on the floor.
a = spawn();
step(a, { dx: 1, dy: 1, run: false }, 1);
assert.equal(a.row, 7, 'facing south-east');
assert.ok(near(a.pos.x - 50, 40 / Math.SQRT2, 1e-6) && near(a.pos.y - 100, 40 / Math.SQRT2, 1e-6));
// On the screen (contract §5.2): (dx, dy × sin(tilt)) × groundSpeed × scale px/s.
const view = projectionOf(null, { tilt: mage.tilt, scale: mage.scale });
const moved = toScreen(view, a.pos);
const from = toScreen(view, { x: 50, y: 100 });
assert.ok(near(moved.x - from.x, (40 / Math.SQRT2) * 2, 1e-6) && near(moved.y - from.y, (40 / Math.SQRT2) * 0.5 * 2, 1e-6), 'the depth part is squashed by sin(30°) on the screen');
const back = toFloor(view, moved);
assert.ok(near(back.x, a.pos.x) && near(back.y, a.pos.y), 'and comes back to the floor');
// Standing still goes back to idle; a character without locomotion never walks.
step(a, { dx: 0, dy: 0, run: false }, 0.1);
assert.equal(a.clip.key, 'idle');
{
  const { character: still } = characterOf('characters/statue', specs.filter((spec) => spec.clipKind !== 'locomotion'), { ...manifest, name: 'statue', controls: { ...manifest.controls, move: [] } });
  assert.deepEqual(still.locomotion, []);
  const statue = createActor(still, { x: 50, y: 100 }, { id: 5 });
  steer(statue, { dx: 1, dy: 1, run: true }, 0.5);
  assert.deepEqual([statue.pos, statue.clip.key, statue.row], [{ x: 50, y: 100 }, 'idle', 0], 'without locomotion the input moves nothing and turns nothing');
}
// Moving cancels an action only from its cancel event on.
a = spawn();
play(a, slash);
step(a, { dx: 1, dy: 0, run: false }, 0.01);
assert.ok(a.act, 'still attacking before cancel');
assert.ok(near(a.pos.x, 50), 'and not walking');
tick(a, 0.6);
play(a, slash);
tick(a, 0.55);
step(a, { dx: 1, dy: 0, run: false }, 0.01);
assert.equal(a.act, null, 'walking cancels the attack after its cancel event');
assert.equal(a.clip.key, 'walk');
// A held actor does not steer.
a = spawn();
play(a, mage.death);
tick(a, 1);
const at = { ...a.pos };
step(a, { dx: 1, dy: 0, run: true }, 0.5);
assert.deepEqual(a.pos, at);

// Stance (C5): a looping clip as the base instead of idle; actions, hit and death play over it, and it comes back after them.
a = spawn();
assert.equal(stance(a, 'slash'), false, 'a clip that does not loop is no stance');
assert.equal(stance(a, 'nope'), false);
assert.ok(stance(a, guard));
assert.equal(a.clip, guard, 'it shows at once when nothing plays');
const braces: string[] = [];
for (let t = 0; t < 1.25; t += 0.01) braces.push(...steer(a, { dx: 0, dy: 0, run: false }, 0.01).map((e) => `${e.name}@${e.frame}`));
assert.deepEqual(braces, ['brace@2', 'brace@2'], 'it loops, firing its events every lap');
assert.equal(shownFrame(a).clip, guard);
assert.ok(play(a, 'hit'), 'a hit plays over the stance');
tick(a, 0.5);
assert.equal(a.act, null);
assert.equal(a.clip, guard, 'and the actor returns to the stance');
assert.ok(play(a, slash), 'an action starts from the stance');
tick(a, 1.1);
assert.equal(a.clip, guard, 'and ends in it, even without a step that steers');
step(a, { dx: 1, dy: 0, run: false }, 0.2);
assert.equal(a.clip.key, 'walk', 'walking shows the gait');
stance(a, null);
stance(a, guard);
assert.equal(a.clip.key, 'walk', 'a stance set while walking waits for the actor to stop');
assert.equal(shownFrame(a).clip.key, 'walk');
step(a, { dx: 0, dy: 0, run: false }, 0.05);
assert.equal(a.clip, guard, 'stopping shows the stance again');
assert.ok(stance(a, null));
assert.equal(a.clip.key, 'idle', 'no stance: back to idle');
stance(a, guard);
play(a, mage.death);
tick(a, 1);
assert.ok(a.held, 'death still holds');
reset(a);
assert.equal(a.stance, null, 'reset forgets the stance');
assert.equal(a.clip.key, 'idle');
// A stance set during an action waits for it to end.
a = spawn();
play(a, dodge);
stance(a, guard);
assert.equal(a.clip.key, 'idle');
tick(a, 1);
assert.equal(a.clip, guard);

// 8. sockets: the cell origin plus [x, y] × scale, as a floor point (the socket's height dropped) and a lift.
a = spawn();
const mouth = socketAt(a, 'mouth', { clip: howl, row: 0, frame: 6 })!;
// (10 × 2 − 50) / 2 = −15 across; (20 × 2 − 90) / 2 = −25: 25 logical px above the feet.
assert.ok(near(mouth.floor.x, 35) && near(mouth.floor.y, 100), `under the mouth (${mouth.floor.x}, ${mouth.floor.y})`);
assert.equal(mouth.lift, 25);
assert.equal(mouth.depth, 1);
const shownMouth = toScreen(view, mouth.floor, mouth.lift);
const feet = toScreen(view, a.pos);
assert.ok(near(shownMouth.x, feet.x - 50 + 20) && near(shownMouth.y, feet.y - 90 + 40), 'on the screen: the cell origin plus [x, y] × scale');
assert.equal(socketAt(a, 'tail', { clip: howl, row: 0, frame: 6 }), null, 'a socket the sheet does not name');
assert.equal(socketAt(a, 'mouth', { clip: howl, row: 1, frame: 6 }), null, 'a frame without sockets');
assert.equal(socketAt(a, 'mouth'), null, 'the idle shown now has none');
// The same socket in the sheet's own px, from the cell's top-left corner: for a host drawing the frame at its own size.
assert.deepEqual(frameSocket(howl, 0, 6, 'mouth'), { x: 20, y: 40, depth: 1 });
assert.equal(frameSocket(howl, 1, 6, 'mouth'), null);

// The free floor lets every move through.
assert.deepEqual(FREE_FLOOR.move({ x: 1, y: 2 }, { x: 3, y: -4 }, 9, slash), { x: 4, y: -2 });

console.log('✅ clip player checks passed');
