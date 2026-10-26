import assert from 'node:assert/strict';
import { Camera, add3, scale3, vec3 } from '../../core/volume/index.js';
import {
  GRIP_TOLERANCE,
  HAND,
  checkGrips,
  death,
  defineCharacter,
  defineClip,
  gripSubject,
  handSize,
  held,
  humanoid,
  idle,
  locomotion,
  palmGrip,
  type Clip,
  type GearCatalog,
  type GripCheck,
  type Held,
  type Hold,
  type OutfitHold,
  type Part,
  type Pose,
  type SkeletonSpec,
} from '../../core/rig/index.js';

console.log('🧪 Starting the grip-check suite (gripGap, openHandHolding, wristLimit, reachStretch, gripDrift, handleTooShort)...\n');

const h = humanoid();
const hand = handSize(h, h.arms![1]);
const SWORD: Hold = { kind: 'one-hand-blade', handle: { length: 4.4, radius: 0.75 } };
/** A sword held forward in the right hand, the way a part draws it. */
const sword = (pose: Pose, skeleton: SkeletonSpec = h, hold: Hold = SWORD): Held => held(pose, skeleton, 'armR', { length: 26, rest: [1, 0, 0], hold });
const swordHold: OutfitHold = { side: 1, held: (pose, skeleton) => sword(pose, skeleton) };
const standing = idle(h);
const check = (holds: OutfitHold[], clip: Clip = standing, holding?: { side: -1 | 1; item?: string; hands?: 1 | 2 }[]): GripCheck => checkGrips(h, clip, { holds, ...(holding ? { holding } : {}) });
const errorsOf = (c: GripCheck, name: string) => c.errors.filter(e => e.startsWith(`${name}:`));

// ---------------------------------------------------------------------------------------------
// The correct fixture: a sword in the palm, held forward at rest. Every check passes.
// ---------------------------------------------------------------------------------------------
const clean = check([swordHold]);
{
  assert.deepEqual([clean.errors, clean.warnings, clean.notes], [[], [], []], `a sword held forward at rest is clean: ${[...clean.errors, ...clean.warnings].join(' | ')}`);
  assert.equal(clean.gripGap!.worst, 0, 'the grip is in the palm');
  assert.equal(clean.gripGap!.of, 64, 'measured per facing and frame: 8 × 8 by default');
  assert.equal(clean.openHandHolding!.worst, 0);
  assert.ok(clean.wristLimit!.worst <= 1);
  assert.equal(clean.reachStretch, null, 'nothing held in both hands: no reach to measure');
  assert.ok(clean.gripDrift!.worst <= GRIP_TOLERANCE.drift);
  assert.ok(clean.handleTooShort!.worst >= 1);
  assert.match(clean.gripGap!.frame, /^(S|SW|W|NW|N|NE|E|SE)_\d+$/, 'frames are named as in the socket table');
  assert.equal(checkGrips(h, standing, { holds: [swordHold] }, { directions: 1, frames: 3 }).gripGap!.frame.startsWith('frame_'), true, 'one facing names frames frame_<n>');
  console.log('✔ The correct fixture passes every check.');
}

// ---------------------------------------------------------------------------------------------
// gripGap: the palm against the grip.
// ---------------------------------------------------------------------------------------------
{
  // Broken: placed at the wrist (no hold), as before holds existed.
  const atWrist = check([{ side: 1, held: pose => held(pose, h, 'armR', { length: 26, rest: [1, 0, 0] }) }]);
  assert.equal(errorsOf(atWrist, 'gripGap').length, 1, 'an item at the wrist is an error');
  assert.ok(Math.abs(atWrist.gripGap!.worst - HAND.centroid) < 0.01, `about the palm centroid's distance from the wrist: ${atWrist.gripGap!.worst}`);
  assert.match(errorsOf(atWrist, 'gripGap')[0], /placed at the wrist/);
  assert.equal(errorsOf(atWrist, 'openHandHolding').length, 1, 'and its hand is told nothing');
  // Broken: a hold, but the part shifts the item off the palm.
  const shifted = check([{ side: 1, held: pose => offset(sword(pose), 0.3 * hand.length) }]);
  assert.equal(errorsOf(shifted, 'gripGap').length, 1, 'an item off the palm is an error');
  assert.ok(Math.abs(shifted.gripGap!.worst - 0.3) < 1e-6);
  // Within the tolerance it passes.
  assert.equal(errorsOf(check([{ side: 1, held: pose => offset(sword(pose), 0.5 * GRIP_TOLERANCE.gap * hand.length) }]), 'gripGap').length, 0);
  assert.equal(errorsOf(clean, 'gripGap').length, 0);
  console.log('✔ gripGap: at the wrist or off the palm fails, in the palm passes.');
}

