import assert from 'node:assert/strict';
import { Camera, Frame3, Stage, add3, cross3, dot3, len3, norm3, scale3, sub3, vec3, type Vec3 } from '../../core/volume/index.js';
import {
  GRIP_SLACK,
  HAND,
  HOLD_DEFAULT,
  HOLD_KINDS,
  WRIST,
  curlFor,
  death,
  defineCharacter,
  defineSkeleton,
  handSize,
  held,
  heldGrip,
  holdPose,
  humanoid,
  idle,
  locomotion,
  outfit,
  outfitFromData,
  outfitHolds,
  palmFrame,
  palmGrip,
  resolveHold,
  restAxis,
  secondHand,
  solvePose,
  type Drive,
  type GearCatalog,
  type Grip,
  type Hold,
  type Local,
  type Part,
  type Pose,
} from '../../core/rig/index.js';

console.log('🧪 Starting the holding-items test suite (holds, palm frame, wrist, grips, second hand)...\n');

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≉ ${b}`);
const dist = (a: Vec3, b: Vec3) => len3(sub3(a, b));
const degrees = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot3(norm3(a), norm3(b))))) * 180) / Math.PI;
const h = humanoid();
// Facing +x: forward is +x, the right hand +y, up +z.
const frame = Frame3.facing(vec3(0, 0, 0), 0);
const standing = solvePose(h, frame, idle(h).drive(0));
const SWORD: Hold = { kind: 'one-hand-blade', handle: { length: 4.4, radius: 1.5 } };

/** A pose whose right forearm (from a fixed elbow) points along `fore`, for the hand alone. */
function armAlong(fore: Vec3, arm: 'armR' | 'armL' = 'armR'): Pose {
  const side = arm === 'armR' ? 9 : -9;
  const elbow = vec3(4, side, 42);
  return { frame, joints: {}, chains: { [arm]: [vec3(0, side, 56), elbow, add3(elbow, scale3(norm3(fore), 12))] }, extra: {} };
}

// ---------------------------------------------------------------------------------------------
// Holds: the kinds' defaults, scaled by the body, and what the item says over them.
// ---------------------------------------------------------------------------------------------
{
  const longsword = resolveHold({ kind: 'two-hand-blade' }, h);
  assert.deepEqual([longsword.grip, longsword.second], [0.9, [0, 0.35]], 'a longsword: the lead hand under the guard, the rear hand on or above the pommel');
  near(longsword.handle.length, HOLD_KINDS['two-hand-blade'].handle.length * h.height, 1e-9, 'a default handle follows the body height');
  const tall = resolveHold({ kind: 'two-hand-blade' }, humanoid(1.5));
  near(tall.handle.length, 1.5 * longsword.handle.length, 1e-9, 'and grows with a taller skeleton');
  const staff = resolveHold({ kind: 'staff', handle: { length: 80 } }, h);
  near((staff.second![0] - staff.grip) * 80, 0.25 * h.height, 1e-9, 'a staff\'s hands are a shoulder width (0.25 H) apart');
  const scythe = resolveHold({ kind: 'scythe', handle: { length: 72 } }, h);
  assert.ok(scythe.second![0] < scythe.grip, 'a scythe\'s other grip is towards the butt');
  assert.deepEqual(resolveHold({ grip: 0.3, second: [0.9, 0.4], reverse: true }, h).second, [0.4, 0.9], 'a range is sorted');
  assert.equal(resolveHold({ kind: 'gun-kata' }, h).angle, HOLD_DEFAULT.angle, 'an unknown kind takes the default hold');
  assert.equal(resolveHold({}, h).second, undefined, 'the default hold has no second grip');
  assert.throws(() => resolveHold({ grip: 1.2 }, h), /grip 1.2 must be a fraction/);
  assert.throws(() => resolveHold({ second: [0, 2] }, h), /second grip/);
  assert.throws(() => resolveHold({ handle: { length: 0 } }, h), /handle's length/);
  assert.throws(() => resolveHold({ angle: 120 }, h), /angle 120/);
  // The hand: a tenth of the height, a palm H / 24 across, or the arm's own.
  const hand = handSize(h, h.arms![1]);
  near(hand.length, HAND.length * h.height, 1e-9, 'hand length');
  near(hand.palm, h.height / 24, 1e-9, 'palm width');
  const bigHands = defineSkeleton({ ...h, arms: h.arms!.map(a => ({ ...a, hand: 12 })) });
  assert.equal(handSize(bigHands, bigHands.arms![0]).length, 12, 'ArmSpec.hand sets it');
  assert.throws(() => defineSkeleton({ ...h, arms: h.arms!.map(a => ({ ...a, hand: -1 })) }), /hand length must be a positive number/);
  console.log('✔ Holds: kinds, defaults, overrides and errors.');
}

// ---------------------------------------------------------------------------------------------
// The palm frame and the wrist.
// ---------------------------------------------------------------------------------------------
{
  for (const arm of ['armR', 'armL'] as const) {
    const p = palmFrame(armAlong(vec3(1, 0, 0), arm), h, arm, { axis: vec3(0, 0, 1) });
    const side = arm === 'armR' ? 1 : -1;
    for (const v of [p.along, p.thumb, p.normal, p.tube]) near(len3(v), 1, 1e-9, 'unit axes');
    near(dot3(p.along, p.thumb), 0, 1e-9, 'thumb square to the hand');
    near(dot3(p.normal, p.along), 0, 1e-9, 'normal square to the hand');
    near(dot3(p.normal, p.tube), 0, 1e-9, 'the finger tube lies across the palm');
    // forward × right = up: the right palm faces along × thumb, the left one the other way.
    near(dot3(cross3(p.along, p.thumb), p.normal), side, 1e-9, `${arm}: the palm's handedness`);
    near(dist(p.at, p.wrist), HAND.centroid * HAND.length * h.height, 1e-9, 'the palm centroid sits a fraction of the hand past the wrist');
    assert.ok(dot3(p.normal, scale3(frame.right, -side)) > 0.4, `${arm}: a hand holding an upright handle, forearm forward, turns its palm to the body's middle`);
    assert.ok(dot3(p.thumb, vec3(0, 0, 1)) > 0.8, `${arm}: and its thumb up, where the handle comes out`);
    near(degrees(p.tube, vec3(0, 0, 1)), 0, 1e-9, 'within the wrist\'s limits the handle runs along the finger tube');
    assert.ok(Math.abs(p.angle - 65) <= GRIP_SLACK && Math.abs(degrees(p.along, p.tube) - p.angle) < 1e-6, 'the handle crosses the palm near the hold\'s angle');
    assert.equal(p.limited, false);
  }
  // The angles are those of the hand drawn against the forearm, and measured, not forced.
  const square = palmFrame(armAlong(vec3(1, 0, 0)), h, 'armR', { axis: vec3(0, 0, 1) });
  near(degrees(square.along, vec3(1, 0, 0)), Math.hypot(square.bend.flexion, square.bend.deviation), 1e-6, 'the wrist bend is the angle between hand and forearm');
  assert.ok(square.bend.deviation > 0, 'a handle square to the forearm cocks the hand towards the thumb (radial)');
  assert.ok(square.bend.flexion <= 0, 'and never flexes it: a power grip extends the wrist');
  // A handle along the forearm needs more ulnar deviation than the wrist has: reported, and the hand stops at the limit.
  const along = palmFrame(armAlong(vec3(1, 0, 0)), h, 'armR', { axis: vec3(1, 0, 0) });
  assert.equal(along.limited, true);
  assert.ok(along.needs.deviation < -WRIST.ulnar, `the hold needs ${along.needs.deviation.toFixed(1)}° of ulnar deviation`);
  near(along.bend.deviation, -WRIST.ulnar, 1e-9, 'the hand is drawn at the ulnar limit');
  near(degrees(along.along, vec3(1, 0, 0)), Math.hypot(along.bend.flexion, along.bend.deviation), 1e-6, 'and bent exactly that far');
  assert.ok(degrees(along.tube, vec3(1, 0, 0)) > 1, 'so the handle no longer runs along the finger tube');
  // A sweep: the drawn hand never passes the hard limits.
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    const p = palmFrame(armAlong(vec3(Math.cos(a), Math.sin(a) * 0.6, Math.sin(a) * 0.8)), h, 'armR', { axis: norm3(vec3(Math.sin(3 * a), Math.cos(a), 0.4)) });
    assert.ok(p.bend.flexion <= WRIST.flexion + 1e-9 && p.bend.flexion >= -WRIST.extension - 1e-9 && p.bend.deviation <= WRIST.radial + 1e-9 && p.bend.deviation >= -WRIST.ulnar - 1e-9, 'within the hard limits');
  }
  // An empty hand: straight on the forearm, palm to the body's middle.
  const empty = palmFrame(standing, h, 'armR');
  const [, elbow, wrist] = standing.chains.armR;
  near(degrees(empty.along, sub3(wrist, elbow)), 0, 1e-4, 'an empty hand is straight');
  assert.ok(dot3(empty.normal, scale3(frame.right, -1)) > 0.8, 'its palm towards the thigh');
  assert.throws(() => palmFrame(standing, h, 'tail'), /no arm "tail"/);
  console.log('✔ Palm frame: OpenXR axes, handedness, measured wrist angles and limits.');
}