/** An item moved `by` along its own axis, handle and all (a part that draws it away from the palm). */
function offset(item: Held, by: number): Held {
  const s = scale3(item.dir, by);
  return { ...item, grip: add3(item.grip, s), tip: add3(item.tip, s), butt: add3(item.butt, s), ...(item.handle ? { handle: { from: add3(item.handle.from, s), to: add3(item.handle.to, s) } } : {}) };
}

// ---------------------------------------------------------------------------------------------
// openHandHolding: a hand that holds something and is given no grip.
// ---------------------------------------------------------------------------------------------
{
  // Broken: a buckler on the left forearm that says nothing about where the hand closes.
  const holding = [{ side: 1 as const, item: 'sword' }, { side: -1 as const, item: 'buckler' }];
  const open = check([swordHold], standing, holding);
  assert.equal(errorsOf(open, 'openHandHolding').length, 1, 'a hand that holds without a grip is an error');
  assert.deepEqual([open.openHandHolding!.worst, open.openHandHolding!.hand], [1, 'left'], 'in every frame, on the left');
  assert.match(errorsOf(open, 'openHandHolding')[0], /"buckler"/);
  // Correct: the buckler's strap gives the hand its grip.
  const strap: OutfitHold = { side: -1, grip: (pose, skeleton) => [palmGrip(pose, skeleton, 'armL', { axis: vec3(0, 0, 1), radius: 0.8, behind: vec3(0, -1, 0) })] };
  const closed = check([swordHold, strap], standing, holding);
  assert.equal(errorsOf(closed, 'openHandHolding').length, 0, 'a strap the hand closes on passes');
  assert.equal(closed.openHandHolding!.worst, 0);
  // gripSubject: every hand with a held part, holds or not.
  const catalog: GearCatalog = {
    parts: [
      { id: 'sword', label: 'Sword', group: 'weapons', part: () => {}, slots: ['hand'], roles: [], wield: { class: 'blade', hold: SWORD, held: (pose, sk) => sword(pose, sk) } },
      { id: 'buckler', label: 'Buckler', group: 'shields', part: () => {}, slots: ['forearm'], roles: [], wield: { class: 'shield', offHand: 'hold' } },
    ],
    bases: [],
    materials: {},
  };
  const subject = gripSubject({ materials: {}, pieces: [{ part: 'sword', slot: 'hand', side: 1 }, { part: 'buckler', slot: 'forearm', side: -1 }] }, catalog);
  assert.equal(subject.holds.length, 1, 'only the sword says how it is held');
  assert.deepEqual(subject.holding, [{ side: 1, item: 'sword', hands: 1 }, { side: -1, item: 'buckler', hands: 1 }]);
  assert.equal(errorsOf(checkGrips(h, standing, subject), 'openHandHolding').length, 1, 'the outfit\'s buckler leaves its hand open');
  console.log('✔ openHandHolding: a hand holding without a grip fails, a strap it closes on passes.');
}

// ---------------------------------------------------------------------------------------------
// wristLimit: past the hard limits is an error, past comfort at rest a warning.
// ---------------------------------------------------------------------------------------------
{
  // Broken: the clip turns the blade up along the hanging forearm, back towards the elbow: no wrist bends that far.
  const back = defineClip({ name: 'backwards', seconds: 1, loop: true, kind: 'idle', drive: t => ({ ...standing.drive(t), extra: { weaponYaw: 0, weaponPitch: Math.PI / 2 } }) });
  const bent = check([swordHold], back);
  assert.equal(errorsOf(bent, 'wristLimit').length, 1, 'a wrist past its hard limits is an error');
  assert.ok(bent.wristLimit!.worst > 1);
  assert.match(errorsOf(bent, 'wristLimit')[0], /(flexion|extension|deviation) \d+° \(limit \d+°\)/, 'and says which limit, in degrees');
  // Within the hard limits but past comfort, at rest: a warning, not an error. The clip sets the default rest, low and forward.
  const atRest = { side: 1 as const, held: (pose: Pose) => held(pose, h, 'armR', { length: 26, hold: SWORD }) };
  const r = { x: 0.55, y: 0.3, z: -0.75 };
  const lazyClip = defineClip({ name: 'lazy', seconds: 1, loop: true, kind: 'idle', drive: t => ({ ...standing.drive(t), extra: { weaponYaw: Math.atan2(r.y, r.x), weaponPitch: Math.asin(r.z / Math.hypot(r.x, r.y, r.z)) } }) });
  const lazy = check([atRest], lazyClip);
  assert.equal(errorsOf(lazy, 'wristLimit').length, 0, 'the default rest, low and forward: within the hard limits');
  assert.equal(lazy.warnings.filter(w => w.startsWith('wristLimit')).length, 1, 'but past comfort for a hand at rest');
  // Left to the engine (no clip angle), the same rest is turned to where the wrist is comfortable: nothing to warn about.
  assert.equal(check([atRest]).warnings.filter(w => w.startsWith('wristLimit')).length, 0, 'the engine\'s rest is comfortable');
  // The death preset lets go as the arms drop: the frames where the hand has opened are not measured as a grip.
  const fall = check([atRest], death(h));
  assert.deepEqual([...errorsOf(fall, 'wristLimit'), ...errorsOf(fall, 'gripDrift'), ...errorsOf(fall, 'gripGap')], [], 'a falling body that lets go breaks no grip rule');
  // The same posture in an action is not a warning: only rest and carry poses are held to comfort.
  const swing = defineClip({ name: 'swing', seconds: 1, kind: 'attack', drive: standing.drive, events: [{ t: 0.5, name: 'hit' }] });
  assert.equal(checkGrips(h, swing, { holds: [{ side: 1, held: pose => held(pose, h, 'armR', { length: 26, hold: SWORD }) }] }).warnings.length, 0);
  assert.equal(errorsOf(clean, 'wristLimit').length, 0);
  console.log('✔ wristLimit: past the hard limits fails, past comfort at rest warns, a natural hold passes.');
}