// ---------------------------------------------------------------------------------------------
// Placement: the grip is in the palm, not at the wrist; without a hold nothing changes.
// ---------------------------------------------------------------------------------------------
{
  const swing: Pose = { ...standing, extra: { weaponYaw: 0.3, weaponPitch: 0.2 } };
  for (const pose of [standing, swing]) {
    const old = held(pose, h, 'armR', { length: 26 });
    assert.deepEqual(old.grip, pose.joints['armR.hand'], 'without a hold the grip is the wrist joint, as before');
    assert.equal(old.hold, undefined);
    assert.equal(old.palm, undefined);
    assert.equal(heldGrip(old), undefined, 'and no hand is given a grip for it');
    const sword = held(pose, h, 'armR', { length: 26, hold: SWORD });
    assert.ok(sword.palm && sword.hold && sword.handle);
    assert.deepEqual(sword.grip, sword.palm.at, 'with a hold the grip is the palm centroid');
    near(dist(sword.grip, pose.joints['armR.hand']), HAND.centroid * HAND.length * h.height, 1e-9, 'a fraction of the hand past the wrist');
    if (pose === swing) assert.deepEqual(sword.dir, old.dir, 'a direction the clip sets is never changed');
    near(dist(sword.tip, sword.grip), 26, 1e-9, 'the tip is `length` from the grip');
    near(dist(sword.handle.from, sword.grip), 2.2, 1e-9, 'the handle\'s middle is in the palm: 2.2 to the butt end');
    near(dist(sword.handle.to, sword.grip), 2.2, 1e-9, 'and 2.2 to the guard end');
    near(dot3(sub3(sword.handle.to, sword.handle.from), sword.dir), 4.4, 1e-9, 'the handle runs along the item');
    const g = heldGrip(sword)!;
    assert.deepEqual([g.at, g.axis, g.radius], [sword.grip, sword.dir, 1.5], 'the hand closes on the grip, round the handle');
    near(g.curl, curlFor(1.5, HAND.length * h.height), 1e-12);
    assert.ok(g.curl > 0 && g.curl < 1, 'a handle of some thickness keeps the fingers from closing all the way');
    near(degrees(sword.palm.tube, sword.dir), 0, 1e-9, 'the item runs along the finger tube');
  }
  assert.ok(curlFor(0, 8) === 1 && curlFor(100, 8) === 0 && curlFor(1, 8) > curlFor(2, 8), 'thinner handles let the fingers close further');
  const reversed = held(standing, h, 'armR', { length: 18, hold: { ...SWORD, kind: 'dagger', reverse: true } });
  assert.deepEqual(heldGrip(reversed)!.axis, scale3(reversed.dir, -1), 'a reversed hold comes out of the little finger\'s side');
  // The floor clamp reads the palm: a crouch that would sink the tip keeps it above the floor.
  const crouch = solvePose(h, frame, { root: [0, 0, -28] });
  const low = held(crouch, h, 'armR', { length: 30, hold: SWORD, floor: 1 });
  assert.ok(held(crouch, h, 'armR', { length: 30, hold: SWORD, floor: -100 }).tip.z < 0, 'unclamped, this tip would sink');
  assert.ok(low.tip.z >= 1 - 1e-6, 'the tip stays above the floor from where the palm is');
  assert.deepEqual(low.grip, low.palm!.at);
  // A fist lying on the floor rests on it: the palm tips up instead of going through.
  const lowWrist = armAlong(vec3(0, 0, -1)).chains.armR[2];
  const resting = palmFrame(armAlong(vec3(0, 0, -1)), h, 'armR', { axis: vec3(1, 0, 0), lowest: lowWrist.z - 1 });
  near(resting.at.z, lowWrist.z - 1, 1e-9, 'a hand pointing down tips up to the lowest height it may take');
  near(dist(resting.at, resting.wrist), HAND.centroid * HAND.length * h.height, 1e-9, 'about the wrist');
  assert.equal(resting.limited, true);
  // The same call gives the same result: deterministic.
  assert.deepEqual(held(swing, h, 'armR', { length: 26, hold: SWORD }), held(swing, h, 'armR', { length: 26, hold: SWORD }));
  // The hand turns smoothly as the item swings: no flip between nearby frames.
  let worst = 0;
  let previous: Vec3 | undefined;
  for (let i = 0; i <= 400; i++) {
    const yaw = -1.5 + (3 * i) / 400;
    const g = held({ ...standing, extra: { weaponYaw: yaw, weaponPitch: 0.6 * Math.sin(3 * yaw) } }, h, 'armR', { length: 26, hold: SWORD }).grip;
    if (previous) worst = Math.max(worst, dist(g, previous));
    previous = g;
  }
  assert.ok(worst < 0.15, `the palm moves smoothly as the blade sweeps (worst step ${worst.toFixed(3)})`);
  // A grip on what `held` does not place (a shield's strap): the palm of the hand where it is.
  const strap = palmGrip(standing, h, 'armL', { axis: vec3(0, 0, 1), radius: 0.6, behind: vec3(0, -1, 0), weight: 0.5 });
  assert.deepEqual(strap.at, palmFrame(standing, h, 'armL', { axis: vec3(0, 0, 1) }).at);
  assert.deepEqual(strap.behind, vec3(0, -1, 0));
  near(strap.curl, 0.5 * curlFor(0.6, HAND.length * h.height), 1e-12, 'the weight opens the fingers');
  console.log('✔ Placement: the grip in the palm, the handle round it, unchanged without a hold.');
}