// ---------------------------------------------------------------------------------------------
// reachStretch: the other hand on an item held in both hands.
// ---------------------------------------------------------------------------------------------
{
  const LONGSWORD: Hold = { kind: 'two-hand-blade', handle: { length: 12 } };
  const guardClip = defineClip({
    name: 'guard', seconds: 1, loop: true, kind: 'idle',
    drive: () => ({ arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: [10, -3, 37] } }, extra: { weaponYaw: 0, weaponPitch: 0.5 } }),
  });
  const longsword: OutfitHold = { side: 1, hands: 2, held: pose => held(pose, h, 'armR', { length: 30, hold: LONGSWORD }) };
  const twoHands = check([longsword], guardClip);
  assert.deepEqual(twoHands.errors, [], `both hands on a longsword: ${twoHands.errors.join(' | ')}`);
  assert.ok(twoHands.reachStretch!.worst <= 1, 'the other arm reaches its grip without stretching');
  assert.ok(twoHands.gripGap!.worst <= GRIP_TOLERANCE.gap, 'and its palm is on it');
  assert.equal(twoHands.gripGap!.of, 128, 'both hands are measured');
  // Broken: an item that says where both hands close (`wield.grip`, no `held`) hands the other hand a
  // point far out of its reach; the engine does not move an arm onto such a grip.
  const reach = h.arms![0].lengths[0] + h.arms![0].lengths[1];
  const pole = (distance: number): OutfitHold => ({
    side: 1, hands: 2,
    grip: (pose, sk) => {
      const near = palmGrip(pose, sk, 'armL', { axis: vec3(1, 0, 0), radius: 0.9 });
      return [palmGrip(pose, sk, 'armR', { axis: vec3(1, 0, 0), radius: 0.9 }), { ...near, at: add3(pose.joints['armL.shoulder'], scale3(pose.frame.forward, distance)) }];
    },
  });
  const stretched = check([pole(2 * reach)], guardClip);
  assert.equal(errorsOf(stretched, 'reachStretch').length, 1, 'a grip past the arm\'s full length is an error');
  assert.ok(stretched.reachStretch!.worst > 1.5);
  assert.equal(stretched.reachStretch!.hand, 'left');
  assert.equal(errorsOf(check([pole(0.5 * reach)], guardClip), 'reachStretch').length, 0, 'one within reach is not');
  // The same through `held` with a `grip` that overrides the other hand's: it closes where it is told.
  const far: OutfitHold = { ...pole(2 * reach), held: longsword.held };
  assert.equal(errorsOf(check([far], guardClip), 'reachStretch').length, 1);
  // A grip out of reach that the engine lets go of, or slides along its range, is a note.
  const long: OutfitHold = { side: 1, hands: 2, held: pose => held(pose, h, 'armR', { length: 30, hold: { kind: 'two-hand-blade', handle: { length: 44 }, grip: 1, second: 0 } }) };
  const letGo = check([long], guardClip);
  assert.equal(errorsOf(letGo, 'reachStretch').length, 0, 'the engine never stretches the arm');
  assert.ok(letGo.notes.some(n => /let go/.test(n)), `a hand that lets go is noted: ${letGo.notes.join(' | ')}`);
  assert.equal(errorsOf(letGo, 'openHandHolding').length, 0, 'and is not an open hand: it let go');
  const reaching = defineClip({
    name: 'reach', seconds: 1, loop: true, kind: 'idle',
    drive: () => ({ arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: [40, -9, 45] } }, extra: { weaponYaw: 0, weaponPitch: 0 } }),
  });
  const spear: OutfitHold = { side: 1, hands: 2, held: pose => held(pose, h, 'armR', { length: 30, hold: { kind: 'spear', handle: { length: 120 }, grip: 0.3, second: [0.3, 1] } }) };
  const slid = check([spear], reaching);
  assert.equal(errorsOf(slid, 'reachStretch').length, 0);
  assert.ok(slid.notes.some(n => /slid along its grip's range/.test(n)), `a grip that slid is noted: ${slid.notes.join(' | ')}`);
  console.log('✔ reachStretch: a grip past full length fails, the engine\'s two hands pass, slides and releases are notes.');
}

// ---------------------------------------------------------------------------------------------
// gripDrift: the handle slipping in the palm from one frame to the next.
// ---------------------------------------------------------------------------------------------
{
  // Broken: the part draws the sword a little up and down the hand on alternate frames, each within the gap's tolerance.
  const jitter = defineClip({ name: 'jitter', seconds: 1, loop: true, kind: 'idle', drive: t => ({ ...standing.drive(t), extra: { slip: Math.round(t * 8) % 2 ? 1 : -1 } }) });
  const shake = 0.8 * GRIP_TOLERANCE.gap * hand.length;
  const slipping = check([{ side: 1, held: pose => offset(sword(pose), (pose.extra.slip ?? 0) * shake) }], jitter);
  assert.equal(errorsOf(slipping, 'gripGap').length, 0, 'every frame is within the gap\'s tolerance');
  assert.equal(errorsOf(slipping, 'gripDrift').length, 1, 'but the handle slips between frames: an error');
  assert.ok(Math.abs(slipping.gripDrift!.worst - 2 * 0.8 * GRIP_TOLERANCE.gap) < 1e-6, `the slip is twice the offset: ${slipping.gripDrift!.worst}`);
  // Correct: the same constant offset in every frame does not drift.
  const steady = check([{ side: 1, held: pose => offset(sword(pose), shake) }], jitter);
  assert.equal(errorsOf(steady, 'gripDrift').length, 0, 'a steady hold does not drift');
  assert.ok(steady.gripDrift!.worst < 0.01, `a steady offset barely moves as the hand settles: ${steady.gripDrift!.worst}`);
  // A walk with the engine's preset: the sword moves with the hand, no slip.
  assert.equal(errorsOf(check([swordHold], locomotion(h, 'walk')), 'gripDrift').length, 0);
  console.log('✔ gripDrift: a handle slipping between frames fails, a steady hold passes.');
}

// ---------------------------------------------------------------------------------------------
// handleTooShort: a palm of handle per hand, and two hands a palm apart.
// ---------------------------------------------------------------------------------------------
{
  const stub: Hold = { kind: 'one-hand-blade', handle: { length: 0.6 * hand.palm, radius: 0.75 } };
  const short = check([{ side: 1, held: pose => sword(pose, h, stub) }]);
  assert.equal(errorsOf(short, 'handleTooShort').length, 1, 'a handle shorter than a palm is an error');
  assert.ok(Math.abs(short.handleTooShort!.worst - 0.6) < 1e-6);
  // Two hands on a handle long enough for one: too short.
  const guardClip = defineClip({
    name: 'guard', seconds: 1, loop: true, kind: 'idle',
    drive: () => ({ arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: [10, -3, 37] } }, extra: { weaponYaw: 0, weaponPitch: 0.5 } }),
  });
  const cramped: Hold = { kind: 'two-hand-blade', handle: { length: 1.5 * hand.palm }, grip: 0.6, second: 0.4 };
  const both = check([{ side: 1, hands: 2, held: pose => held(pose, h, 'armR', { length: 30, hold: cramped }) }], guardClip);
  assert.equal(errorsOf(both, 'handleTooShort').length, 1, 'two hands on 1.5 palms of handle is an error');
  assert.ok(both.handleTooShort!.worst < 1);
  assert.equal(errorsOf(clean, 'handleTooShort').length, 0, 'the sword\'s grip fits its hand');
  console.log('✔ handleTooShort: a handle too short for its hands fails, one that fits passes.');
}