// ---------------------------------------------------------------------------------------------
// At rest the hand turns what it holds to where the wrist is comfortable; a clip that lets go drops it.
// ---------------------------------------------------------------------------------------------
{
  const comfortable = (n: { flexion: number; deviation: number }) => Math.max(Math.abs(n.flexion) / WRIST.comfort, Math.abs(n.deviation) / (WRIST.comfort / 2)) <= 1 + 1e-6;
  // The default rest, low and forward, as a clip would set it: the engine never turns that, and the wrist strains.
  const r = norm3(vec3(0.55, 0.3, -0.75));
  const fromClip = held({ ...standing, extra: { weaponYaw: Math.atan2(r.y, r.x), weaponPitch: Math.asin(r.z) } }, h, 'armR', { length: 26, hold: SWORD });
  assert.ok(!comfortable(fromClip.palm!.needs), 'set by a clip, the default rest strains this wrist');
  // The same rest chosen by the engine (no clip angle): turned until the wrist is comfortable, as little as that takes.
  const atRest = held(standing, h, 'armR', { length: 26, hold: SWORD });
  assert.ok(comfortable(atRest.palm!.needs) && !atRest.palm!.limited, 'chosen by the engine, it turns until the wrist is comfortable');
  const turned = degrees(atRest.dir, fromClip.dir);
  assert.ok(turned > 1 && turned < 90, `and it turns, but not all the way round (${turned.toFixed(1)}°)`);
  // A rest the hand already holds comfortably is kept exactly.
  const easy = restAxis(standing, h, 'armR', atRest.dir, resolveHold(SWORD, h));
  assert.deepEqual(easy, norm3(atRest.dir), 'a rest the wrist holds comfortably is kept as it is');
  // Without a hold nothing turns (old behaviour).
  assert.deepEqual(held(standing, h, 'armR', { length: 26 }).dir, norm3(standing.frame.dir(0.55, 0.3, -0.75)), 'an item without a hold rests where it always did');

  // Lying down alone lets go of nothing: a prone body keeps what it holds in its hand.
  const prone = solvePose(h, frame, { root: [0, 0, -28], pitch: 80 });
  const kept = held(prone, h, 'armR', { length: 26, hold: SWORD });
  assert.ok(kept.released === undefined && heldGrip(kept) !== undefined, 'a prone body keeps its item in hand');
  assert.deepEqual(kept.grip, kept.palm!.at, 'in the palm');
  // The clip lets go (`<channel>Release`): the item settles flat on the floor; each hand reads its own channel.
  const dropped = held({ ...prone, extra: { weaponRelease: 1 } }, h, 'armR', { length: 26, hold: SWORD });
  assert.equal(dropped.released, 1, 'the clip lets go');
  assert.equal(held({ ...prone, extra: { weaponRelease: 1 } }, h, 'armL', { length: 26, hold: SWORD, channel: 'offWeapon' }).released, undefined, 'the off hand reads its own channel');
  // The death preset lets go with both hands: the fingers open on the way and the item settles flat on the floor.
  const dead = solvePose(h, frame, death(h).drive(0.99));
  assert.ok((held(dead, h, 'armL', { length: 26, hold: SWORD, channel: 'offWeapon' }).released ?? 0) > 0.999, 'the off hand lets go too');
  const fallen = held(dead, h, 'armR', { length: 26, hold: SWORD });
  assert.ok((fallen.released ?? 0) > 0.999, 'at the end of a death the hand has let go');
  assert.equal(heldGrip(fallen), undefined, 'and is given no grip: it opens');
  near(fallen.dir.z, 0, 1e-9, 'the item lies flat');
  near(fallen.grip.z, SWORD.handle!.radius!, 1e-9, 'on the floor');
  let midway: ReturnType<typeof held> | undefined;
  for (let t = 0; t <= 1 && !midway; t += 0.02) {
    const item = held(solvePose(h, frame, death(h).drive(t)), h, 'armR', { length: 26, hold: SWORD });
    if ((item.released ?? 0) > 0.2 && (item.released ?? 0) < 0.8) midway = item;
  }
  assert.ok(midway, 'part way through the fall the hand is letting go');
  near(heldGrip(midway!)!.curl, curlFor(1.5, HAND.length * h.height) * (1 - midway!.released!), 1e-12, 'its fingers half open');
  // Through the whole fall the fist stays in the palm while the item leaves it, and the item never goes under the floor.
  for (let t = 0; t <= 1; t += 0.02) {
    const item = held(solvePose(h, frame, death(h).drive(t)), h, 'armR', { length: 26, hold: SWORD, floor: 1 });
    const fist = heldGrip(item);
    if (fist) assert.deepEqual(fist.at, item.palm!.at, `t ${t.toFixed(2)}: the fist is in the palm`);
    assert.ok(Math.min(item.tip.z, item.butt.z) >= 1 - 1e-9, `t ${t.toFixed(2)}: the blade stays above the floor (tip ${item.tip.z.toFixed(2)})`);
  }
  assert.equal(held(standing, h, 'armR', { length: 26, hold: SWORD }).released, undefined, 'standing, nothing is let go');
  console.log('✔ Rest and release: the engine turns an item to a comfortable wrist, and the clip lets go, not lying down.');
}

// ---------------------------------------------------------------------------------------------
// The second hand: two-bone IK to the second grip, clamped reach, slide, release, weight.
// ---------------------------------------------------------------------------------------------
{
  const guardPose = (extra: Record<string, number> = {}, left: Local = [10, -3, 37]): Pose =>
    solvePose(h, frame, { arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: left } }, extra: { weaponYaw: 0, weaponPitch: 0.5, ...extra } } satisfies Drive);
  const lengthsOf = (p: Pose, arm: string) => {
    const c = p.chains[arm];
    return [dist(c[0], c[1]), dist(c[1], c[2])];
  };
  const pose = guardPose();
  const longsword = held(pose, h, 'armR', { length: 30, hold: { kind: 'two-hand-blade' } });
  const s = secondHand(pose, h, longsword, 1)!;
  assert.equal(s.arm, 'armL', 'the other hand moves');
  assert.ok(s.fraction >= 0 && s.fraction <= 0.35, 'onto the second grip\'s range');
  near(s.gap, 0, 0.05, 'the palm reaches the grip');
  assert.equal(s.weight, 1);
  assert.equal(s.released, false);
  assert.ok(s.grip);
  near(dist(s.grip.palm.at, s.target), 0, 0.05, 'the hand\'s palm is on the handle');
  assert.deepEqual(s.grip.axis, longsword.dir, 'and closes round the handle');
  assert.deepEqual(lengthsOf(s.pose, 'armL').map(x => Math.round(x * 1e6) / 1e6), h.arms![0].lengths, 'the arm keeps its bones');
  assert.equal(s.pose.chains.armR, pose.chains.armR, 'the holding hand drives: its arm is not moved');
  assert.deepEqual(s.pose.joints['armL.hand'], s.pose.chains.armL[2], 'joints and chains agree');
  // Out of reach: clamped, never stretched, and the hand lets go.
  const far = held(pose, h, 'armR', { length: 30, hold: { kind: 'two-hand-blade', handle: { length: 60 }, grip: 1, second: 0 } });
  const gone = secondHand(pose, h, far, 1)!;
  assert.ok(gone.gap > h.height / 24, 'the far grip is out of reach');
  assert.equal(gone.released, true);
  assert.equal(gone.weight, 0);
  assert.equal(gone.grip, undefined, 'a hand that lets go gets no grip');
  assert.equal(gone.pose, pose, 'and keeps the clip\'s pose');
  // A grip a little out of reach: the arm reaches full length at most, and the hand fades out.
  const reach = h.arms![0].lengths[0] + h.arms![0].lengths[1];
  for (const length of [28, 34, 40]) {
    const item = held(pose, h, 'armR', { length: 30, hold: { kind: 'two-hand-blade', handle: { length }, grip: 1, second: 0 } });
    const r = secondHand(pose, h, item, 1)!;
    const c = r.pose.chains.armL;
    assert.ok(dist(c[0], c[2]) <= reach + 1e-6, 'never stretched past full length');
    assert.deepEqual(lengthsOf(r.pose, 'armL').map(x => Math.round(x * 1e6) / 1e6), h.arms![0].lengths);
    assert.ok(r.weight >= 0 && r.weight <= 1);
  }
  // A range: the grip slides along it to come within reach.
  const spear = held(pose, h, 'armR', { length: 30, rest: [1, 0, 0], hold: { kind: 'spear', handle: { length: 120 }, grip: 0.3, second: [0.3, 1] } });
  const reaching = solvePose(h, frame, { arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: [40, -9, 45] } }, extra: { weaponYaw: 0, weaponPitch: 0 } });
  const slid = secondHand(reaching, h, held(reaching, h, 'armR', { length: 30, hold: { kind: 'spear', handle: { length: 120 }, grip: 0.3, second: [0.3, 1] } }), 1)!;
  assert.equal(slid.slid, true, 'the hand the clip reaches far ahead slides back along the shaft');
  assert.equal(slid.released, false);
  near(slid.gap, 0, 0.05, 'and holds it');
  assert.ok(slid.fraction > 0.3 && slid.fraction < 1);
  const fixed = secondHand(pose, h, spear, 1);
  assert.ok(fixed && fixed.fraction >= 0.3);
  // The clip lets go with `extra.secondGrip`.
  const loose = secondHand(guardPose({ secondGrip: 0 }), h, held(guardPose({ secondGrip: 0 }), h, 'armR', { length: 30, hold: { kind: 'two-hand-blade' } }), 1)!;
  assert.equal(loose.weight, 0);
  assert.equal(loose.grip, undefined);
  const half = guardPose({ secondGrip: 0.5 });
  const halfway = secondHand(half, h, held(half, h, 'armR', { length: 30, hold: { kind: 'two-hand-blade' } }), 1)!;
  near(halfway.weight, 0.5, 1e-9);
  assert.ok(halfway.grip && halfway.grip.curl < s.grip.curl, 'a hand letting go opens');
  const clipWrist = half.chains.armL[2];
  const wristAt = halfway.pose.chains.armL[2];
  assert.ok(dist(wristAt, clipWrist) > 0.1 && dist(wristAt, s.pose.chains.armL[2]) > 0.1, 'and is on its way between the clip\'s hand and the grip');
  // No second grip, or no other arm: nothing to do.
  assert.equal(secondHand(pose, h, held(pose, h, 'armR', { length: 26, hold: SWORD }), 1), undefined);
  assert.equal(secondHand(pose, h, held(pose, h, 'armR', { length: 26 }), 1), undefined);
  console.log('✔ Second hand: IK onto the grip, never stretched, slides, lets go, weighted by the clip.');
}