// ---------------------------------------------------------------------------------------------
// The export: armed characters carry the checks in their atlas data; the rest export as before.
// ---------------------------------------------------------------------------------------------
{
  const noop: Part = () => {};
  const catalog: GearCatalog = {
    parts: [
      { id: 'sword', label: 'Sword', group: 'weapons', part: noop, slots: ['hand'], roles: [], wield: { class: 'blade', hold: SWORD, held: (pose, sk) => sword(pose, sk) } },
      { id: 'club', label: 'Club', group: 'weapons', part: noop, slots: ['hand'], roles: [], wield: { class: 'blade' } },
      { id: 'hand', label: 'Hand', group: 'bodies', part: noop, slots: ['hand'], roles: [] },
    ],
    bases: [],
    materials: {},
  };
  const make = (pieces: { part: string; slot: 'hand'; side: 1 | -1 }[]) => defineCharacter({
    name: 'fencer', skeleton: h, camera: new Camera(), width: 64, height: 96, pivot: { x: 32, y: 80 }, frames: 4, directions: 2,
    clips: { idle: idle(h) }, outfit: { data: { materials: {}, pieces }, catalog },
  }).sheet('idle').data as { grips?: GripCheck; motion: unknown };
  const armed = make([{ part: 'sword', slot: 'hand', side: 1 }]);
  assert.ok(armed.grips, 'a character holding an item that says how it is held carries the grip checks');
  assert.equal(armed.grips!.gripGap!.of, 8, 'on the sheet\'s own facings and frames (2 × 4)');
  assert.deepEqual(armed.grips!.errors, []);
  assert.equal(make([{ part: 'hand', slot: 'hand', side: 1 }]).grips, undefined, 'an unarmed character exports as before');
  assert.equal(make([{ part: 'club', slot: 'hand', side: 1 }]).grips, undefined, 'and so does one whose items say nothing about how they are held');
  console.log('✔ Export: armed characters carry meta.data.grips; unarmed ones and old catalogs are unchanged.');
}

console.log('\n✨ Grip-check tests passed.\n');