// ---------------------------------------------------------------------------------------------
// The wrist: a hand within the limits is chosen when one exists, and what a hold needs is its least.
// ---------------------------------------------------------------------------------------------
{
  // The engine's walk with the default rest: the hand that strains least would pass the ulnar limit
  // in some frames, but another hand holds the sword within the limits there.
  const walk = locomotion(h, 'walk');
  let within = 0;
  let frames = 0;
  for (let d = 0; d < 8; d++) {
    for (let f = 0; f < 12; f++) {
      const pose = solvePose(h, Frame3.facing(vec3(0, 0, 0), Math.PI / 2 + (d * Math.PI) / 4), walk.drive(f / 12));
      const p = held(pose, h, 'armR', { length: 26, hold: { kind: 'one-hand-blade', handle: { length: 4.4, radius: 0.75 } } }).palm!;
      frames++;
      // Within the limits to the solver's half a degree: the hand is not limited, the handle runs along its finger tube.
      if (!p.limited && p.needs.flexion <= WRIST.flexion + 0.5 && -p.needs.flexion <= WRIST.extension + 0.5 && p.needs.deviation <= WRIST.radial + 0.5 && -p.needs.deviation <= WRIST.ulnar + 0.5) within++;
    }
  }
  assert.equal(within, frames, 'a hand within the wrist\'s limits holds the sword in every frame of the walk');
  // No hand can hold a handle pointing back up the forearm: it stays limited, and what it needs is past the limits.
  const up = palmFrame(standing, h, 'armR', { axis: vec3(0, 0, 1) });
  assert.equal(up.limited, true);
  assert.ok(Math.max(up.needs.flexion - WRIST.flexion, -up.needs.flexion - WRIST.extension, up.needs.deviation - WRIST.radial, -up.needs.deviation - WRIST.ulnar) > 0);
  console.log('✔ Wrist: a hand within the limits is preferred; an impossible hold stays measured past them.');
}

// ---------------------------------------------------------------------------------------------
// Outfits: hand parts receive grips; a two-handed item moves the other arm; empty hands unchanged.
// ---------------------------------------------------------------------------------------------
{
  const noop: Part = () => {};
  const seen: { side: number; grip?: Grip; wrist: Vec3 }[] = [];
  const hand: Part = ctx => void seen.push({ side: ctx.at.side, grip: ctx.grip, wrist: ctx.pose.joints[ctx.at.side < 0 ? 'armL.hand' : 'armR.hand'] });
  const length = [{ key: 'length', label: 'Length', type: 'number' as const, default: 26, min: 10, max: 40 }];
  const swordHeld = (pose: Pose, skeleton = h, side: -1 | 1 = 1, l = 26) => held(pose, skeleton, side < 0 ? 'armL' : 'armR', { length: l, hold: SWORD });
  const LONGSWORD: Hold = { kind: 'two-hand-blade', handle: { length: 12 } };
  const catalog: GearCatalog = {
    parts: [
      { id: 'sword', label: 'Sword', group: 'weapons', part: noop, slots: ['hand'], roles: [], options: length, wield: { class: 'blade', hold: SWORD, held: (pose, sk, p) => swordHeld(pose, sk, p.side, p.options.length as number) } },
      { id: 'club', label: 'Club', group: 'weapons', part: noop, slots: ['hand'], roles: [], wield: { class: 'blade' } },
      { id: 'longsword', label: 'Longsword', group: 'weapons', part: noop, slots: ['hand'], roles: [], wield: { class: 'blade', hands: 2, hold: LONGSWORD, held: (pose, sk, p) => held(pose, sk, p.side < 0 ? 'armL' : 'armR', { length: 30, hold: LONGSWORD }) } },
      { id: 'buckler', label: 'Buckler', group: 'shields', part: noop, slots: ['forearm'], roles: [], wield: { class: 'shield', offHand: 'hold', grip: (pose, sk, p) => [palmGrip(pose, sk, p.side < 0 ? 'armL' : 'armR', { axis: vec3(0, 0, 1), radius: 0.8, behind: vec3(0, -1, 0) })] } },
      { id: 'hand', label: 'Hand', group: 'bodies', part: hand, slots: ['hand'], roles: [] },
    ],
    bases: [],
    materials: {},
  };
  const hands = [{ part: 'hand', slot: 'hand' as const, side: -1 as const }, { part: 'hand', slot: 'hand' as const, side: 1 as const }];
  const kit = (pose: Pose) => ({ camera: new Camera(), skeleton: h, clip: idle(h), t: 0, poseAt: () => pose });
  const dress = (pieces: { part: string; slot: 'hand' | 'forearm'; side: -1 | 1; options?: Record<string, unknown> }[], pose = standing) => {
    seen.length = 0;
    outfitFromData({ materials: {}, pieces }, catalog)(new Stage(new Camera()).object(), pose, kit(pose));
    return [...seen];
  };
  const swing: Pose = { ...standing, extra: { weaponYaw: 0.2, weaponPitch: 0.3 } };
  // Empty hands get nothing, and see the pose as solved.
  const bare = dress(hands, swing);
  assert.deepEqual(bare.map(s => s.grip), [undefined, undefined], 'empty hands get no grip');
  assert.deepEqual(bare.map(s => s.wrist), [swing.joints['armL.hand'], swing.joints['armR.hand']], 'and stay where the clip put them');
  assert.equal(outfitHolds({ materials: {}, pieces: hands }, catalog).length, 0, 'an outfit holding nothing has no holds');
  // A sword in the right hand: its hand closes on the grip, with the piece's options.
  const armed = dress([{ part: 'sword', slot: 'hand', side: 1, options: { length: 30 } }, ...hands], swing);
  assert.equal(armed[0].grip, undefined, 'the left hand is empty');
  assert.deepEqual(armed[1].grip!.at, swordHeld(swing, h, 1, 30).grip, 'the right hand closes where the sword is');
  assert.deepEqual(armed[1].grip!.axis, swordHeld(swing).dir);
  // An item without `held` or `grip` leaves its hand as it was.
  assert.deepEqual(dress([{ part: 'club', slot: 'hand', side: 1 }, ...hands]).map(s => s.grip), [undefined, undefined], 'a held part that says nothing leaves the hand open');
  // A part placed on the forearm gives its own grip, with the surface it is behind.
  const shielded = dress([{ part: 'buckler', slot: 'forearm', side: -1 }, ...hands]);
  assert.deepEqual(shielded[0].grip!.behind, vec3(0, -1, 0), 'the hand behind a shield closes on its strap');
  // Two hands on a longsword: the other hand gets the second grip, and its arm moves in the pose every piece sees.
  const guard = solvePose(h, frame, { arms: { armR: { target: [12, 3, 40], elbow: [0, 0.7, -1] }, armL: { target: [10, -3, 37] } }, extra: { weaponYaw: 0, weaponPitch: 0.5 } });
  const both = dress([{ part: 'longsword', slot: 'hand', side: 1 }, ...hands], guard);
  const item = held(guard, h, 'armR', { length: 30, hold: LONGSWORD });
  const second = secondHand(guard, h, item, 1)!;
  assert.deepEqual(both[1].grip!.at, item.grip, 'the right hand holds the guard end');
  assert.deepEqual(both[0].grip!.at, second.target, 'the left hand closes on the second grip');
  assert.deepEqual(both[0].wrist, second.pose.joints['armL.hand'], 'the left arm reached it in the pose the parts are drawn with');
  assert.notDeepEqual(both[0].wrist, guard.joints['armL.hand']);
  // A base body sees that pose too, and kit.poseAt.
  const bases: Vec3[] = [];
  outfit({ base: (_o, p, k) => void bases.push(p.joints['armL.hand'], k.poseAt(0).joints['armL.hand']), materials: {}, pieces: [], holds: outfitHolds({ materials: {}, pieces: [{ part: 'longsword', slot: 'hand', side: 1 }] }, catalog) })(new Stage(new Camera()).object(), guard, kit(guard));
  assert.deepEqual(bases, [second.pose.joints['armL.hand'], second.pose.joints['armL.hand']]);
  // holdPose says it all at once.
  const state = holdPose(guard, h, outfitHolds({ materials: {}, pieces: [{ part: 'longsword', slot: 'hand', side: 1 }] }, catalog));
  assert.deepEqual(state.grips.map(g => g.side).sort(), [-1, 1]);
  assert.equal(state.second.length, 1);
  assert.equal(holdPose(guard, h, []).pose, guard, 'no holds: the pose itself');
  // A code outfit lists what it holds.
  const code = outfit({ materials: {}, pieces: [{ part: hand, slot: 'hand', side: 1 }], holds: [{ side: 1, held: pose => swordHeld(pose) }] });
  seen.length = 0;
  code(new Stage(new Camera()).object(), swing, kit(swing));
  assert.deepEqual(seen[0].grip!.at, swordHeld(swing).grip);
  // A character measures its sockets on the moved pose: a socket on the other hand follows it.
  const character = defineCharacter({
    name: 'fencer', skeleton: h, camera: new Camera(), width: 64, height: 96, pivot: { x: 32, y: 80 }, frames: 1,
    clips: { idle: idle(h) }, sockets: { off: pose => pose.joints['armL.hand'] },
    outfit: { data: { materials: {}, pieces: [{ part: 'longsword', slot: 'hand', side: 1 }, ...hands] }, catalog },
  });
  const sheet = character.sheet('idle');
  const table = (sheet.data as { sockets: { names: string[]; frames: Record<string, [number, number, number][]> } }).sockets;
  const unarmed = defineCharacter({
    name: 'fencer', skeleton: h, camera: new Camera(), width: 64, height: 96, pivot: { x: 32, y: 80 }, frames: 1,
    clips: { idle: idle(h) }, sockets: { off: pose => pose.joints['armL.hand'] },
    outfit: { data: { materials: {}, pieces: hands }, catalog },
  });
  const plain = (unarmed.sheet('idle').data as typeof sheet.data & { sockets: typeof table }).sockets;
  const i = table.names.indexOf('off');
  assert.notDeepEqual(table.frames.S_0[i], plain.frames.S_0[i], 'the off socket moved with the hand on the second grip');
  assert.deepEqual(table.frames.S_0[table.names.indexOf('head')], plain.frames.S_0[plain.names.indexOf('head')], 'and nothing else did');
  console.log('✔ Outfits: grips for the hands that hold, the second hand moved, empty hands unchanged.');
}

console.log('\n✨ Holding-items tests passed.\n');
